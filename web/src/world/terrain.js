// Arazi (yumuşak gölgeli, çimen dokulu), su ve deniz tabanı.
import * as THREE from "three";
import { fbm } from "./noise.js";
import * as P from "./palette.js";
import { grassDetail } from "./textures.js";

const tmp = new THREE.Color();

function terrainColor(world, x, z, h, ny) {
  if (h < -0.2) return tmp.copy(P.WET_SAND).lerp(P.SEABED, Math.min(1, -h / 7));
  const d = world.sdf(x, z);
  const coastal = d > world.margin(x, z) - 30;
  if (coastal && h < 1.15) return tmp.copy(P.SAND);
  if (ny < 0.62) return tmp.copy(P.ROCK);
  const v = fbm(x / 45, z / 45, 21) + 0.5;
  tmp.copy(P.GRASS).lerp(P.GRASS_DARK, Math.min(1, Math.max(0, v * 1.4 - 0.35)));
  if (h > 8) tmp.lerp(P.HILL, Math.min(1, (h - 8) / 20));
  return tmp;
}

export function buildTerrain(world) {
  const pad = 220;
  const { x0, x1, z0, z1 } = world.bounds;
  const area = (x1 - x0 + 2 * pad) * (z1 - z0 + 2 * pad);
  const step = Math.max(4, Math.sqrt(area / 90000));
  const nx = Math.ceil((x1 - x0 + 2 * pad) / step), nz = Math.ceil((z1 - z0 + 2 * pad) / step);
  const count = (nx + 1) * (nz + 1);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = x0 - pad + i * step, z = z0 - pad + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = world.height(x, z); pos[k * 3 + 2] = z;
    }
  }
  const hAt = (i, j) => pos[(Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i))) * 3 + 1];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      // Eğim: komşu yüksekliklerden.
      const gx = hAt(i + 1, j) - hAt(i - 1, j), gz = hAt(i, j + 1) - hAt(i, j - 1);
      const ny = (2 * step) / Math.hypot(gx, gz, 2 * step);
      const c = terrainColor(world, x, z, h, ny);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    }
  }
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassDetail(), roughness: 0.97 }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  const group = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(14000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: P.WATER, transparent: true, opacity: 0.74, roughness: 0.18, metalness: 0.05, depthWrite: false }),
  );
  water.renderOrder = 1;
  water.receiveShadow = true;
  const seabed = new THREE.Mesh(
    new THREE.CircleGeometry(14000, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: P.DEEP_WATER }),
  );
  seabed.position.y = -12.5;
  group.add(seabed, water);
  return group;
}

