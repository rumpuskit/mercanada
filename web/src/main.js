import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import catalog from "../../data/catalog.json";
import * as sim from "./sim.js";
import { World } from "./world/layout.js";
import { buildGrounds, buildRoads, buildTerrain, buildWater } from "./world/terrain.js";
import { buildCity } from "./world/city.js";
import { buildClouds, buildTrees, driftClouds } from "./world/nature.js";
import { buildLabels, scaleLabels } from "./world/labels.js";
import { People } from "./world/people.js";
import { createSky } from "./world/sky.js";
import * as P from "./world/palette.js";
import { createUI } from "./ui.js";
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
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 2, 14000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.22;
controls.minDistance = 25;
controls.maxDistance = 1900;
controls.zoomToCursor = true;

const world = new World(population);
scene.add(buildWater(), buildTerrain(world), buildRoads(world), buildGrounds(world));
const city = buildCity(world);
scene.add(city.group, buildTrees(world));
const clouds = buildClouds(world);
const labels = buildLabels(world);
scene.add(clouds, labels);
const people = new People(world, residents);
scene.add(people.group);
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(2048, 2048);

// Seçili sakin işareti.
const marker = new THREE.Group();
const pin = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.6, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#e0607a", toneMapped: false }));
const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#e0607a", transparent: true, opacity: 0.8, toneMapped: false, depthTest: false }));
marker.add(pin, ring);
marker.visible = false;
scene.add(marker);

// Başlangıç görünümü: merkez ve ilk mahalleler.
const home = new THREE.Vector3(0, 0, -70);
controls.target.copy(home);
const aspectBoost = innerWidth < innerHeight ? 1.9 : 1;
camera.position.set(230 * aspectBoost, 260 * aspectBoost, 330 * aspectBoost).add(home);
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
function flyTo(x, y, z, distance = 120) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.45) dir.setY(0.45).normalize();
  flight = {
    t: 0,
    fromT: controls.target.clone(), toT: new THREE.Vector3(x, y, z),
    fromC: camera.position.clone(), toC: new THREE.Vector3(x, y, z).addScaledVector(dir, distance),
  };
}

const ui = createUI({ residents, people, world, setSpeed, flyTo, speed, today: () => sim.dayOf(simNow()) });

// Bir sakine dokununca kartını aç.
const raycaster = new THREE.Raycaster();
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(people.bodies)[0] ?? raycaster.intersectObject(people.heads)[0];
  if (hit?.instanceId != null) ui.select(hit.instanceId, false);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// --- pencereler ve lambalar ---
const tmpColor = new THREE.Color();
const LAMP_OFF = new THREE.Color("#cfd6de");
function updateWindows(minute, light) {
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
  const lamps = city.lampHeads;
  tmpColor.copy(LAMP_OFF).lerp(P.WINDOW_NIGHT, night > 0.35 ? 1 : 0);
  for (let i = 0; i < lamps.count; i++) lamps.setColorAt(i, tmpColor);
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
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
  people.setDay(day);
  people.update(minute, real);

  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 1.3);
    const k = 1 - (1 - flight.t) ** 3;
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    camera.position.lerpVectors(flight.fromC, flight.toC, k);
    if (flight.t >= 1) flight = null;
  }
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, bounds.x0 - 150, bounds.x1 + 150);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, bounds.z0 - 150, bounds.z1 + 250);
  controls.target.y = 0;
  controls.update();

  const light = sky.update(minute, controls.target);
  const dist = camera.position.distanceTo(controls.target);
  const size = THREE.MathUtils.clamp(dist * 0.75, 90, 900);
  const sc = sky.sun.shadow.camera;
  if (sc.right !== size) {
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.near = 1; sc.far = 1600;
    sc.updateProjectionMatrix();
  }
  if (frame % 6 === 0) updateWindows(minute, light);
  if (frame % 15 === 0) ui.tick(unix, minute, day);
  driftClouds(clouds, dt);
  scaleLabels(labels, camera);

  const sel = ui.selected();
  if (sel != null) {
    marker.visible = true;
    const [x, z] = people.focusPoint(sel);
    const y = people.visible[sel] ? people.positions[sel * 3 + 1] : world.height(x, z);
    marker.position.set(x, y, z);
    pin.position.y = 6 + Math.sin(real * 3) * 0.6;
    ring.scale.setScalar(1 + (real % 1.2) * 0.4);
  } else {
    marker.visible = false;
  }

  renderer.render(scene, camera);
  if (frame === 1) document.getElementById("loading").classList.add("done");
  frame++;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const wanted = params.get("bul");
if (wanted) setTimeout(() => ui.find(wanted), 300);
