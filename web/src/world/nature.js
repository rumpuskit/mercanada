// Ağaçlar (fıstık çamı, servi, çınar, zeytin, palmiye) ve bulutlar. Boylar gerçektir.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CELL_D, CELL_W } from "./layout.js";
import { fbm, hash2, rng } from "./noise.js";

/** Birkaç yumruyu birleştirip doğal görünen bir taç yapar. */
function clumps(seedText, lumps, spread, radius, squash) {
  const rand = rng(seedText);
  const parts = [];
  for (let i = 0; i < lumps; i++) {
    const r = radius * (0.7 + rand() * 0.45);
    const g = new THREE.IcosahedronGeometry(r, 1);
    const a = rand() * Math.PI * 2, d = i === 0 ? 0 : spread * (0.5 + rand() * 0.5);
    g.scale(1, squash, 1).translate(Math.cos(a) * d, (rand() - 0.3) * radius * squash * 0.8, Math.sin(a) * d);
    parts.push(g);
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}

const KINDS = {
  // Fıstık çamı: uzun çıplak gövde, şemsiye gibi yayvan tepe (adaların simgesi).
  cam: { trunk: [0.22, 0.32, 1], crown: () => clumps("cam", 6, 2.6, 2.2, 0.45), crownY: 1, colors: ["#4f7a3e", "#5b8546", "#46703a"], h: [9, 13], trunkH: 0.82 },
  servi: { trunk: [0.12, 0.18, 1], crown: () => new THREE.CylinderGeometry(0.15, 1, 1, 8, 3).translate(0, 0.5, 0), crownY: 0.08, colors: ["#3c5e34", "#35552f"], h: [9, 14], trunkH: 0.12, crownScale: (h) => [1.3, h * 0.92, 1.3] },
  cinar: { trunk: [0.25, 0.38, 1], crown: () => clumps("cinar", 7, 2.0, 2.1, 0.85), crownY: 0.62, colors: ["#6f9d4c", "#7aa755", "#64913f", "#86ad5c"], h: [8, 12], trunkH: 0.55 },
  zeytin: { trunk: [0.14, 0.22, 1], crown: () => clumps("zeytin", 5, 1.3, 1.4, 0.7), crownY: 0.62, colors: ["#8a9c6d", "#7d9163", "#93a578"], h: [4, 6], trunkH: 0.5 },
  palmiye: { trunk: [0.16, 0.24, 1], crown: () => palmFronds(), crownY: 1, colors: ["#5f8f3e", "#6a9a45"], h: [7, 10], trunkH: 1 },
};

function palmFronds() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.BoxGeometry(0.5, 0.06, 3.2).translate(0, 0, 1.6).rotateX(0.45).rotateY((i / 9) * Math.PI * 2);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function treeKind(world, x, z, h, roll) {
  const d = world.sdf(x, z);
  if (d > world.margin(x, z) - 45) return roll < 0.35 ? "palmiye" : "cam";
  if (h > 9) return roll < 0.6 ? "cam" : "servi";
  const cell = world.cellByKey.get(`${Math.round(x / CELL_W)},${Math.round(z / CELL_D)}`);
  if (cell?.type === "kir") return roll < 0.7 ? "zeytin" : "servi";
  if (cell?.type === "mahalle") return roll < 0.5 ? "cinar" : roll < 0.75 ? "servi" : "zeytin";
  return roll < 0.45 ? "cam" : roll < 0.7 ? "cinar" : roll < 0.85 ? "servi" : "zeytin";
}

function treeDensity(world, x, z, h) {
  const cell = world.cellByKey.get(`${Math.round(x / CELL_W)},${Math.round(z / CELL_D)}`);
  const inPark = world.plazas.some((p) => p.kind === "park" && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
  if (inPark) return 0.5;
  const d = world.sdf(x, z);
  if (d > world.margin(x, z) - 35 && h < 1.6) return 0; // kumsal
  if (!cell) return 0.18 + Math.max(0, fbm(x / 110, z / 110, 31)) * 1.3;
  if (cell.type === "mahalle") return 0.22;
  if (cell.type === "merkez") return 0.1;
  if (cell.type === "tepe") return 0.25 + Math.max(0, fbm(x / 70, z / 70, 32)) * 1.2;
  return 0.1;
}

export function buildTrees(world) {
  const spots = [];
  const { x0, x1, z0, z1 } = world.bounds;
  const step = 7;
  for (let gx = Math.floor((x0 - 150) / step); gx <= (x1 + 150) / step; gx++) {
    for (let gz = Math.floor((z0 - 150) / step); gz <= (z1 + 150) / step; gz++) {
      const x = (gx + hash2(gx, gz, 41)) * step, z = (gz + hash2(gx, gz, 42)) * step;
      if (world.isBlocked(x, z)) continue;
      const h = world.height(x, z);
      if (h < 1.0) continue;
      if (hash2(gx, gz, 43) > treeDensity(world, x, z, h)) continue;
      spots.push({ x, z, y: h - 0.1, kind: treeKind(world, x, z, h, hash2(gx, gz, 46)), r: hash2(gx, gz, 44), t: hash2(gx, gz, 45) });
    }
  }
  // Meydan çınarları ve sahil palmiyeleri.
  for (const f of world.features) if (f.type === "agac") spots.push({ x: f.x, z: f.z, y: 1.3, kind: "cinar", r: 0.6, t: 0.3 });
  const sahil = world.roads.find((r) => r.type === "sahil");
  if (sahil) {
    sahil.points.forEach(([x, z], i) => {
      if (i % 2 === 0 && world.isLand(x, z + 5)) spots.push({ x, z: z + 4.5, y: Math.max(world.height(x, z + 4.5), 0.6), kind: "palmiye", r: (i % 5) / 5, t: (i % 3) / 3 });
    });
  }

  const group = new THREE.Group();
  const crowns = [];
  group.userData.crowns = crowns;
  const bark = new THREE.MeshStandardMaterial({ color: "#7d6150", roughness: 1 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  for (const [name, kind] of Object.entries(KINDS)) {
    const list = spots.filter((t) => t.kind === name);
    if (!list.length) continue;
    const [rt, rb] = kind.trunk;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(rt, rb, 1, 6).translate(0, 0.5, 0), bark, list.length);
    const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: name !== "servi", transparent: true, opacity: 1 });
    crowns.push(crownMat);
    const crown = new THREE.InstancedMesh(kind.crown(), crownMat, list.length);
    list.forEach((t, i) => {
      const h = kind.h[0] + t.r * (kind.h[1] - kind.h[0]);
      q.setFromAxisAngle(up, t.t * 6.283);
      m.compose(pos.set(t.x, t.y, t.z), q, sc.set(1 + t.r * 0.3, h * kind.trunkH, 1 + t.r * 0.3));
      trunk.setMatrixAt(i, m);
      const cs = kind.crownScale ? kind.crownScale(h) : [1 + t.r * 0.35, 1 + t.r * 0.35, 1 + t.r * 0.35];
      m.compose(pos.set(t.x, t.y + h * kind.crownY * (name === "servi" ? 1 : 1), t.z), q, sc.set(...cs));
      crown.setMatrixAt(i, m);
      crown.setColorAt(i, color.set(kind.colors[Math.floor(t.t * 97) % kind.colors.length]));
    });
    for (const mesh of [trunk, crown]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

export function buildClouds(world) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.9 });
  const { x0, x1, z0, z1 } = world.bounds;
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(clumps("bulut" + i, 6, 30, 22, 0.5), mat);
    cloud.position.set(x0 - 400 + hash2(i, 1, 55) * (x1 - x0 + 800), 520 + hash2(i, 2, 56) * 120, z0 - 400 + hash2(i, 3, 57) * (z1 - z0 + 800));
    cloud.userData.speed = 2 + hash2(i, 4, 58) * 3;
    group.add(cloud);
  }
  group.userData.span = [x0 - 600, x1 + 600];
  return group;
}

export function driftClouds(clouds, dt) {
  const [a, b] = clouds.userData.span;
  for (const c of clouds.children) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > b) c.position.x = a;
  }
}

/** Yakına inildiğinde ağaç tepeleri saydamlaşır; altındaki insanlar görünsün. */
export function fadeTrees(trees, distance) {
  const o = Math.min(1, Math.max(0.28, (distance - 25) / 70));
  for (const m of trees.userData.crowns) {
    m.opacity = o;
    m.depthWrite = o > 0.99;
  }
}
