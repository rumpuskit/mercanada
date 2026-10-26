// Arazi (düz gölgeli low-poly), su, deniz tabanı, yollar ve meydan/tarla zeminleri.
import * as THREE from "three";
import { FLAT_Y } from "./layout.js";
import { fbm } from "./noise.js";
import * as P from "./palette.js";

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
  const pad = 170;
  const { x0, x1, z0, z1 } = world.bounds;
  const area = (x1 - x0 + 2 * pad) * (z1 - z0 + 2 * pad);
  const step = Math.max(5, Math.sqrt(area / 60000));
  const nx = Math.ceil((x1 - x0 + 2 * pad) / step), nz = Math.ceil((z1 - z0 + 2 * pad) / step);
  const heights = new Float32Array((nx + 1) * (nz + 1));
  const px = (i) => x0 - pad + i * step, pz = (j) => z0 - pad + j * step;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) heights[j * (nx + 1) + i] = world.height(px(i), pz(j));

  const pos = new Float32Array(nx * nz * 18);
  const col = new Float32Array(nx * nz * 18);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let k = 0;
  const tri = (i0, j0, i1, j1, i2, j2) => {
    a.set(px(i0), heights[j0 * (nx + 1) + i0], pz(j0));
    b.set(px(i1), heights[j1 * (nx + 1) + i1], pz(j1));
    c.set(px(i2), heights[j2 * (nx + 1) + i2], pz(j2));
    n.crossVectors(e1.subVectors(c, b), e2.subVectors(a, b)).normalize();
    const color = terrainColor(world, (a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3, (a.y + b.y + c.y) / 3, Math.abs(n.y));
    for (const v of [a, b, c]) {
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      col[k] = color.r; col[k + 1] = color.g; col[k + 2] = color.b;
      k += 3;
    }
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      // Köşegen yönünü değiştirerek ızgara görüntüsünü kır.
      if ((i + j) % 2 === 0) {
        tri(i, j, i, j + 1, i + 1, j);
        tri(i + 1, j, i, j + 1, i + 1, j + 1);
      } else {
        tri(i, j, i, j + 1, i + 1, j + 1);
        tri(i, j, i + 1, j + 1, i + 1, j);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  const group = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: P.WATER, transparent: true, opacity: 0.74, roughness: 0.18, metalness: 0.05, depthWrite: false }),
  );
  water.renderOrder = 1;
  water.receiveShadow = true;
  const seabed = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: P.DEEP_WATER }),
  );
  seabed.position.y = -9.5;
  group.add(seabed, water);
  return group;
}

/** Yollar: arazinin üstünde, kısa parçalara bölünmüş şeritler. Birleşim yerleri kare yamalarla kapanır. */
export function buildRoads(world) {
  const pos = [], col = [];
  const quad = (pts, y, color) => {
    const [p0, p1, p2, p3] = pts;
    for (const [x, z] of [p0, p1, p2, p0, p2, p3]) {
      pos.push(x, y(x, z), z);
      col.push(color.r, color.g, color.b);
    }
  };
  const yAt = (x, z) => Math.max(FLAT_Y + 0.06, world.height(x, z) + 0.12);
  for (const road of world.roads) {
    const hw = road.width / 2;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const parts = Math.max(1, Math.ceil(len / 6));
      for (let p = 0; p < parts; p++) {
        const s0 = (p / parts) * len, s1 = ((p + 1) / parts) * len;
        const cx0 = ax + ux * s0, cz0 = az + uz * s0, cx1 = ax + ux * s1, cz1 = az + uz * s1;
        quad([[cx0 - uz * hw, cz0 + ux * hw], [cx1 - uz * hw, cz1 + ux * hw], [cx1 + uz * hw, cz1 - ux * hw], [cx0 + uz * hw, cz0 - ux * hw]], yAt, road.color);
      }
    }
    for (const [x, z] of road.points) quad([[x - hw, z - hw], [x - hw, z + hw], [x + hw, z + hw], [x + hw, z - hw]], yAt, road.color);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Meydan, park, tarla ve avlu zeminleri. */
export function buildGrounds(world) {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const p of world.plazas) {
    let mesh;
    if (p.r) {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), mat(P.PLAZA));
      mesh.position.set(p.x, FLAT_Y + 0.08, p.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r - 6, p.r - 4.5, 40).rotateX(-Math.PI / 2), mat(P.AVENUE));
      ring.position.set(p.x, FLAT_Y + 0.1, p.z);
      group.add(ring);
    } else {
      const w = p.x1 - p.x0, d = p.z1 - p.z0;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(p.color));
      mesh.position.set((p.x0 + p.x1) / 2, FLAT_Y + 0.05, (p.z0 + p.z1) / 2);
      if (p.field === "ekin") {
        // Ekin sıraları.
        const rows = Math.floor(d / 4);
        const rowGeo = new THREE.BoxGeometry(w - 4, 0.6, 1.4);
        const rowMesh = new THREE.InstancedMesh(rowGeo, mat(tmp.copy(p.color).multiplyScalar(0.86).clone()), rows);
        const m = new THREE.Matrix4();
        for (let r = 0; r < rows; r++) {
          m.makeTranslation((p.x0 + p.x1) / 2, FLAT_Y + 0.3, p.z0 + 2 + r * 4);
          rowMesh.setMatrixAt(r, m);
        }
        rowMesh.castShadow = true;
        rowMesh.receiveShadow = true;
        group.add(rowMesh);
      }
      if (p.field === "spor") {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(w - 10, d - 10).rotateX(-Math.PI / 2), mat(P.GRASS));
        line.position.set(mesh.position.x, FLAT_Y + 0.07, mesh.position.z);
        group.add(line);
      }
    }
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
