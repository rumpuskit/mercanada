// Ağaçlar ve bulutlar.
import * as THREE from "three";
import { CELL_D, CELL_W } from "./layout.js";
import { fbm, hash2 } from "./noise.js";
import * as P from "./palette.js";

function treeDensity(world, x, z, h) {
  const cx = Math.round(x / CELL_W), cz = Math.round(z / CELL_D);
  const cell = world.cells.find((c) => c.cx === cx && c.cz === cz);
  const inPark = world.plazas.some((p) => p.park && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
  if (inPark) return 0.55;
  const d = world.sdf(x, z);
  if (d > world.margin(x, z) - 32 && h < 2) return 0; // kumsal
  if (!cell) return 0.25 + Math.max(0, fbm(x / 90, z / 90, 31)) * 1.2;
  if (cell.type === "mahalle") return 0.16;
  if (cell.type === "merkez") return 0.07;
  if (cell.type === "tepe") return 0.3 + Math.max(0, fbm(x / 60, z / 60, 32));
  return 0.12;
}

export function buildTrees(world) {
  const spots = [];
  const { x0, x1, z0, z1 } = world.bounds;
  const step = 6;
  for (let gx = Math.floor((x0 - 120) / step); gx <= (x1 + 120) / step; gx++) {
    for (let gz = Math.floor((z0 - 120) / step); gz <= (z1 + 120) / step; gz++) {
      const x = (gx + hash2(gx, gz, 41)) * step, z = (gz + hash2(gx, gz, 42)) * step;
      if (world.isBlocked(x, z)) continue;
      const h = world.height(x, z);
      if (h < 1.0) continue;
      if (hash2(gx, gz, 43) > treeDensity(world, x, z, h)) continue;
      spots.push({ x, z, y: h - 0.2, r: hash2(gx, gz, 44), t: hash2(gx, gz, 45) });
    }
  }

  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#9a7356", roughness: 1 }), spots.length);
  const round = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length);
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length);
  let nr = 0, nc = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const color = new THREE.Color();
  spots.forEach((t, i) => {
    const size = 0.8 + t.r * 0.7;
    const isPine = t.y > 8 || t.t < 0.3;
    m.compose(pos.set(t.x, t.y, t.z), q.identity(), sc.set(size, (isPine ? 2.2 : 3.2) * size, size));
    trunk.setMatrixAt(i, m);
    color.copy(P.TREES[Math.floor(t.t * 97) % P.TREES.length]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.t * 6.28);
    if (isPine) {
      m.compose(pos.set(t.x, t.y + 1.6 * size, t.z), q, sc.set(3 * size, 8 * size, 3 * size));
      cone.setMatrixAt(nc, m);
      cone.setColorAt(nc++, color);
    } else {
      m.compose(pos.set(t.x, t.y + 4.6 * size, t.z), q, sc.set(3.4 * size, 3.1 * size, 3.4 * size));
      round.setMatrixAt(nr, m);
      round.setColorAt(nr++, color);
    }
  });
  round.count = nr;
  cone.count = nc;
  const group = new THREE.Group();
  for (const mesh of [trunk, round, cone]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function buildClouds(world) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  const { x0, x1, z0, z1 } = world.bounds;
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(hash2(i, 0, 51) * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 9 + hash2(i, p, 52) * 9;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
      puff.position.set(p * 11 - puffs * 5, hash2(i, p, 53) * 5, hash2(i, p, 54) * 10 - 5);
      puff.scale.y = 0.65;
      cloud.add(puff);
    }
    cloud.position.set(x0 - 300 + hash2(i, 1, 55) * (x1 - x0 + 600), 340 + hash2(i, 2, 56) * 80, z0 - 300 + hash2(i, 3, 57) * (z1 - z0 + 600));
    cloud.userData.speed = 1.5 + hash2(i, 4, 58) * 2;
    group.add(cloud);
  }
  group.userData.span = [x0 - 400, x1 + 400];
  return group;
}

export function driftClouds(clouds, dt) {
  const [a, b] = clouds.userData.span;
  for (const c of clouds.children) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > b) c.position.x = a;
  }
}
