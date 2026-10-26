// Yollar: taşıt yolu (asfalt, Arnavut kaldırımı, toprak), iki yanda bordürlü kaldırım, şerit çizgileri,
// yaya geçitleri ve sokak lambaları. Kavşaklarda kaldırımlar kesilir, taşıt yolları birleşir.
import * as THREE from "three";
import { FLAT_Y, ROADS } from "./layout.js";
import * as T from "./textures.js";

const PRIORITY = { cadde: 3, sokak: 2, sahil: 1, koy: 1, patika: 0 };
const PIECE = 3; // metre; yolları bu uzunlukta parçalara bölerek araziyi izler

/** Yol parçalarının hızlı sorgulanması için 40 m'lik ızgara. */
class SegmentIndex {
  constructor(roads) {
    this.cells = new Map();
    roads.forEach((road, ri) => {
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
        const pad = road.width / 2 + 2;
        for (let gx = Math.floor((Math.min(ax, bx) - pad) / 40); gx <= Math.floor((Math.max(ax, bx) + pad) / 40); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - pad) / 40); gz <= Math.floor((Math.max(az, bz) + pad) / 40); gz++) {
            const key = gx * 100003 + gz;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push({ ri, ax, az, bx, bz, road });
          }
        }
      }
    });
  }

  /** (x, z) noktası, `self` dışındaki bir yolun içinde mi? mode: "carriage" veya "full". */
  inside(x, z, self, test) {
    const list = this.cells.get(Math.floor(x / 40) * 100003 + Math.floor(z / 40));
    if (!list) return false;
    for (const s of list) {
      if (s.ri === self) continue;
      const r = test(s.road);
      if (r <= 0) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < r) return true;
    }
    return false;
  }
}

/** Çoklu çizgiyi PIECE uzunluğunda örnekler; her örnekte konum, birim yön ve sol normal. */
function sample(points) {
  const out = [];
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const n = Math.max(1, Math.ceil(len / PIECE));
    for (let k = out.length ? 1 : 0; k <= n; k++) {
      const t = (k / n) * len;
      out.push({ x: ax + ux * t, z: az + uz * t, ux, uz, d: dist + t });
    }
    dist += len;
  }
  // Köşelerde normalleri ortala (gönye birleşimi).
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    let ux = b.x - a.x, uz = b.z - a.z;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l; uz /= l;
    const cos = Math.max(0.5, ux * out[i].ux + uz * out[i].uz);
    out[i].nx = -uz / cos; out[i].nz = ux / cos;
  }
  return out;
}

class Strip {
  constructor() {
    this.pos = [];
    this.uv = [];
  }

  quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3) {
    // Yatay yüzler hep yukarı baksın.
    const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    if (ny < 0) [p1, p3, uv1, uv3] = [p3, p1, uv3, uv1];
    for (const [p, t] of [[p0, uv0], [p1, uv1], [p2, uv2], [p0, uv0], [p2, uv2], [p3, uv3]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.uv.push(t[0], t[1]);
    }
  }

  mesh(texture, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: opts.roughness ?? 0.95, color: opts.color ?? 0xffffff, polygonOffset: true, polygonOffsetFactor: opts.offset ?? -2, polygonOffsetUnits: opts.offset ?? -2, side: opts.side ?? THREE.FrontSide });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

export function buildRoads(world) {
  const group = new THREE.Group();
  const index = new SegmentIndex(world.roads);
  const ground = (x, z) => Math.max(FLAT_Y, world.height(x, z));
  const surfaces = { asfalt: new Strip(), parke: new Strip(), toprak: new Strip(), tas: new Strip() };
  const TILE = { asfalt: 8, parke: 4, toprak: 6, tas: 5 };
  const sidewalks = new Strip();
  const curbs = new Strip();
  const markings = new Strip();
  const lampSpots = [];

  world.roads.forEach((road, ri) => {
    const pts = sample(road.points);
    const hc = road.carriage / 2, hw = road.width / 2;
    const surface = road.carriage > 0 ? road.surface : null;
    const lift = 0.05 + ri * 0.0004;
    const carriageOf = (r) => (r.carriage > 0 ? r.carriage / 2 + 0.2 : 0);
    const fullOf = (r) => (PRIORITY[r.type] > PRIORITY[road.type] ? r.width / 2 : 0);
    const walkOnly = road.carriage === 0; // sahil yolu: tamamı yaya yolu

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const ya = ground(a.x, a.z), yb = ground(b.x, b.z);
      const at = (p, y, off, h) => [p.x + p.nx * off, y + h, p.z + p.nz * off];

      if (surface) {
        const tile = TILE[surface];
        surfaces[surface].quad(
          at(a, ya, -hc, lift), at(b, yb, -hc, lift), at(b, yb, hc, lift), at(a, ya, hc, lift),
          [0, a.d / tile], [0, b.d / tile], [road.carriage / tile, b.d / tile], [road.carriage / tile, a.d / tile],
        );
        // Orta şerit: kesik çizgi (yalnızca caddede).
        if (road.type === "cadde" && Math.floor(a.d / 3) % 2 === 0 && !index.inside(mx, mz, ri, carriageOf)) {
          markings.quad(at(a, ya, -0.08, lift + 0.01), at(b, yb, -0.08, lift + 0.01), at(b, yb, 0.08, lift + 0.01), at(a, ya, 0.08, lift + 0.01), [0, 0], [0, 1], [1, 1], [1, 0]);
        }
      }

      // Kaldırımlar: başka bir yolun taşıt yolunun ya da daha önemli bir yolun içine giren parçalar kesilir.
      const sides = walkOnly ? [[-hw, hw]] : hw - hc > 0.3 ? [[hc, hw], [-hw, -hc]] : [];
      for (const [o0, o1] of sides) {
        const oc = (o0 + o1) / 2;
        const cx = mx + ((a.nx + b.nx) / 2) * oc, cz = mz + ((a.nz + b.nz) / 2) * oc;
        if (index.inside(cx, cz, ri, carriageOf) || index.inside(cx, cz, ri, fullOf)) continue;
        const h = walkOnly ? lift + 0.02 : 0.17;
        const strip = walkOnly ? surfaces.tas : sidewalks;
        const tile = walkOnly ? TILE.tas : 2.4;
        strip.quad(at(a, ya, o0, h), at(b, yb, o0, h), at(b, yb, o1, h), at(a, ya, o1, h),
          [o0 / tile, a.d / tile], [o0 / tile, b.d / tile], [o1 / tile, b.d / tile], [o1 / tile, a.d / tile]);
        if (!walkOnly) {
          // Bordür: taşıt yolu tarafındaki dikey yüz ve üst kenar.
          const edge = o0 > 0 ? o0 : o1;
          const inward = o0 > 0 ? 0.25 : -0.25;
          curbs.quad(at(a, ya, edge, lift), at(b, yb, edge, lift), at(b, yb, edge, 0.17), at(a, ya, edge, 0.17), [0, 0], [1, 0], [1, 1], [0, 1]);
          curbs.quad(at(a, ya, edge, 0.171), at(b, yb, edge, 0.171), at(b, yb, edge + inward, 0.171), at(a, ya, edge + inward, 0.171), [0, 0], [1, 0], [1, 1], [0, 1]);
        }
      }

      // Sokak lambası adayları: kaldırımın dış kenarı, 30 m'de bir, iki yana sırayla.
      if ((road.type === "cadde" || road.type === "sokak" || road.type === "sahil") && Math.floor(a.d / 30) !== Math.floor(b.d / 30)) {
        const k = Math.floor(b.d / 30);
        const side = k % 2 ? 1 : -1;
        const off = side * (hw - 0.6);
        const lx = b.x + b.nx * off, lz = b.z + b.nz * off;
        if (!index.inside(lx, lz, ri, carriageOf) && !world.isBlocked(lx + b.nx * side * 3, lz + b.nz * side * 3) || road.type === "sahil") {
          if (world.isLand(lx, lz)) lampSpots.push({ x: lx, z: lz, y: ground(lx, lz) + (walkOnly ? lift : 0.17), dir: Math.atan2(-b.nx * side, -b.nz * side) });
        }
      }
    }
  });

  for (const l of world.lamps) lampSpots.push({ ...l, y: world.groundY(l.x, l.z) });

  // Yaya geçitleri: zebra çizgileri.
  for (const c of world.crossings) {
    const y = ground(c.x, c.z) + 0.07;
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    for (let s = -c.len / 2 + 0.3; s < c.len / 2 - 0.2; s += 1) {
      // Çizgiler yol boyunca uzanır (yerel x), yol genişliği boyunca (yerel z) dizilir.
      const p = (lx, lz) => [c.x + lx * cos - lz * sin, y, c.z + lx * sin + lz * cos];
      markings.quad(p(-1.5, s), p(1.5, s), p(1.5, s + 0.5), p(-1.5, s + 0.5), [0, 0], [1, 0], [1, 1], [0, 1]);
    }
  }

  group.add(
    surfaces.asfalt.mesh(T.asphalt(), { roughness: 0.9 }),
    surfaces.parke.mesh(T.cobble()),
    surfaces.toprak.mesh(T.dirt()),
    surfaces.tas.mesh(T.slabs()),
    sidewalks.mesh(T.paving(), { offset: -3 }),
    curbs.mesh(T.curb(), { offset: -3, side: THREE.DoubleSide }),
    markings.mesh(null, { color: 0xf4f1ea, offset: -4, roughness: 0.6 }),
  );
  group.add(buildLamps(lampSpots));
  return group;
}

function buildLamps(spots) {
  const group = new THREE.Group();
  const n = Math.max(1, spots.length);
  const metal = new THREE.MeshStandardMaterial({ color: "#3c4148", roughness: 0.5, metalness: 0.4 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 5.6, 6).translate(0, 2.8, 0), metal, n);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.3).translate(0, 5.5, 0.6), metal, n);
  const headMat = new THREE.MeshBasicMaterial({ color: "#d8dde3", toneMapped: false });
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.62).translate(0, 5.42, 1.15), headMat, n);
  // Geceleri lambanın altına düşen ışık halkası.
  const poolMat = new THREE.MeshBasicMaterial({ color: "#ffc978", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), poolMat, n);
  pool.renderOrder = 2;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.dir);
    m.compose(p.set(s.x, s.y, s.z), q, one);
    pole.setMatrixAt(i, m);
    arm.setMatrixAt(i, m);
    head.setMatrixAt(i, m);
    m.compose(p.set(s.x + Math.sin(s.dir) * 1.2, s.y + 0.06, s.z + Math.cos(s.dir) * 1.2), q, new THREE.Vector3(7, 1, 7));
    pool.setMatrixAt(i, m);
  });
  for (const mesh of [pole, arm, head, pool]) {
    mesh.count = spots.length;
    mesh.castShadow = mesh === pole || mesh === arm;
    group.add(mesh);
  }
  group.userData.heads = head;
  group.userData.pool = pool;
  return group;
}

/** Meydan, park, tarlalar, saha, bahçe ve pazar yeri zeminleri. */
export function buildGrounds(world) {
  const group = new THREE.Group();
  const flat = (w, d, x, z, tex, repeat, y = 0.06, color = 0xffffff) => {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    if (repeat) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / repeat, uv.getY(i) * d / repeat);
    }
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.position.set(x, FLAT_Y + y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const CROPS = ["#c9b45a", "#8fb04f", "#d6a35a"];
  for (const p of world.plazas) {
    if (p.r) {
      const g = new THREE.CircleGeometry(p.r, 48).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p.r / 2.5, uv.getY(i) * p.r / 2.5);
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.plazaStone(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      mesh.position.set(p.x, FLAT_Y + 0.18, p.z);
      mesh.receiveShadow = true;
      group.add(mesh);
      continue;
    }
    const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    if (p.kind === "tarla") flat(w, d, cx, cz, T.crops(CROPS[p.crop]), 2.4, 0.08);
    else if (p.kind === "saha") {
      flat(w + 8, d + 8, cx, cz, T.paving(), 2.4, 0.05);
      flat(w, d, cx, cz, T.pitch(), 0, 0.07);
    } else if (p.kind === "pazar") flat(w, d, cx, cz, T.slabs(), 5, 0.06);
    else if (p.kind === "bahce") flat(w, d, cx, cz, T.grassDetail(), 6, 0.04, 0x8fc773);
  }
  return group;
}
