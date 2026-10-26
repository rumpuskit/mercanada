import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import catalog from "../../data/catalog.json";
import * as sim from "./sim.js";
import { World } from "./world/layout.js";
import { buildTerrain, buildWater } from "./world/terrain.js";
import { buildGrounds, buildRoads } from "./world/roads.js";
import { buildCity } from "./world/city.js";
import { buildClouds, buildTrees, driftClouds, fadeTrees } from "./world/nature.js";
import { buildLabels, scaleLabels } from "./world/labels.js";
import { People } from "./world/people.js";
import { createSky } from "./world/sky.js";
import { Dollhouse } from "./world/interior.js";
import { createLampLight } from "./world/lighting.js";
import * as P from "./world/palette.js";
import { createUI } from "./ui.js";
import { createMapUI } from "./mapui.js";
import { NameTags } from "./world/nametags.js";
import { Traffic, Vehicles, buildStops } from "./world/traffic.js";
import { buildHarbor } from "./world/harbor.js";
import { Stories } from "./world/story.js";
import { Ambience } from "./sound.js";
import "./style.css";

sim.setCatalog(catalog);

const params = new URLSearchParams(location.search);
const nowUnix = () => Date.now() / 1000;

// Örnek sakinler: gerçek takipçi verisi bağlanana kadar. Erken gelenler küçük sıra numarası alır.
const today = sim.dayOf(nowUnix());
const population = Math.max(1, Math.min(60000, Number(params.get("nufus")) || 3200));
const residents = Array.from({ length: population }, (_, i) => {
  const handle = `sakin_${String(i).padStart(4, "0")}`;
  return { handle, seed: sim.seedOf(handle), slot: i, arrived_day: today - Math.floor(90 * (1 - i / population)) };
});

// --- sahne ---
const canvas = document.getElementById("scene");
const mobile = Math.min(innerWidth, innerHeight) < 700;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.getElementById("loading").textContent = "Tarayıcın 3B çizimi desteklemiyor (WebGL).";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 20000);
// Derinlik hassasiyeti: yakın ve uzak düzlem kamera uzaklığıyla birlikte ayarlanır; üst üste yakın
// yüzeyler (yol, kaldırım, çizgi) uzaktan bakınca titremesin.
function fitDepth(dist) {
  const near = THREE.MathUtils.clamp(dist * 0.02, 0.2, 25);
  const far = Math.max(8000, dist * 30);
  if (Math.abs(camera.near - near) / near > 0.1 || camera.far !== far) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.22;
controls.minDistance = 6;
controls.maxDistance = 3200;
controls.zoomToCursor = true;

const T0 = performance.now();
const world = new World(population);
const T1 = performance.now();
const roads = buildRoads(world);
const T2 = performance.now();
const terrain = buildTerrain(world);
const T3 = performance.now();
const grounds = buildGrounds(world);
const water = buildWater(world);
const harbor = buildHarbor(world);
scene.add(water, terrain, roads, grounds, harbor);
const city = buildCity(world);
const T4 = performance.now();
const trees = buildTrees(world);
const T5 = performance.now();
const lampLight = createLampLight(world, world.lampSpots,
  [terrain.material, ...roads.userData.groundMaterials, ...grounds.userData.groundMaterials],
  { wallMaterials: city.wallMaterials });
scene.add(city.group, trees);
const clouds = buildClouds(world);
const labels = buildLabels(world);
scene.add(clouds, labels);
const T6 = performance.now();
const traffic = new Traffic(world);
const T7 = performance.now();
scene.add(buildStops(traffic, world));
const vehicles = new Vehicles(Math.ceil(population * 0.4) + 80, 40);
scene.add(vehicles.group);
const people = new People(world, residents, traffic);
const stories = new Stories(people);
people.stories = stories;
const T8 = performance.now();
if (params.has("denetle")) console.info(`süreler: dünya ${Math.round(T1 - T0)} yollar ${Math.round(T2 - T1)} arazi ${Math.round(T3 - T2)} şehir ${Math.round(T4 - T3)} ağaçlar ${Math.round(T5 - T4)} trafik ${Math.round(T7 - T6)} insanlar ${Math.round(T8 - T7)}`);
scene.add(people.group);
const dollhouse = new Dollhouse(world, city, people, scene);
people.dollhouse = dollhouse;
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(2048, 2048);

// Ortam sesleri: düğmeyle açılır (tarayıcılar sesi ancak bir dokunuşla başlatır).
const ambience = new Ambience();
const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  if (ambience.enabled) { ambience.stop(); soundBtn.textContent = "🔇"; }
  else { ambience.start(); soundBtn.textContent = "🔊"; }
});
const limanZ = world.coastPoint(0, 60, 0, 1)[1];
function soundEnv(dist, light, minute) {
  const t = controls.target;
  let near = 0;
  const P = people.positions;
  for (let i = 0; i < residents.length; i++) {
    if (!people.visible[i]) continue;
    const dx = P[i * 3] - t.x, dz = P[i * 3 + 2] - t.z;
    if (dx * dx + dz * dz < 35 * 35) near++;
  }
  let traffic = 0;
  for (const v of people.vehicleStates) if (Math.hypot(v.x - t.x, v.z - t.z) < 70) traffic++;
  const cell = world.cellByKey.get(`${Math.round(t.x / 560)},${Math.round(t.z / 270)}`);
  const inPark = world.parks.some((q) => t.x > q.x0 - 20 && t.x < q.x1 + 20 && t.z > q.z0 - 20 && t.z < q.z1 + 20) || world.plazas.some((q) => q.kind === "park" && t.x > q.x0 && t.x < q.x1 && t.z > q.z0 && t.z < q.z1);
  return {
    dist, minute, day: light, people: near, traffic,
    coast: Math.max(0, world.margin(t.x, t.z) - world.sdf(t.x, t.z)),
    fountain: Math.hypot(t.x, t.z),
    harbor: Math.hypot(t.x, t.z - limanZ),
    nature: inPark || !cell || cell.type === "tepe" || cell.type === "kir" ? 1 : 0.35,
    match: people.ball ? Math.hypot(t.x - world.pitch.cx, t.z - world.pitch.cz) : null,
  };
}

// Maç topu.
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.6, flatShading: true }));
ball.castShadow = true;
scene.add(ball);

// Seçili sakin işareti.
const marker = new THREE.Group();
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#e0607a", toneMapped: false }));
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#e0607a", transparent: true, opacity: 0.8, toneMapped: false, depthTest: false }));
marker.add(pin, ring);
marker.visible = false;
scene.add(marker);

// Başlangıç görünümü: merkez ve ilk mahalleler.
const home = new THREE.Vector3(0, 0, -60);
controls.target.copy(home);
const aspectBoost = innerWidth < innerHeight ? 1.9 : 1;
camera.position.set(260 * aspectBoost, 230 * aspectBoost, 330 * aspectBoost).add(home);
controls.update();

// --- zaman ---
let speed = Number(params.get("hiz")) || 1;
let simBase = nowUnix();
let realBase = performance.now() / 1000;
const fixed = params.get("saat")?.match(/^(\d{1,2}):(\d{2})$/);
if (fixed) simBase = today * 86400 - sim.TZ_OFFSET + Number(fixed[1]) * 3600 + Number(fixed[2]) * 60;
const simNow = () => simBase + (performance.now() / 1000 - realBase) * speed;
function setSpeed(next) {
  simBase = simNow();
  realBase = performance.now() / 1000;
  speed = next;
}

// --- kamera uçuşu ---
let flight = null;
function flyTo(x, y, z, distance = 120, direction = null) {
  const dir = direction ? direction.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  if (!direction && dir.y < 0.45) dir.setY(0.45).normalize();
  flight = {
    t: 0,
    fromT: controls.target.clone(), toT: new THREE.Vector3(x, y, z),
    fromC: camera.position.clone(), toC: new THREE.Vector3(x, y, z).addScaledVector(dir, distance),
  };
}

const nameTags = new NameTags(scene);
if (params.has("denetle")) globalThis.__ada = { world, people, traffic, residents };
const busColors = traffic.lines.map((l) => new THREE.Color(l.color));
const ui = createUI({ residents, people, world, dollhouse, stories, setSpeed, flyTo, speed, today: () => sim.dayOf(simNow()), minute: () => sim.minuteOf(simNow()) });
const mapUI = createMapUI({ world, camera, controls, flyTo });

// Bir sakine dokununca kartını aç.
const raycaster = new THREE.Raycaster();
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const index = people.pick(raycaster);
  if (index != null) return ui.select(index, false);
  const building = city.pickBuilding(raycaster);
  if (building) ui.openBuilding(building);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// --- pencereler ve lambalar ---
const tmpColor = new THREE.Color();
const LAMP_OFF = new THREE.Color("#cfd6de");
function updateWindows(minute, light, sunDeg) {
  const night = 1 - light;
  const { windows, windowOwners } = city;
  for (let i = 0; i < windowOwners.length; i++) {
    const o = windowOwners[i];
    let lit;
    if (o.slot != null) lit = o.slot < population && people.athome[o.slot] === 1;
    else if (o.workplace === "otel" || o.workplace === "saglik") lit = (o.seed * 7) % 5 < 3;
    else lit = minute > 470 && minute < 1380 && (o.seed * 5) % 7 < 5;
    tmpColor.copy(P.WINDOW_DAY).lerp(lit ? P.WINDOW_NIGHT : P.WINDOW_DARK, night);
    windows.setColorAt(i, tmpColor);
  }
  windows.instanceColor.needsUpdate = true;
  // Lambalar güneş ufkun altına inince yanar.
  const on = sunDeg < -1.5;
  for (const m of roads.userData.lampHeads) m.color.copy(LAMP_OFF).lerp(P.WINDOW_NIGHT, on ? 1 : 0);
  lampLight.setNight(on ? Math.min(1, (-1.5 - sunDeg) / 6 + 0.35) : 0);
}

// --- döngü ---
let frame = 0;
let lastReal = performance.now() / 1000;
const bounds = world.bounds;
function tick() {
  const real = performance.now() / 1000;
  const dt = Math.min(0.1, real - lastReal);
  lastReal = real;
  const unix = simNow();
  const day = sim.dayOf(unix);
  const minute = sim.minuteOf(unix);
  const U0 = performance.now();
  people.setDay(day);
  const U1 = performance.now();
  people.update(minute, real);
  if (frame < 3 && params.has("denetle")) console.info(`kare ${frame}: gün ${Math.round(U1 - U0)} ms, güncelleme ${Math.round(performance.now() - U1)} ms`);
  city.setOpenDoors(people.openDoors);
  ball.visible = !!people.ball;
  if (people.ball) ball.position.set(people.ball[0], world.groundY(people.ball[0], people.ball[1]) + people.ball[2], people.ball[1]);
  // Araçlar: sürülenler, park halindekiler ve otobüsler.
  vehicles.begin();
  for (const v of people.vehicleStates) vehicles.addCar(v.x, world.groundY(v.x, v.z), v.z, v.heading, v.color, v.taxi);
  for (const [slot, color] of people.parked) {
    const s = traffic.slots[slot];
    vehicles.addCar(s.x, world.groundY(s.x, s.z), s.z, s.heading, color);
  }
  for (const b of traffic.buses(minute)) vehicles.addBus(b.x, world.groundY(b.x, b.z), b.z, b.heading, busColors[b.line]);

  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 1.3);
    const k = 1 - (1 - flight.t) ** 3;
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    camera.position.lerpVectors(flight.fromC, flight.toC, k);
    if (flight.t >= 1) flight = null;
  }
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, bounds.x0 - 200, bounds.x1 + 200);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, bounds.z0 - 200, bounds.z1 + 300);
  controls.target.y = flight || dollhouse.isOpen() ? controls.target.y : THREE.MathUtils.lerp(controls.target.y, Math.max(0, world.height(controls.target.x, controls.target.z)), 0.1);
  controls.update();

  const skyState = sky.update(day, minute, controls.target);
  const light = skyState.light;
  const dist = camera.position.distanceTo(controls.target);
  fitDepth(dist);
  const size = THREE.MathUtils.clamp(dist * 0.8, 25, 1400);
  const sc = sky.sun.shadow.camera;
  if (sc.right !== size) {
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.near = 1; sc.far = 2400;
    sc.updateProjectionMatrix();
  }
  if (frame % 6 === 0) updateWindows(minute, light, skyState.sunDeg);
  dollhouse.update(1 - light, real);
  vehicles.end(1 - light);
  if (frame % 15 === 0) ui.tick(unix, minute, day, skyState.times);
  if (frame % 8 === 0 && ambience.enabled) ambience.update(soundEnv(dist, light, minute));
  driftClouds(clouds, dt);
  water.userData.tick(real);
  harbor.userData.tick(real);
  fadeTrees(trees, dist);
  // Telefonda kart ekranın altını kapatır; görüntüyü yukarı kaydır.
  const cardOpen = !document.getElementById("card").hidden;
  if (cardOpen && innerWidth < 900) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();
  scaleLabels(labels, camera);

  const sel = ui.selected();
  if (sel != null) {
    marker.visible = true;
    const [x, z] = people.focusPoint(sel);
    const y = people.visible[sel] ? people.positions[sel * 3 + 1] : world.groundY(x, z);
    marker.position.set(x, y, z);
    pin.position.y = 2.6 + Math.sin(real * 3) * 0.15;
    ring.scale.setScalar(1 + (real % 1.2) * 0.4);
  } else {
    marker.visible = false;
  }

  tryFollow();
  nameTags.update(camera, controls.target, people, residents, ui.selected());
  mapUI.update(real);
  renderer.render(scene, camera);
  if (frame === 1) {
    document.getElementById("loading").classList.add("done");
    console.info(`Mercanada hazır: ${Math.round(performance.now())} ms`);
  }
  frame++;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ?bak=x,z,uzaklık: kamerayı bir noktaya çevirir (ekran görüntüsü ve paylaşım için).
const look = params.get("bak")?.split(",").map(Number);
if (look?.length >= 2 && look.every(Number.isFinite)) {
  const [lx, lz, ld = 60] = look;
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(lx, world.groundY(lx, lz), lz);
  camera.position.copy(controls.target).addScaledVector(dir, ld);
}

const wanted = params.get("bul");
if (wanted) setTimeout(() => ui.find(wanted), 300);

// ?takip=yol|meydan|is|<hobi>[:sıra]: o anda bunu yapan (görünür) bir sakini seçer — denetim ve paylaşım için.
const follow = params.get("takip");
let followDone = !follow;
function tryFollow() {
  if (followDone || frame < 3) return;
  followDone = true;
  const [what, nth = "0"] = follow.split(":");
  const hits = [];
  for (let i = 0; i < residents.length; i++) {
    const a = people.activities[i];
    if (!people.visible[i] || !a) continue;
    if (a.ne === what || (a.ne === "hobi" && people.hobbies[i].id === what)) hits.push(i);
  }
  console.info(`takip ${what}: ${hits.length} kişi`);
  if (hits.length) ui.select(hits[Number(nth) % hits.length]);
}
