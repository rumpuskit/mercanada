// Ulaşım: araç yol ağı (sağdan akan şeritler, kavşaklarda kavisli dönüş), park yerleri (sokak kenarı ve
// otoparklar), otobüs hatları (duraklar, saat çizelgesi) ve araçların çizimi (araba, taksi, otobüs).
// Her şey zamanın fonksiyonudur: aynı saatte bakan herkes aynı otobüsü aynı durakta görür.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { H } from "./roads.js";
import { CELL_D, CELL_W } from "./layout.js";
import { stations } from "./roads.js";

const LANE = { cadde: 2.0, sokak: 1.15, koy: 1.6 };
const SPEED = { cadde: 11, sokak: 7, koy: 12 }; // m/s
const BUS_SPEED = 8.5;
const BUS_DWELL = 22; // s
const PARK_OFF = { sokak: 3.0 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const right = (d) => [d[1], -d[0]];

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return cum;
}

/** Çizgi üzerinde d metredeki nokta ve yön. */
export function pointAt(pts, cum, d, out = {}) {
  d = Math.max(0, Math.min(cum[cum.length - 1], d));
  let j = 1;
  while (j < cum.length - 1 && cum[j] < d) j++;
  const u = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
  out.x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
  out.z = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
  out.heading = Math.atan2(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
  out.speedK = 1;
  return out;
}

export class Traffic {
  constructor(world) {
    this.world = world;
    const net = world.network;
    net.nodes.forEach((n, i) => { n.id ??= i; });
    // Araç kenarları: her yönde ayrı şerit çizgisi.
    this.edges = [];
    for (const e of net.edges) {
      if (!(e.road.carriage > 0)) continue;
      const lane = LANE[e.road.type] ?? 1.6;
      const st = stations(e.pts, e.trimA, e.trimB, 6);
      if (st.length < 2) continue;
      const fwd = st.map((s) => add(s.p, mul(right(s.dir), lane)));
      const back = [...st].reverse().map((s) => add(s.p, mul(right(mul(s.dir, -1)), lane)));
      const center = st.map((s) => s.p);
      this.edges.push({ a: e.a.id, b: e.b.id, road: e.road, fwd, back, center, cumC: cumulative(center), len: cumulative(center).at(-1), speed: SPEED[e.road.type] ?? 9, src: e });
    }
    this.adj = new Map();
    this.edges.forEach((e, k) => {
      for (const n of [e.a, e.b]) { if (!this.adj.has(n)) this.adj.set(n, []); this.adj.get(n).push(k); }
    });
    this.nodePos = new Map(net.nodes.map((n) => [n.id, n.p]));
    this._grid();
    this.cache = new Map();
    this._parking();
    this._busLines();
  }

  _grid() {
    this.grid = new Map();
    this.edges.forEach((e, k) => {
      for (let i = 1; i < e.center.length; i++) {
        const [ax, az] = e.center[i - 1], [bx, bz] = e.center[i];
        for (let gx = Math.floor((Math.min(ax, bx) - 8) / 30); gx <= Math.floor((Math.max(ax, bx) + 8) / 30); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - 8) / 30); gz <= Math.floor((Math.max(az, bz) + 8) / 30); gz++) {
            const key = gx * 100003 + gz;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push([k, i]);
          }
        }
      }
    });
  }

  /** Noktaya en yakın araç kenarı ve kenar boyunca uzaklık. */
  locate(p, maxD = 14) {
    let best = null;
    for (const [k, i] of this.grid.get(Math.floor(p[0] / 30) * 100003 + Math.floor(p[1] / 30)) ?? []) {
      const e = this.edges[k];
      const a = e.center[i - 1], b = e.center[i];
      const d = sub(b, a), l2 = d[0] * d[0] + d[1] * d[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
      const dist = len(sub(p, add(a, mul(d, t))));
      if (dist < maxD && (!best || dist < best.d)) best = { edge: k, along: e.cumC[i - 1] + Math.sqrt(l2) * t, d: dist };
    }
    return best;
  }

  _dijkstra(src) {
    if (this.cache.has(src)) return this.cache.get(src);
    const D = new Map([[src, 0]]), prev = new Map(), via = new Map();
    const open = [[0, src]];
    while (open.length) {
      let m = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[m][0]) m = i;
      const [d, u] = open[m];
      open[m] = open[open.length - 1];
      open.pop();
      if (d > (D.get(u) ?? Infinity)) continue;
      for (const k of this.adj.get(u) ?? []) {
        const e = this.edges[k];
        const v = e.a === u ? e.b : e.a;
        const w = e.len / e.speed;
        if (d + w < (D.get(v) ?? Infinity)) {
          D.set(v, d + w); prev.set(v, u); via.set(v, k);
          open.push([d + w, v]);
        }
      }
    }
    const res = { D, prev, via };
    if (this.cache.size > 300) this.cache.clear();
    this.cache.set(src, res);
    return res;
  }

  /** Kenarın şeridinde, merkez çizgisi uzaklığı d'deki nokta (forward: a→b yönünde sağ şerit). */
  _laneAt(e, forward, d) {
    const n = e.center.length;
    let j = 1;
    while (j < n - 1 && e.cumC[j] < d) j++;
    const u = Math.max(0, Math.min(1, (d - e.cumC[j - 1]) / ((e.cumC[j] - e.cumC[j - 1]) || 1)));
    const A = forward ? e.fwd[j - 1] : e.back[n - j], B = forward ? e.fwd[j] : e.back[n - 1 - j];
    return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
  }

  /** Şerit boyunca from'dan to'ya (merkez uzaklıkları) noktalar, gidiş sırasıyla. */
  _lanePts(e, forward, from, to) {
    const n = e.center.length;
    const out = [this._laneAt(e, forward, from)];
    if (forward) { for (let i = 0; i < n; i++) if (e.cumC[i] > from + 0.05 && e.cumC[i] < to - 0.05) out.push(e.fwd[i]); }
    else { for (let i = n - 1; i >= 0; i--) if (e.cumC[i] < from - 0.05 && e.cumC[i] > to + 0.05) out.push(e.back[n - 1 - i]); }
    out.push(this._laneAt(e, forward, to));
    return out;
  }

  /** A'dan B'ye araç rotası (sağ şeritte, kavşaklarda kavisli). Dönüş: {pts, cum, len, time}. */
  route(A, B) {
    const la = this.locate(A), lb = this.locate(B);
    if (!la || !lb) return null;
    const ea = this.edges[la.edge], eb = this.edges[lb.edge];
    const pts = [];
    if (la.edge === lb.edge) {
      pts.push(...this._lanePts(ea, la.along <= lb.along, la.along, lb.along));
    } else {
      let best = null;
      for (const [na, ca, fa] of [[ea.a, la.along / ea.speed, false], [ea.b, (ea.len - la.along) / ea.speed, true]]) {
        const { D } = this._dijkstra(na);
        for (const [nb, cb, fb] of [[eb.a, lb.along / eb.speed, true], [eb.b, (eb.len - lb.along) / eb.speed, false]]) {
          const total = ca + (D.get(nb) ?? Infinity) + cb;
          if (!best || total < best.total) best = { total, na, fa, nb, fb };
        }
      }
      if (!best || !Number.isFinite(best.total)) return null;
      pts.push(...this._lanePts(ea, best.fa, la.along, best.fa ? ea.len : 0));
      const { prev, via } = this._dijkstra(best.na);
      const chain = [];
      for (let v = best.nb; v !== best.na; v = prev.get(v)) chain.push([via.get(v), v]);
      chain.reverse();
      let at = best.na;
      for (const [k, v] of chain) {
        const e = this.edges[k];
        const fwd = e.a === at;
        const seg = this._lanePts(e, fwd, fwd ? 0 : e.len, fwd ? e.len : 0);
        this._turn(pts, seg);
        pts.push(...seg);
        at = v;
      }
      const tail = this._lanePts(eb, best.fb, best.fb ? 0 : eb.len, lb.along);
      this._turn(pts, tail);
      pts.push(...tail);
    }
    const clean = [pts[0]];
    for (const q of pts.slice(1)) if (len(sub(q, clean[clean.length - 1])) > 0.3) clean.push(q);
    if (clean.length < 2) return null;
    const cum = cumulative(clean);
    const total = cum[cum.length - 1];
    return { pts: clean, cum, len: total, time: total / 9 + 6 };
  }

  /** Kavşak dönüşü: önceki şeridin sonundan sonrakinin başına kavisli geçiş noktaları ekler. */
  _turn(pts, next) {
    if (!pts.length || !next.length) return;
    const a = pts[pts.length - 1], b = next[0];
    const da = pts.length > 1 ? norm(sub(a, pts[pts.length - 2])) : norm(sub(b, a));
    const db = next.length > 1 ? norm(sub(next[1], b)) : norm(sub(b, a));
    const den = da[0] * db[1] - da[1] * db[0];
    let c = null;
    if (Math.abs(den) > 0.05) {
      const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
      if (t > 0 && t < 40) c = add(a, mul(da, t));
    }
    if (!c) return;
    for (let i = 1; i < 6; i++) {
      const t = i / 6, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
  }

  // --- park yerleri ---

  _parking() {
    const w = this.world;
    this.slots = [];
    const doors = w.buildings.map((b) => [b.x + Math.sin(b.rot) * (b.d / 2 + 4), b.z + Math.cos(b.rot) * (b.d / 2 + 4)]);
    for (const e of this.edges) {
      if (e.road.type !== "sokak") continue;
      for (const side of [-1, 1]) {
        for (let d = 8; d < e.len - 8; d += 6.2) {
          const s = pointAt(e.center, e.cumC, d);
          const n = [Math.cos(s.heading), -Math.sin(s.heading)]; // sağ normal
          const x = s.x + n[0] * side * PARK_OFF.sokak, z = s.z + n[1] * side * PARK_OFF.sokak;
          if (doors.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 5)) continue;
          this.slots.push({ x, z, heading: s.heading + (side < 0 ? Math.PI : 0), edge: e, kind: "sokak", busy: [] });
        }
      }
    }
    // Otoparklar: çarşı çevre yolunun iç tarafında, iki yanda.
    this.lots = [];
    for (const lot of w.parkingLots ?? []) {
      const rows = Math.floor((lot.z1 - lot.z0) / 13);
      const cols = Math.floor((lot.x1 - lot.x0) / 2.7);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (const half of [-1, 1]) {
            const x = lot.x0 + 1.35 + c * 2.7, z = lot.z0 + 6.5 + r * 13 + half * 3.6;
            this.slots.push({ x, z, heading: half < 0 ? 0 : Math.PI, lot, kind: "otopark", busy: [] });
          }
        }
      }
      this.lots.push(lot);
    }
    this.slotIndex = new Map();
    this.slots.forEach((s, i) => {
      const key = Math.floor(s.x / 40) * 100003 + Math.floor(s.z / 40);
      if (!this.slotIndex.has(key)) this.slotIndex.set(key, []);
      this.slotIndex.get(key).push(i);
    });
  }

  /** (x, z)'ye yakın, [a, b] dakikaları arasında boş bir park yeri ayırır. */
  takeSlot(x, z, a, b, maxR = 160) {
    let best = null;
    for (let r = 0; r <= maxR / 40 && !best; r++) {
      for (let gx = Math.floor(x / 40) - r; gx <= Math.floor(x / 40) + r; gx++) {
        for (let gz = Math.floor(z / 40) - r; gz <= Math.floor(z / 40) + r; gz++) {
          for (const i of this.slotIndex.get(gx * 100003 + gz) ?? []) {
            const s = this.slots[i];
            if (!s.busy.every(([p, q]) => q <= a || p >= b)) continue;
            const d = Math.hypot(s.x - x, s.z - z);
            if (!best || d < best.d) best = { i, d };
          }
        }
      }
    }
    if (!best) return null;
    this.slots[best.i].busy.push([a, b]);
    return best.i;
  }

  resetBookings() {
    for (const s of this.slots) s.busy = [];
  }

  /** Park yerinden şeride (ve şeritten park yerine) çıkış/giriş noktası. */
  slotLaneEntry(i) {
    const s = this.slots[i];
    if (s.kind === "otopark") return s.lot.gate;
    return [s.x, s.z];
  }

  // --- otobüs hatları ---

  _busLines() {
    const w = this.world;
    this.lines = [];
    const loop = (name, color, waypoints, headway) => {
      const pts = [];
      for (let i = 0; i < waypoints.length; i++) {
        const r = this.route(waypoints[i], waypoints[(i + 1) % waypoints.length]);
        if (!r) return;
        if (pts.length) this._turn(pts, r.pts);
        pts.push(...r.pts);
      }
      const clean = [pts[0]];
      for (const p of pts.slice(1)) if (len(sub(p, clean[clean.length - 1])) > 0.3) clean.push(p);
      const cum = cumulative(clean);
      const L = cum[cum.length - 1];
      // Duraklar: ~320 m'de bir, kavşaklardan uzakta, sağ kaldırım kenarında.
      const stops = [];
      for (let d = 60; d < L - 60; d += 320) {
        let dd = d;
        for (let tries = 0; tries < 12; tries++, dd += 12) {
          const p = pointAt(clean, cum, dd);
          const loc = this.locate([p.x, p.z]);
          if (!loc) continue;
          const e = this.edges[loc.edge];
          if (loc.along > e.src.trimA + 25 && loc.along < e.len - e.src.trimB - 25) break;
        }
        const p = pointAt(clean, cum, dd);
        const n = [Math.cos(p.heading), -Math.sin(p.heading)];
        const hw = (this.locate([p.x, p.z]) ? this.edges[this.locate([p.x, p.z]).edge].road.width / 2 : 7);
        stops.push({ d: dd, x: p.x, z: p.z, heading: p.heading, curb: [p.x + n[0] * 1.9, p.z + n[1] * 1.9], shelter: [p.x + n[0] * (hw - 1.2), p.z + n[1] * (hw - 1.2)] });
      }
      stops.sort((a, b) => a.d - b.d);
      const cycle = L / BUS_SPEED + stops.length * BUS_DWELL;
      this.lines.push({ name, color, pts: clean, cum, len: L, stops, headway, cycle, first: 360, last: 1470 });
    };
    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    const avZ0 = w.avenueZ(0);
    loop("Çevre Hattı", "#d8433d", [[0, -halfD], [halfW, 0], [0, avZ0], [-halfW, 0]], 8);
    const mahalle = w.cells.filter((c) => c.type === "mahalle").map((c) => [c.cx * CELL_W, c.cz * CELL_D]);
    if (mahalle.length) loop("Mahalle Hattı", "#2f6fb5", [[0, -halfD], ...mahalle, [halfW, -halfD]], 10);
  }

  /** Hattın d metresinde, sefer başından τ saniye sonra: otobüs nerede? */
  _busOffset(line, tau) {
    // Durak arası sürüş + her durakta bekleme.
    let t = tau, d = 0;
    for (const st of line.stops) {
      const drive = (st.d - d) / BUS_SPEED;
      if (t < drive) return { d: d + t * BUS_SPEED, dwell: false };
      t -= drive; d = st.d;
      if (t < BUS_DWELL) return { d, dwell: true };
      t -= BUS_DWELL;
    }
    return { d: Math.min(line.len, d + t * BUS_SPEED), dwell: false };
  }

  /** Durak k'ye, dakika m'den sonra gelen ilk otobüsün varış dakikası. */
  nextBus(line, k, m) {
    const st = line.stops[k];
    const arriveOffset = (st.d / BUS_SPEED + k * BUS_DWELL) / 60;
    const n = Math.max(0, Math.ceil((m - line.first - arriveOffset) / line.headway));
    const t = line.first + n * line.headway + arriveOffset;
    return t <= line.last + line.cycle / 60 ? t : null;
  }

  /** Durak a'dan b'ye (hat yönünde) yolculuk süresi (dakika). */
  rideMinutes(line, a, b) {
    const da = line.stops[a].d, db = line.stops[b].d;
    const dist = db >= da ? db - da : line.len - da + db;
    const n = b >= a ? b - a : line.stops.length - a + b;
    return (dist / BUS_SPEED + n * BUS_DWELL) / 60;
  }

  /** Bir noktaya en yakın durak (her hat için). */
  nearestStop(x, z) {
    let best = null;
    this.lines.forEach((line, li) => line.stops.forEach((s, k) => {
      const d = Math.hypot(s.shelter[0] - x, s.shelter[1] - z);
      if (!best || d < best.d) best = { line: li, stop: k, d };
    }));
    return best;
  }

  stopNearOnLine(li, x, z) {
    let best = null;
    this.lines[li].stops.forEach((s, k) => {
      const d = Math.hypot(s.shelter[0] - x, s.shelter[1] - z);
      if (!best || d < best.d) best = { line: li, stop: k, d };
    });
    return best;
  }

  /** Dakika m'de yoldaki otobüslerin konumları. */
  buses(m) {
    const out = [];
    this.lines.forEach((line, li) => {
      const cycleMin = line.cycle / 60;
      for (let dep = line.first; dep <= line.last; dep += line.headway) {
        const tau = (m - dep) * 60;
        if (tau < 0 || tau > line.cycle) continue;
        const o = this._busOffset(line, tau);
        const p = pointAt(line.pts, line.cum, o.d);
        out.push({ x: p.x, z: p.z, heading: p.heading, line: li, dwell: o.dwell, id: li * 1000 + Math.round(dep) });
      }
      void cycleMin;
    });
    return out;
  }
}

// --- araç çizimi ---

function box(w, h, d, x = 0, y = 0, z = 0, color = "#ffffff") {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}

function wheels(wb, track, r) {
  const parts = [];
  for (const z of [-wb / 2, wb / 2]) for (const x of [-track / 2, track / 2]) {
    const g = new THREE.CylinderGeometry(r, r, 0.24, 10).rotateZ(Math.PI / 2).translate(x, r, z).toNonIndexed();
    const arr = new Float32Array(g.attributes.position.count * 3).fill(0.12);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  }
  return parts;
}

/** Binek araç: gövde (instance rengi), cam ve tekerlekler (sabit renk). Ön +z. */
function carGeometry() {
  const body = mergeGeometries([
    box(1.8, 0.62, 4.3, 0, 0.32, 0),
    box(1.62, 0.12, 1.1, 0, 0.94, 1.45), // kaput
  ]);
  const glass = mergeGeometries([
    box(1.58, 0.56, 2.1, 0, 0.94, -0.25, "#2c3846"),
  ]);
  const roof = mergeGeometries([box(1.5, 0.08, 1.8, 0, 1.5, -0.3)]);
  const fixed = mergeGeometries([
    ...wheels(2.6, 1.6, 0.33),
    box(1.82, 0.12, 0.2, 0, 0.36, 2.12, "#2a2a2e"), // tampon
    box(1.82, 0.12, 0.2, 0, 0.36, -2.12, "#2a2a2e"),
  ]);
  const lights = mergeGeometries([
    box(0.3, 0.12, 0.06, -0.6, 0.72, 2.16, "#fff6d8"), box(0.3, 0.12, 0.06, 0.6, 0.72, 2.16, "#fff6d8"),
    box(0.3, 0.12, 0.06, -0.6, 0.72, -2.16, "#d8302c"), box(0.3, 0.12, 0.06, 0.6, 0.72, -2.16, "#d8302c"),
  ]);
  for (const g of [body, glass, roof, fixed, lights]) g.computeVertexNormals();
  return { body, glass, roof, fixed, lights };
}

function busGeometry() {
  const body = mergeGeometries([box(2.5, 2.6, 12, 0, 0.35, 0)]);
  const glass = mergeGeometries([
    box(2.52, 0.95, 10.4, 0, 1.55, -0.4, "#25313d"),
    box(2.3, 1.2, 0.06, 0, 1.3, 6.0, "#25313d"),
  ]);
  const fixed = mergeGeometries([
    ...wheels(6.8, 2.2, 0.5),
    box(2.4, 0.15, 11.8, 0, 2.95, 0, "#e9eef2"),
    box(1.6, 0.28, 0.05, 0, 2.55, 6.03, "#1a1a1a"),
  ]);
  const lights = mergeGeometries([
    box(0.4, 0.18, 0.06, -0.9, 0.7, 6.02, "#fff6d8"), box(0.4, 0.18, 0.06, 0.9, 0.7, 6.02, "#fff6d8"),
    box(1.4, 0.18, 0.04, 0, 2.6, 6.06, "#ffb648"),
  ]);
  for (const g of [body, glass, fixed, lights]) g.computeVertexNormals();
  return { body, glass, fixed, lights };
}

const CAR_COLORS = ["#e9e9e6", "#2b2d31", "#8d9399", "#b8312f", "#2f4f7a", "#c9c3b5", "#5b6e4f", "#a8a29a", "#1f3b5c", "#7d2b2b"].map((c) => new THREE.Color(c));
export const TAXI_COLOR = new THREE.Color("#f2c230");

export class Vehicles {
  constructor(capacity, busCapacity) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
    const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.6 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const make = (geo, m, n, shadow = true) => {
      const mesh = new THREE.InstancedMesh(geo, m, n);
      mesh.count = 0;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    };
    const car = carGeometry();
    this.car = { body: make(car.body, mat, capacity), glass: make(car.glass, glassMat, capacity, false), roof: make(car.roof, mat, capacity, false), fixed: make(car.fixed, mat, capacity, false), lights: make(car.lights, this.lightMat, capacity, false) };
    this.taxiSign = make(mergeGeometries([box(0.6, 0.22, 0.3, 0, 1.58, -0.3, "#1a1a1a")]), mat, Math.max(8, capacity >> 3), false);
    const bus = busGeometry();
    this.bus = { body: make(bus.body, mat, busCapacity), glass: make(bus.glass, glassMat, busCapacity, false), fixed: make(bus.fixed, mat, busCapacity, false), lights: make(bus.lights, this.lightMat, busCapacity, false) };
    this.group = new THREE.Group();
    for (const m of [...Object.values(this.car), this.taxiSign, ...Object.values(this.bus)]) this.group.add(m);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  begin() {
    this.nc = 0; this.nb = 0; this.nt = 0;
  }

  addCar(x, y, z, heading, colorIndex, taxi = false) {
    const i = this.nc++;
    if (i >= this.car.body.instanceMatrix.count) return;
    this._q.setFromAxisAngle(this.up, heading);
    this._m.compose(this._p.set(x, y, z), this._q, this._one);
    for (const m of Object.values(this.car)) m.setMatrixAt(i, this._m);
    const c = taxi ? TAXI_COLOR : CAR_COLORS[colorIndex % CAR_COLORS.length];
    this.car.body.setColorAt(i, c);
    this.car.roof.setColorAt(i, c);
    if (taxi && this.nt < this.taxiSign.instanceMatrix.count) this.taxiSign.setMatrixAt(this.nt++, this._m);
  }

  addBus(x, y, z, heading, color) {
    const i = this.nb++;
    if (i >= this.bus.body.instanceMatrix.count) return;
    this._q.setFromAxisAngle(this.up, heading);
    this._m.compose(this._p.set(x, y, z), this._q, this._one);
    for (const m of Object.values(this.bus)) m.setMatrixAt(i, this._m);
    this.bus.body.setColorAt(i, color);
  }

  end(night) {
    for (const m of Object.values(this.car)) { m.count = Math.min(this.nc, m.instanceMatrix.count); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    for (const m of Object.values(this.bus)) { m.count = Math.min(this.nb, m.instanceMatrix.count); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.taxiSign.count = this.nt;
    this.taxiSign.instanceMatrix.needsUpdate = true;
    // Farlar gece parlak, gündüz sönük.
    this.lightMat.color.setScalar(0.45 + 0.9 * night);
  }
}

/** Otobüs durakları: sundurma, bank ve hat tabelası. */
export function buildStops(traffic, world) {
  const group = new THREE.Group();
  const roofMat = new THREE.MeshStandardMaterial({ color: "#d9e3ea", roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 });
  const frame = new THREE.MeshStandardMaterial({ color: "#3c4148", roughness: 0.5, metalness: 0.5 });
  for (const line of traffic.lines) {
    const sign = new THREE.MeshStandardMaterial({ color: line.color, roughness: 0.6 });
    for (const s of line.stops) {
      const y = world.groundY(...s.shelter);
      const g = new THREE.Group();
      g.position.set(s.shelter[0], y, s.shelter[1]);
      g.rotation.y = s.heading + Math.PI / 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.5), roofMat);
      roof.position.y = 2.5;
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 0.06), roofMat);
      back.position.set(0, 1.35, -0.7);
      const posts = [-1.75, 1.75].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), frame); p.position.set(x, 1.25, -0.7); return p; });
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.4), frame);
      bench.position.set(0, 0.48, -0.45);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), frame);
      pole.position.set(2.2, 1.4, 0.2);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), sign);
      plate.position.set(2.2, 2.6, 0.2);
      g.add(roof, back, ...posts, bench, pole, plate);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      group.add(g);
      world.addObstacleRect(s.shelter[0], s.shelter[1], 3.8, 1.6, s.heading + Math.PI / 2);
    }
  }
  return group;
}

export { H };
