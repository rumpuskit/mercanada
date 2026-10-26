// Sakinler: günlük planına göre evden çıkar, işe gider, hobisini yapar, meydanda arkadaşlarıyla buluşur.
// Plan simülasyondan gelir (sim.js); burada o planın sokakta nasıl yaşandığı kurulur.
//
//  - Gün başında herkese, gideceği her yer için bir "rol" ayrılır: oturacağı bank ya da masa, katılacağı
//    sohbet grubu, olta atacağı iskele noktası, seyir noktası... Ayırma, varış saatine göre sırayla yapılır;
//    aynı yere aynı anda iki kişi düşmez ve kişinin yeri gün içinde değişmez.
//  - Yolculuk: kapının içinden çıkar, kaldırımdan (her yolun kendi kaldırım çizgisinden) yürür, köşeleri
//    yuvarlak döner, meydanda çeşmenin çevresinden dolanır, ayrılan yerine varır; oturacaksa oturur.
//    Erken kalırsa yolda kısa molalar verir. Kapıdan girerken kapı açılır.
//  - Yürüyenler birbirine çok yaklaşırsa yana çekilir; durağan insanların ve engellerin içinden geçilmez.
import { Color } from "three";
import { activityAt, dayPlan, hobby, job, look, pet, roll, workplace } from "../sim.js";
import { Crowd } from "./human.js";
import { Navigator } from "./nav.js";
import { pointAt } from "./traffic.js";
import * as P from "./palette.js";

const UNIFORMS = {
  cankurtaran: "#e0463c", liman_iscisi: "#f28c28", balikci: "#f2c230", gemi_ustasi: "#33507a",
  bahcivan: "#6a8f3c", zeytinci: "#7d8a4e", fener_bekcisi: "#2f3f5f", rehber: "#3e8a86",
};
const DOG_COLORS = ["#8a5a32", "#2b2622", "#e8dcc4", "#c9954f", "#6b6b6b"].map((c) => new Color(c));
const HUB = [0, 0];
const POSE_KEYS = ["y", "lie", "drop", "lean", "twist", "headYaw", "headPitch", "hipL", "hipR", "kneeL", "kneeR", "shL", "shR", "abL", "abR", "elL", "elR"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (n) => (n % 10000) / 10000;
const smooth = (t) => t * t * (3 - 2 * t);

function lengths(pts) {
  const lens = [0];
  for (let j = 1; j < pts.length; j++) lens.push(lens[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  return lens;
}

/** Çizgi üzerinde `d` metredeki nokta ve yön. */
function along(pts, lens, d, out) {
  let j = 1;
  while (j < lens.length - 1 && lens[j] < d) j++;
  const span = lens[j] - lens[j - 1] || 1;
  const u = clamp((d - lens[j - 1]) / span, 0, 1);
  out.x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
  out.z = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
  out.heading = Math.atan2(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
  return out;
}

/** Yaya hattı: yol çizgisinden ne kadar yana (yolun türüne göre kaldırımın ortası). */
function laneOf(road, jitter) {
  if (!road) return 0;
  const hc = road.carriage / 2, hw = road.width / 2;
  if (road.carriage > 0) return hw - hc > 0.3 ? (hc + hw) / 2 + jitter * 0.6 * (hw - hc) : hw - 0.7;
  if (road.type === "yaya") return 1.6 + (jitter + 0.5) * 3.0;
  if (road.type === "sahil") return 0.5 + (jitter + 0.5) * 1.4;
  return 0;
}

/**
 * Yol çizgisini her parçanın yolu üzerindeki kaldırım çizgisine kaydırır; komşu parçalar kesişim
 * noktalarında birleşir, köşeler yuvarlanır. İlk ve son parça (kapıdan yola bağlantı) kaydırılmaz.
 */
function sidewalkPath(world, raw, side, jitter) {
  const pts = [raw[0]];
  for (const p of raw.slice(1)) if (Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 0.05) pts.push(p);
  const n = pts.length;
  if (n < 3) return pts;
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / l, dz = (bz - az) / l;
    let o = 0;
    if (i > 0 && i < n - 2) o = side * laneOf(world.roadIndex.at((ax + bx) / 2, (az + bz) / 2)?.road, jitter);
    segs.push({ a: [ax - dz * o, az + dx * o], b: [bx - dz * o, bz + dx * o], d: [dx, dz] });
  }
  const out = [segs[0].a];
  for (let i = 1; i < segs.length; i++) {
    const s1 = segs[i - 1], s2 = segs[i];
    const den = s1.d[0] * s2.d[1] - s1.d[1] * s2.d[0];
    if (Math.abs(den) < 0.05) {
      out.push(s1.b);
      if (Math.hypot(s2.a[0] - s1.b[0], s2.a[1] - s1.b[1]) > 0.05) out.push(s2.a);
      continue;
    }
    const t = ((s2.a[0] - s1.a[0]) * s2.d[1] - (s2.a[1] - s1.a[1]) * s2.d[0]) / den;
    out.push([s1.a[0] + s1.d[0] * t, s1.a[1] + s1.d[1] * t]);
  }
  out.push(segs[segs.length - 1].b);
  // Köşe yuvarlama.
  const res = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const [px, pz] = out[i - 1], [x, z] = out[i], [nx, nz] = out[i + 1];
    const la = Math.hypot(x - px, z - pz), lb = Math.hypot(nx - x, nz - z);
    const r = Math.min(2.2, la / 2.2, lb / 2.2);
    if (r < 0.3) { res.push(out[i]); continue; }
    res.push([x - ((x - px) / la) * r, z - ((z - pz) / la) * r]);
    res.push([x + ((nx - x) / lb) * r, z + ((nz - z) / lb) * r]);
  }
  res.push(out[out.length - 1]);
  return res;
}

/** Bacak için iki kemikli ters kinematik: kalçadan ayağa (öne dz, yukarı dy) → {hip, knee}. */
function legIK(dz, dy, L1 = 0.45, L2 = 0.47) {
  const d = clamp(Math.hypot(dz, dy), 0.25, L1 + L2 - 0.005);
  const alpha = Math.atan2(dz, -dy);
  const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const beta = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  return { hip: alpha + beta, knee };
}

// --- duruşlar ---

export function resetPose(p) {
  p.lie = 0; p.drop = 0; p.lean = 0; p.twist = 0; p.headYaw = 0; p.headPitch = 0;
  p.hipL = 0; p.hipR = 0; p.kneeL = 0.05; p.kneeR = 0.05;
  p.shL = 0; p.shR = 0; p.abL = 0; p.abR = 0; p.elL = 0.12; p.elR = 0.12;
  p.props = null; p.moving = false; p.radius = 0.32; p.dog = false; p.door = null;
}

/** Yürüyüş: φ adım evresi; koşu için run = 1. Topuk vuruşu, kalça salınımı, kol sallama. */
export function walkPose(p, phi, run = 0) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const hipA = run ? 0.62 : 0.4, kneeA = run ? 1.3 : 0.75;
  p.hipL = hipA * s; p.hipR = -hipA * s;
  // Diz, bacak öne salınırken bükülür; yere basarken hafifçe esner.
  p.kneeL = 0.08 + kneeA * Math.max(0, c) ** 1.4 + 0.06 * Math.max(0, -s);
  p.kneeR = 0.08 + kneeA * Math.max(0, -c) ** 1.4 + 0.06 * Math.max(0, s);
  p.shL = -(run ? 0.6 : 0.3) * s; p.shR = (run ? 0.6 : 0.3) * s;
  p.abL = p.abR = 0.04;
  p.elL = run ? 1.5 : 0.18 + 0.22 * Math.max(0, -s); p.elR = run ? 1.5 : 0.18 + 0.22 * Math.max(0, s);
  p.lean = run ? 0.18 : 0.04;
  p.twist = (run ? 0.1 : 0.07) * s;
  p.headYaw = -0.03 * s;
  p.y += (run ? 0.06 : 0.028) * Math.abs(Math.cos(phi)) - (run ? 0.02 : 0.01);
  p.moving = true;
}

export function sitPose(p, top, k) {
  p.y = top + 0.06 - 0.92 * k;
  p.hipL = p.hipR = 1.5; p.kneeL = p.kneeR = 1.45;
  p.shL = p.shR = 0.35; p.elL = p.elR = 0.9; p.abL = p.abR = -0.02;
  p.lean = -0.05;
}

export function idleGesture(p, t, phase, talk) {
  // Ağırlığını bir bacaktan ötekine verir, başını çevirir, konuşurken elleriyle anlatır.
  const shift = Math.sin(t * 0.21 + phase);
  p.twist = 0.05 * Math.sin(t * 0.4 + phase);
  p.headYaw = 0.25 * Math.sin(t * 0.3 + phase * 2);
  if (talk) {
    const g = Math.max(0, Math.sin(t * 0.9 + phase));
    p.shR = 0.35 + 0.5 * g; p.elR = 0.6 + 0.9 * g; p.abR = 0.05 * g;
    p.shL = 0.1 * g; p.elL = 0.3;
  }
  if (p.hipL < 1) {
    p.kneeL = 0.05 + 0.1 * Math.max(0, shift);
    p.kneeR = 0.05 + 0.1 * Math.max(0, -shift);
  }
}

function blendPose(p, a, b, t) {
  for (const key of POSE_KEYS) p[key] = a[key] + (b[key] - a[key]) * t;
}

export class People {
  constructor(world, residents, traffic) {
    this.traffic = traffic;
    this.world = world;
    this.residents = residents;
    this.n = residents.length;
    this.day = null;
    this.visibleCount = 0;
    this.athome = new Uint8Array(this.n);
    this.positions = new Float32Array(this.n * 3);
    this.visible = new Uint8Array(this.n);
    this.activities = new Array(this.n);
    this.travelCache = new Array(this.n);
    this.poses = Array.from({ length: this.n }, () => ({}));
    this.slotToIndex = new Map(residents.map((r, i) => [r.slot, i]));
    this.homeActs = new Array(this.n);
    this.currentPlace = new Array(this.n);
    this.dollhouse = null;
    this.openDoors = new Set();

    this.homes = residents.map((r) => world.homeOf(r.slot));
    this.works = residents.map((r) => ({ wp: workplace(r), loc: world.workplaceOf(workplace(r)), job: job(r).id }));
    this.hobbies = residents.map((r) => hobby(r));
    this.speeds = residents.map((r) => 1.1 + frac(roll(r.seed, "hiz")) * 0.4);
    this.colors = residents.map((r, i) => {
      const l = look(r);
      const uniform = UNIFORMS[this.works[i].job];
      return {
        style: l.sac % 8, height: 1.75 * (l.boy / 100),
        skin: P.SKIN[l.ten % P.SKIN.length], hairColor: P.HAIR[l.sac_renk % P.HAIR.length],
        top: P.CLOTHES[l.ust % P.CLOTHES.length], bottom: P.BOTTOMS[l.alt % P.BOTTOMS.length],
        sleeves: roll(r.seed, "kol") % 3 !== 0,
        skirt: roll(r.seed, "etek") % 5 === 0,
        beard: roll(r.seed, "sakal") % 5 === 0,
        glasses: roll(r.seed, "gozluk") % 6 === 0,
        uniform: uniform ? new Color(uniform) : null,
      };
    });

    this.nav = new Navigator(world);
    // Araç sahipliği (yaklaşık üçte bir) ve evin önündeki sabit park yeri.
    this.hasCar = residents.map((r) => roll(r.seed, "araba") % 100 < 33);
    this.carColor = residents.map((r) => roll(r.seed, "arabaRenk") % 10);
    this.homeSlot = residents.map((r, i) => (this.hasCar[i] && traffic ? traffic.takeSlot(...this.homes[i].door, -1, 1e9, 220) : null));
    this.homeSlot.forEach((slot, i) => { if (slot == null) this.hasCar[i] = false; });
    this._buildPools();
    this.crowd = new Crowd(this.n);
    this.group = this.crowd.group;
    this._at = {};
    this._tmp = {};
    this._stand = {};
    this._sit = {};
  }

  // --- yer havuzları: oturaklar, durma noktaları, sohbet grupları ---

  _buildPools() {
    const w = this.world;
    const pools = {};
    const add = (name, item) => (pools[name] ??= []).push({ ...item, busy: [] });
    for (const s of w.seats) add("seat:" + s.place, s);
    for (const s of w.places.iskele.spots) add("fish", s);
    for (const s of w.places.fener.spots) add("view", s);
    // Park (şövale), plaj (yoga, yüzme), tepe (uçurtma): engelsiz noktalar.
    const scatter = (name, cx, cz, radius, count, heading, salt, accept = (x, z) => w.isWalkable(x, z)) => {
      for (let k = 0, tries = 0; k < count && tries < count * 20; tries++) {
        const a = frac(roll(salt, name, tries)) * Math.PI * 2, r = Math.sqrt(frac(roll(salt + 1, name, tries))) * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!accept(x, z)) continue;
        if ((pools[name] ?? []).some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)) continue;
        add(name, { x, z, heading: typeof heading === "function" ? heading(x, z) : heading });
        k++;
      }
    };
    const park = w.plazas.find((p) => p.kind === "park");
    const pond = w.features.find((f) => f.type === "gol");
    scatter("easel", (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 40, 14, (x, z) => Math.atan2(pond.x - x, pond.z - z), 11);
    const beach = w.places.plaj.anchors;
    const sea = (x, z) => w.height(x, z) > 0.35 && w.height(x, z) < 1.6 && !w.obstacles.has(w._obKey(x, z));
    for (const [bx, bz] of beach) scatter("yoga", bx, bz, 6, 2, Math.PI, 13 + Math.round(bx), sea);
    for (const [bx, bz] of beach) scatter("swim", bx, bz + 22, 10, 2, 0, 17 + Math.round(bx), (x, z) => w.height(x, z) < -0.6 && w.height(x, z) > -3);
    for (const [bx, bz] of beach) scatter("towel", bx, bz, 7, 3, Math.PI, 19 + Math.round(bx), sea);
    const top = w.places.tepe.anchors[0];
    scatter("kite", top[0], top[1], 16, 10, (x, z) => Math.atan2(x - top[0], z - top[1]), 23);

    // Sohbet grupları: meydanda çeşme ile banklar arasında ve dışında; diğer yerlerde çapanın çevresinde.
    const groups = {};
    const addGroup = (place, x, z, cap) => {
      if (!w.isWalkable(x, z)) return;
      (groups[place] ??= []).push({ x, z, cap, slots: Array.from({ length: cap }, () => []) });
    };
    for (let g = 0; g < 44; g++) {
      const a = g * 2.39996, r = 9.5 + ((g * 7) % 17);
      addGroup("meydan", Math.cos(a) * r, Math.sin(a) * r, 2 + (g % 4));
    }
    for (const place of ["park", "tepe", "sahil_yolu", "plaj", "pazar", ...Object.keys(w.places).filter((k) => k.startsWith("mahalle:"))]) {
      const pl = w.places[place];
      if (!pl) continue;
      pl.anchors.forEach(([ax, az], i) => {
        for (let g = 0; g < 3; g++) {
          const a = g * 2.1 + i, r = 3 + g * 2.5;
          const [x, z] = w.nearestWalkable(ax + Math.cos(a) * r, az + Math.sin(a) * r, 5);
          addGroup(place, x, z, 2 + ((g + i) % 3));
        }
      });
    }
    // Dışarıdaki iş yerlerinde her çalışana ayrı bir çalışma noktası.
    for (const [kind, list] of Object.entries(w.workplaces)) {
      list.forEach((loc, idx) => {
        if (!loc?.outdoor) return;
        const center = loc.anchor;
        const rad = Math.max(9, (loc.spread ?? 6) * 1.6);
        const toward = (x, z) => Math.atan2(center[0] - x, center[1] - z);
        scatter(`work:${kind}:${idx}`, center[0], center[1], rad, 14, toward, 31 + idx * 7 + kind.length);
      });
    }
    this.groupPools = groups;
    this.pools = pools;
  }

  /** Akşam buluşması (simülasyonda "meydan"): yarısı kendi mahallesinin çay bahçesine/parkına gider. */
  _placeOf(i, k) {
    const seg = this.plans[i][k];
    if (!seg || seg.ne !== "meydan") return seg?.yer;
    const key = "mahalle:" + this.homes[i].parts.mahalle;
    if (this.world.places[key] && roll(this.residents[i].seed, "yakin", this.day * 16 + k) % 100 < 50) return key;
    return "meydan";
  }

  /** Bir sakinin bir yerdeki modu: ne yapacak? */
  _mode(i, seg, k) {
    const s = this.residents[i].seed;
    if (seg.ne === "is") return `work:${this.works[i].wp.kind}:${this.works[i].wp.index}`;
    if (seg.ne === "hobi") {
      return {
        balik: "fish", kitap: "seat:park", resim: "easel", bisiklet: "bike", kosu: "jog", yuzme: "swim",
        yoga: "yoga", ucurtma: "kite", gitar: "seat:meydan", satranc: "seat:meydan", fotograf: "view", tavla: "seat:kahvehane",
      }[this.hobbies[i].id] ?? "group:" + seg.yer.replace("hobi:", "");
    }
    if (seg.ne === "meydan") {
      const m = roll(s, "meydanMod", this.day * 16 + k) % 100;
      const pl = this._placeOf(i, k);
      if (pl !== "meydan") return m < 55 ? "seat:" + pl : "group:" + pl;
      return m < 22 ? "seat:meydan" : m < 50 ? "seat:kafe" : m < 72 ? "shop" : "group:meydan";
    }
    return "group:meydan";
  }

  /** Gün başı: herkesin her yer ziyareti için rolünü varış sırasıyla ayırır. */
  _schedule() {
    for (const list of Object.values(this.pools)) for (const it of list) it.busy = [];
    for (const list of Object.values(this.groupPools)) for (const g of list) g.slots = g.slots.map(() => []);
    const free = (busy, a, b) => busy.every(([x, y]) => y <= a || x >= b);
    const requests = [];
    this.roles = this.plans.map(() => []);
    this.plans.forEach((plan, i) => {
      plan.forEach((seg, k) => {
        if (seg.ne === "yol" || seg.ne === "ev" || seg.ne === "uyku") return;
        if (seg.ne === "is" && !this.works[i].loc.outdoor) return;
        requests.push({ i, k, seg, mode: this._mode(i, seg, k) });
      });
    });
    requests.sort((a, b) => a.seg.bas - b.seg.bas || a.i - b.i);
    for (const q of requests) {
      const { i, k, seg } = q;
      const s = this.residents[i].seed;
      let mode = q.mode;
      let role = { mode };
      const pool = this.pools[mode] ?? (mode.startsWith("seat:") ? this.pools[mode] : null);
      if (pool?.length) {
        const start = roll(s, "yer" + mode, this.day) % pool.length;
        let item = null;
        // En yakın arkadaşı aynı anda aynı yerdeyse onun masasına otur.
        const f = this.stories?.friend[i] ?? -1;
        const fRole = f >= 0 ? this.roles[f]?.find((r, kk) => r?.item?.table && r.mode === mode && this.plans[f][kk].bas < seg.son && this.plans[f][kk].son > seg.bas) : null;
        if (fRole) item = pool.find((c) => c !== fRole.item && c.table && c.table[0] === fRole.item.table[0] && c.table[1] === fRole.item.table[1] && free(c.busy, seg.bas - 2, seg.son + 2)) ?? null;
        for (let n = 0; n < pool.length && !item; n++) {
          const cand = pool[(start + n) % pool.length];
          if (free(cand.busy, seg.bas - 2, seg.son + 2)) item = cand;
        }
        if (item) {
          item.busy.push([seg.bas - 2, seg.son + 2]);
          role = { mode, item };
        } else if (mode.startsWith("work:")) {
          role = { mode };
        } else {
          mode = "group:" + (mode.startsWith("seat:") ? mode.slice(5).replace("kafe", "meydan").replace("kahvehane", "meydan") : seg.yer.replace("hobi:", ""));
          role = { mode };
        }
      }
      if (mode.startsWith("group:")) {
        const key = mode.slice(6);
        const groups = this.groupPools[key];
        if (groups?.length) {
          let g0 = roll(s, "grup", this.day + k) % groups.length;
          // Arkadaşının grubu varsa önce ona katılmayı dener.
          const f = this.stories?.friend[i] ?? -1;
          const fRole = f >= 0 ? this.roles[f]?.find((r, kk) => r?.groupRef && r.mode === mode && this.plans[f][kk].bas < seg.son && this.plans[f][kk].son > seg.bas) : null;
          if (fRole) g0 = groups.indexOf(fRole.groupRef);
          for (let n = 0; n < groups.length && !role.group; n++) {
            const g = groups[(g0 + n) % groups.length];
            const slot = g.slots.findIndex((busy) => free(busy, seg.bas - 1, seg.son + 1));
            if (slot >= 0) {
              g.slots[slot].push([seg.bas - 1, seg.son + 1]);
              const a = (slot / g.cap) * Math.PI * 2 + (g.x * 0.37 + g.z * 0.11);
              const r = 0.5 + 0.13 * g.cap;
              const [x, z] = this.world.nearestWalkable(g.x + Math.cos(a) * r, g.z + Math.sin(a) * r, 2);
              role.group = { x, z, heading: Math.atan2(g.x - x, g.z - z) };
              role.groupRef = g;
            }
          }
        }
      }
      this.roles[i][k] = role;
    }
  }

  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    this.plans = this.residents.map((r) => dayPlan(r, day));
    this.dogs = this.residents.map((r) => pet(r, day) === "Köpek");
    this.travelCache.fill(null);
    this.tripStore = this.residents.map(() => new Map());
    if (this.traffic) {
      // Günlük park kayıtları sıfırlanır; evlerin önündeki sabit yerler korunur.
      this.traffic.resetBookings();
      this.homeSlot.forEach((slot) => { if (slot != null) this.traffic.slots[slot].busy.push([-1, 1e9]); });
    }
    this._schedule();
  }

  /** Yer için meydana giden yol (kapı/yer tarafından meydana doğru). */
  _roadPath(i, yer, k) {
    if (yer === "meydan" && k != null) yer = this._placeOf(i, k);
    if (yer === "ev") return this.homes[i].path;
    if (yer === "is") return this.works[i].loc.path;
    return this.world.placeOf(yer.replace("hobi:", "")).path;
  }

  /** Plan parçası k'nin başındaki ya da sonundaki konum (yolculuk uçları için). */
  _endpoint(i, k, atEnd) {
    const seg = this.plans[i][k];
    if (!seg) return this.homes[i].door;
    if (seg.ne === "ev" || seg.ne === "uyku") return this.homes[i].door;
    if (seg.ne === "is" && !this.works[i].loc.outdoor) return this.works[i].loc.door;
    const p = this._tmp;
    p.height = this.colors[i].height;
    resetPose(p);
    this._placeState(i, k, atEnd ? seg.son - 0.001 : seg.bas, 0, p);
    return [p.x, p.z];
  }

  /** Bir yerin yol ağına bağlandığı nokta: yerin meydana giden yolunda ağ üstündeki ilk nokta. */
  _access(i, yer, endpoint, k) {
    const path = this._roadPath(i, yer, k);
    for (let j = 0; j < path.length; j++) {
      if (this.nav.locate(path[j])) return { prefix: path.slice(0, j), point: path[j] };
    }
    // Meydanın içindeki yerler: en yakın meydan girişi.
    const gates = this.nav.plazaGates ?? [];
    let best = gates[0];
    for (const g of gates) if (Math.hypot(g.p[0] - endpoint[0], g.p[1] - endpoint[1]) < Math.hypot(best.p[0] - endpoint[0], best.p[1] - endpoint[1])) best = g;
    return { prefix: [], point: best ? best.p : endpoint };
  }

  /** İki nokta arası yaya yolu (kaldırımlardan); acc: yolun ağa bağlandığı yer. */
  _walkPts(i, A, accA, B, accB, k) {
    const s = this.residents[i].seed;
    const jitter = frac(roll(s, "serit")) - 0.5;
    const road = [...accA.prefix, ...this.nav.route(accA.point, accB.point), ...[...accB.prefix].reverse()];
    const side = roll(s, "kaldirim", k) % 2 ? 1 : -1;
    const pts = sidewalkPath(this.world, [A, ...road, B], side, jitter);
    const lens = lengths(pts);
    return { pts, lens, L: lens[lens.length - 1] };
  }

  /** Yol üstünde olmayan bir noktanın (park yeri, durak) yaya ağına bağlandığı nokta: yol ortası. */
  _onRoad(x, z) {
    const loc = this.traffic.locate([x, z], 14);
    if (!loc) return { prefix: [], point: [x, z] };
    const e = this.traffic.edges[loc.edge];
    const c = pointAt(e.center, e.cumC, loc.along);
    return { prefix: [], point: [c.x, c.z] };
  }

  /** Bir sonraki yolculuğun başladığı dakika (park kaydı bu saate kadar). */
  _nextTravel(i, k) {
    const plan = this.plans[i];
    for (let j = k + 1; j < plan.length; j++) if (plan[j].ne === "yol") return plan[j].bas;
    return 1440;
  }

  /** Arabanın şu an durduğu park yeri: bugünkü son araba yolculuğunun hedefi ya da ev önü. */
  carSlotBefore(i, k) {
    let slot = this.homeSlot[i];
    const store = this.tripStore[i];
    for (let j = 0; j < k; j++) {
      const t = store.get(j);
      if (t?.carTo != null) slot = t.carTo;
    }
    return slot;
  }

  /** Yolculuğu kurar: yürüyüş, araba, otobüs ya da taksi. Önceki yolculuklar (arabanın yeri için) önce kurulur. */
  _trip(i, seg, k) {
    const store = this.tripStore[i];
    if (store.has(k)) return store.get(k);
    for (let j = 0; j < k; j++) if (this.plans[i][j].ne === "yol" && !store.has(j)) this._trip(i, this.plans[i][j], j);
    const A = this._endpoint(i, k - 1, true), B = this._endpoint(i, k + 1, false);
    const accA = this._access(i, seg.nereden, A, k - 1), accB = this._access(i, seg.nereye, B, k + 1);
    const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const s = this.residents[i].seed;
    let trip = null;
    if (this.traffic && dist > 550) {
      if (this.hasCar[i]) trip = this._carTrip(i, seg, k, A, accA, B, accB, false);
      else {
        trip = this._busTrip(i, seg, k, A, accA, B, accB);
        if (!trip && roll(s, "taksi", this.day * 16 + k) % 100 < 35) trip = this._carTrip(i, seg, k, A, accA, B, accB, true);
      }
    }
    trip ??= this._walkTrip(i, seg, k, A, accA, B, accB);
    trip.seg = k;
    trip.fromWork = seg.nereden === "is";
    trip.doorA = seg.nereden === "ev" ? this.homes[i].building : seg.nereden === "is" && !this.works[i].loc.outdoor ? this.works[i].loc.building : null;
    trip.doorB = seg.nereye === "ev" ? this.homes[i].building : seg.nereye === "is" && !this.works[i].loc.outdoor ? this.works[i].loc.building : null;
    trip.hideAtA = !!trip.doorA || seg.nereden === "ev";
    trip.hideAtB = !!trip.doorB || seg.nereye === "ev";
    store.set(k, trip);
    return trip;
  }

  _walkTrip(i, seg, k, A, accA, B, accB) {
    const w = this.world;
    const s = this.residents[i].seed;
    const { pts, lens, L } = this._walkPts(i, A, accA, B, accB, k);
    const window = (seg.son - seg.bas) * 60;
    let v = this.speeds[i];
    let stops = [];
    if (L / v < window) {
      const slack = window - L / v;
      const total = Math.min(slack, 900);
      const pickStop = (f) => {
        let d = f * L;
        for (let tries = 0; tries < 30; tries++, d += 2) {
          along(pts, lens, Math.min(d, L - 1), this._at);
          const hit = w.roadIndex.at(this._at.x, this._at.z);
          if (!hit || hit.road.carriage === 0 || hit.dist > hit.road.carriage / 2 + 0.4) break;
        }
        return Math.min(d, L - 1);
      };
      stops = [
        { at: pickStop(0.25 + frac(roll(s, "mola1", k)) * 0.2), dur: total * 0.4, kind: roll(s, "molaTur", k) % 2 },
        { at: pickStop(0.6 + frac(roll(s, "mola2", k)) * 0.2), dur: total * 0.6, kind: (roll(s, "molaTur", k) + 1) % 2 },
      ].sort((x, y) => x.at - y.at);
      v = L / Math.max(1, window - total);
    } else {
      v = L / window;
    }
    return { mode: "yaya", legs: [{ kind: "walk", pts, lens, L, t0: seg.bas, t1: seg.son, v, stops }] };
  }

  /** Araba (kendi arabası) ya da taksi. Varış randevuya yetişecek şekilde çıkış saati ayarlanır. */
  _carTrip(i, seg, k, A, accA, B, accB, taxi) {
    const T = this.traffic;
    const v = this.speeds[i];
    let from, to, toSlot = null, pick, drop;
    if (taxi) {
      // Taksi: kapıya en yakın yol kenarından alır, hedefin yakınında indirir.
      const pa = this._onRoad(...(accA.point)), pb = this._onRoad(...(accB.point));
      from = pa.point; to = pb.point;
      pick = pa; drop = pb;
    } else {
      const fromSlot = this.carSlotBefore(i, k);
      if (fromSlot == null) return null;
      const slotA = T.slots[fromSlot];
      // Hedefin yakınında boş bir park yeri (gidişten bir sonraki yolculuğa kadar).
      const arrive = seg.son;
      toSlot = seg.nereye === "ev" ? this.homeSlot[i] : T.takeSlot(B[0], B[1], arrive - 1, this._nextTravel(i, k) + 1, 260);
      if (toSlot == null) return null;
      const slotB = T.slots[toSlot];
      from = T.slotLaneEntry(fromSlot);
      to = T.slotLaneEntry(toSlot);
      pick = slotA.kind === "otopark" ? { prefix: [], point: slotA.lot.gate } : this._onRoad(slotA.x, slotA.z);
      drop = slotB.kind === "otopark" ? { prefix: [], point: slotB.lot.gate } : this._onRoad(slotB.x, slotB.z);
      pick.car = [slotA.x, slotA.z];
      drop.car = [slotB.x, slotB.z];
    }
    const route = T.route(from, to);
    if (!route) return null;
    // Otoparkta park yerinden kapıya / kapıdan park yerine kısa manevra.
    if (!taxi) {
      const sa = T.slots[this.carSlotBefore(i, k)], sb = T.slots[toSlot];
      if (sa.kind === "otopark") route.pts.unshift([sa.x, sa.z]);
      if (sb.kind === "otopark") route.pts.push([sb.x, sb.z]);
      route.cum = lengths(route.pts);
      route.len = route.cum[route.cum.length - 1];
    }
    const carA = pick.car ?? route.pts[0], carB = drop.car ?? route.pts[route.pts.length - 1];
    const w1 = this._walkPts(i, A, accA, carA, pick, k);
    const w2 = this._walkPts(i, carB, drop, B, accB, k + 1);
    const drive = route.len / 9 / 60 + 0.25;
    const wait = taxi ? 1.5 : 0.3;
    let tw1 = w1.L / v / 60, tw2 = w2.L / v / 60;
    let total = tw1 + wait + drive + tw2;
    const window = seg.son - seg.bas;
    let scale = 1;
    if (total > window * 0.98) { scale = (window * 0.98) / total; total *= scale; }
    let t = Math.max(seg.bas, seg.son - total - 0.3);
    const legs = [];
    if (t > seg.bas) legs.push({ kind: "before", t0: seg.bas, t1: t });
    legs.push({ kind: "walk", ...w1, t0: t, t1: (t += tw1 * scale), stops: [] });
    legs.push({ kind: "wait", x: carA[0], z: carA[1], t0: t, t1: (t += wait * scale), taxiAt: taxi ? route : null });
    legs.push({ kind: "drive", route, taxi, t0: t, t1: (t += drive * scale) });
    legs.push({ kind: "walk", ...w2, t0: t, t1: (t += tw2 * scale), stops: [] });
    if (t < seg.son) legs.push({ kind: "after", t0: t, t1: seg.son, x: B[0], z: B[1] });
    for (const l of legs) if (l.kind === "walk") l.v = l.L / Math.max(1, (l.t1 - l.t0) * 60);
    return { mode: taxi ? "taksi" : "araba", legs, carTo: taxi ? null : toSlot, color: this.carColor[i] };
  }

  /** Otobüs: en yakın durağa yürü, ilk otobüsü bekle, bin, in, yürü. Randevuya yetişmiyorsa null. */
  _busTrip(i, seg, k, A, accA, B, accB) {
    const T = this.traffic;
    let best = null;
    T.lines.forEach((line, li) => {
      const sa = T.stopNearOnLine(li, A[0], A[1]), sb = T.stopNearOnLine(li, B[0], B[1]);
      if (!sa || !sb || sa.stop === sb.stop || sa.d > 480 || sb.d > 480) return;
      if (!best || sa.d + sb.d < best.sa.d + best.sb.d) best = { li, sa, sb, line };
    });
    if (!best) return null;
    const { line, li, sa, sb } = best;
    const stA = line.stops[sa.stop], stB = line.stops[sb.stop];
    const v = this.speeds[i];
    const w1 = this._walkPts(i, A, accA, stA.shelter, this._onRoad(...stA.shelter), k);
    const w2 = this._walkPts(i, stB.curb, this._onRoad(...stB.curb), B, accB, k + 1);
    let t = seg.bas;
    const atStop = t + w1.L / v / 60;
    const bus = T.nextBus(line, sa.stop, atStop + 0.2);
    if (bus == null) return null;
    const off = T.rideMinutes(line, sa.stop, sb.stop);
    const alight = bus + off + 0.35;
    const arrive = alight + w2.L / v / 60;
    if (arrive > seg.son + 0.5) return null;
    const legs = [
      { kind: "walk", ...w1, t0: t, t1: atStop, stops: [] },
      { kind: "wait", x: stA.shelter[0], z: stA.shelter[1], heading: stA.heading - Math.PI / 2, t0: atStop, t1: bus },
      { kind: "bus", line: li, t0: bus, t1: alight },
      { kind: "walk", ...w2, t0: alight, t1: arrive, stops: [] },
    ];
    if (arrive < seg.son) legs.push({ kind: "after", t0: arrive, t1: seg.son, x: B[0], z: B[1] });
    for (const l of legs) if (l.kind === "walk") l.v = l.L / Math.max(1, (l.t1 - l.t0) * 60);
    return { mode: "otobus", legs, line: li };
  }

  /** Sakinin şu an bulunduğu nokta: dışarıdaysa kendisi, içerideyse bulunduğu binanın kapısı. */
  focusPoint(i) {
    if (this.visible[i]) return [this.positions[i * 3], this.positions[i * 3 + 2]];
    const seg = this.activities[i];
    if (!seg || seg.ne === "uyku" || seg.ne === "ev" || seg.ne === "yol") return this.homes[i].door;
    if (seg.ne === "is") return this.works[i].loc.door;
    return this.homes[i].door;
  }

  /** Bir yerde (plan parçası k) verilen dakikadaki konum ve duruş. Görünmüyorsa false. */
  _placeState(i, k, minute, t, p) {
    const w = this.world;
    const seg = this.plans[i][k];
    const role = this.roles[i]?.[k] ?? { mode: "group:meydan" };
    const s = this.residents[i].seed;
    const kk = p.height / 1.75;
    const ph = frac(s) * 6.283;
    const sec = minute * 60;
    const at = this._at;
    const stand = (x, z, heading) => { p.x = x; p.z = z; p.heading = heading; p.y = w.groundY(x, z); };
    const pingPong = (pts, speed, offset = 0) => {
      const lens = lengths(pts);
      const L = lens[lens.length - 1];
      let d = (sec * speed + offset) % (2 * L);
      const back = d > L;
      if (back) d = 2 * L - d;
      along(pts, lens, d, at);
      return { d, back, heading: back ? at.heading + Math.PI : at.heading };
    };
    const it = role.item;

    if (role.mode.startsWith("work:")) {
      const loc = this.works[i].loc;
      const [ax, az] = it ? [it.x, it.z] : loc.anchor;
      switch (this.works[i].job) {
        case "liman_iscisi": {
          // Kasaları iskelenin başından vapura taşır.
          const pier = loc.anchor;
          const lane = pier[0] - 3 + (s % 3) * 1.2;
          const r = pingPong([[lane, pier[1] - 14], [lane, pier[1] + 14]], 1.0, ph * 10);
          stand(at.x, at.z, r.heading);
          walkPose(p, r.d / (0.72 * kk) * Math.PI);
          if (!r.back) { p.props = ["kasa"]; p.shL = p.shR = 0.9; p.elL = p.elR = 1.1; p.abL = p.abR = 0.05; }
          return true;
        }
        case "zeytinci": case "bahcivan": {
          // Tarlada sıra boyunca ağır ağır ilerleyip eğilerek toplar.
          const row = ((s % 7) - 3) * 2.4;
          const r = pingPong([[ax - 32, az + row], [ax + 32, az + row]], 0.06, ph * 50);
          stand(at.x, at.z, r.heading);
          const bend = Math.max(0, Math.sin(t * 0.6 + ph));
          p.lean = 0.25 + 0.75 * bend; p.hipL = p.hipR = 0.3 * bend; p.kneeL = p.kneeR = 0.35 * bend;
          p.shL = p.shR = 0.6 + 0.6 * bend; p.elL = p.elR = 0.4;
          return true;
        }
        case "cankurtaran": {
          const tower = w.features.find((f) => f.type === "cankurtaran");
          if (tower) {
            stand(tower.x, tower.z, Math.PI * 0.05);
            p.y = w.groundY(tower.x, tower.z);
            sitPose(p, w.groundY(tower.x, tower.z) + 2.75, kk);
            p.headYaw = 0.7 * Math.sin(t * 0.15 + ph);
            return true;
          }
          break;
        }
        case "fener_bekcisi": {
          // Kapısının önünde durur, arada uçurum kenarındaki seyir noktasına yürüyüp denizi gözetler.
          const view = w.places.fener.spots[s % w.places.fener.spots.length];
          const door = w.fener.door;
          const cycle = (sec / 60 + ph * 10) % 40; // dakika
          if (cycle < 26) {
            stand(door[0], door[1], Math.atan2(view.x - door[0], view.z - door[1]));
            idleGesture(p, t, ph, false);
          } else if (cycle < 30 || cycle > 36) {
            const u = cycle < 30 ? (cycle - 26) / 4 : 1 - (cycle - 36) / 4;
            const x = door[0] + (view.x - door[0]) * u, z = door[1] + (view.z - door[1]) * u;
            stand(x, z, Math.atan2((view.x - door[0]) * (cycle < 30 ? 1 : -1), (view.z - door[1]) * (cycle < 30 ? 1 : -1)));
            walkPose(p, (u * Math.hypot(view.x - door[0], view.z - door[1])) / (0.72 * kk) * Math.PI);
          } else {
            stand(view.x, view.z, view.heading);
            p.shL = p.shR = 1.3; p.elL = p.elR = 2.2; p.headPitch = -0.05; // dürbünle bakar gibi
          }
          return true;
        }
        case "balikci": {
          stand(ax, az, it?.heading ?? 0);
          p.drop = 0.38 * kk; p.hipL = p.hipR = 1.25; p.kneeL = p.kneeR = 2.0; p.lean = 0.35;
          p.shL = p.shR = 0.8; p.elL = p.elR = 0.9 + 0.2 * Math.sin(t * 2 + ph);
          return true;
        }
        case "gemi_ustasi": {
          stand(ax, az, it?.heading ?? 0);
          const hit = Math.max(0, Math.sin(t * 2.2 + ph));
          p.shR = 1.0 + 1.3 * hit; p.elR = 0.4 + 0.8 * (1 - hit); p.lean = 0.15;
          return true;
        }
      }
      stand(ax, az, it?.heading ?? ph);
      idleGesture(p, t, ph, true);
      return true;
    }

    // Oturanlar: bankta, kafede, kahvehanede. Yaklaşır, oturur; kalkar, gider.
    if (role.mode.startsWith("seat:") && it) {
      const since = (minute - seg.bas) * 60, until = (seg.son - minute) * 60;
      const u = smooth(clamp(Math.min(since, until) / 1.6, 0, 1));
      const fx = Math.sin(it.heading), fz = Math.cos(it.heading);
      const ax = it.x + fx * 0.55, az = it.z + fz * 0.55;
      p.x = ax + (it.x - ax) * u; p.z = az + (it.z - az) * u; p.heading = it.heading;
      const st = this._stand, si = this._sit;
      st.height = si.height = p.height;
      resetPose(st); st.y = w.groundY(ax, az);
      resetPose(si); sitPose(si, it.top, kk);
      blendPose(p, st, si, u);
      if (u >= 1) {
        const hobbyId = seg.ne === "hobi" ? this.hobbies[i].id : null;
        if (hobbyId === "kitap") { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; p.props = ["kitap"]; }
        else if (hobbyId === "gitar") { p.shR = 0.5; p.elR = 1.3 + 0.25 * Math.sin(t * 6 + ph); p.shL = 0.8; p.abL = 0.3; p.elL = 1.6; p.headPitch = 0.25; p.props = ["gitar"]; }
        else if (it.table && seg.ne === "hobi") {
          const move = Math.max(0, Math.sin(t * 0.7 + ph)) ** 6;
          p.lean = 0.25; p.shL = 0.6; p.elL = 1.4; p.shR = 0.7 + 0.5 * move; p.elR = 1.3 - 0.6 * move; p.headPitch = 0.4;
        } else if (it.table) {
          const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
          idleGesture(p, t, ph, sip < 0.1 && roll(s, "konuskan") % 2 === 0);
          p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip); p.lean = 0.12;
        } else {
          idleGesture(p, t, ph, roll(s, "konuskan") % 2 === 0);
          p.shL = 0.35; p.elL = 0.9;
          if (roll(s, "telefoncu") % 4 === 0) { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
        }
      } else {
        p.moving = since < 1.6 || until < 1.6;
      }
      return true;
    }

    switch (role.mode) {
      case "fish": {
        stand(it.x, it.z, it.heading);
        const cast = Math.max(0, Math.sin(t * 0.08 + ph)) ** 8;
        p.shR = 0.75 + 1.0 * cast; p.elR = 0.9 - 0.6 * cast; p.shL = 0.55; p.elL = 1.0;
        p.props = ["olta"];
        return true;
      }
      case "view": {
        stand(it.x, it.z, it.heading + 0.3 * Math.sin(t * 0.05 + ph));
        p.shR = 1.25; p.elR = 2.1; p.shL = 1.15; p.elL = 2.0; p.abL = -0.2;
        p.props = ["fotograf"];
        return true;
      }
      case "easel": {
        stand(it.x, it.z, it.heading);
        p.shR = 1.3 + 0.15 * Math.sin(t * 1.5 + ph); p.elR = 0.5; p.headPitch = 0.05;
        p.props = ["sovale"];
        return true;
      }
      case "kite": {
        stand(it.x, it.z, it.heading + 0.3 * Math.sin(t * 0.05 + ph));
        p.shL = p.shR = 1.7; p.elL = p.elR = 0.4; p.headPitch = -0.55;
        p.props = ["ucurtma"];
        return true;
      }
      case "yoga": {
        stand(it.x, it.z, it.heading);
        const pose = Math.floor((t / 20 + ph) % 3);
        if (pose === 0) { p.shL = p.shR = 3.0; p.elL = p.elR = 0; p.kneeR = 0.6; p.hipR = 0.9; p.abR = 0.5; }
        else if (pose === 1) { p.abL = p.abR = 1.5; p.hipL = 0.6; p.kneeL = 0.6; p.hipR = -0.4; p.headYaw = 1.2; }
        else { p.lean = 1.3; p.shL = p.shR = 2.6; }
        p.props = ["mat"];
        return true;
      }
      case "swim": {
        // Yüzer; arada kumsaldaki havlusuna uzanır.
        if (Math.floor(sec / 900 + ph) % 5 >= 3) {
          const towel = this.pools.towel?.[s % (this.pools.towel?.length || 1)];
          if (towel) {
            p.x = towel.x; p.z = towel.z; p.heading = Math.PI; p.y = w.groundY(towel.x, towel.z) + 0.12; p.lie = Math.PI / 2;
            p.shL = p.shR = 0.1; p.abL = p.abR = 0.15; p.elL = p.elR = 0.2;
            p.props = ["havlu"]; p.sleeves = false; p.shorts = true;
            return true;
          }
        }
        const a = sec * 0.012 + ph;
        p.x = it.x + Math.cos(a) * 4; p.z = it.z + Math.sin(a) * 3;
        p.heading = Math.atan2(-Math.sin(a), Math.cos(a));
        p.y = -1.25 * kk; p.lean = 0.9;
        p.shL = 1.5 + 1.6 * Math.sin(t * 2 + ph); p.shR = 1.5 + 1.6 * Math.sin(t * 2 + ph + Math.PI);
        p.elL = p.elR = 0.3; p.radius = 0;
        return true;
      }
      case "bike": case "jog": {
        const prom = w.promenade;
        const run = role.mode === "jog";
        const lane = prom.map(([x, z]) => [x, z + (run ? -1.7 : 1.7)]);
        const r = pingPong(lane, run ? 2.7 : 4.5, ph * 400);
        stand(at.x, at.z, r.heading);
        if (run) {
          walkPose(p, r.d / (1.1 * kk) * Math.PI, 1);
          p.sleeves = false;
        } else {
          // Bisiklet: sele 0,95 m'de; ayaklar pedala kilitli (ters kinematik).
          const ground = p.y;
          p.y = ground + 0.95 - 0.92 * kk;
          p.groundY = ground;
          const crank = r.d / 2.1;
          for (const [sideAng, hipKey, kneeKey] of [[0, "hipL", "kneeL"], [Math.PI, "hipR", "kneeR"]]) {
            const fz = 0.32 + 0.17 * Math.sin(crank + sideAng), fy = 0.3 + 0.17 * Math.cos(crank + sideAng);
            const ik = legIK(fz / kk, (fy - 0.95) / kk);
            p[hipKey] = ik.hip; p[kneeKey] = ik.knee;
          }
          p.lean = 0.42; p.shL = p.shR = 1.0; p.elL = p.elR = 0.35; p.abL = p.abR = 0.06; p.headPitch = -0.3;
          p.props = ["bisiklet"]; p.radius = 0.6;
          p.moving = true;
        }
        return true;
      }
      case "shop": {
        const walk = w.carsiWalks[roll(s, "carsiYol", this.day) % w.carsiWalks.length];
        const r = pingPong(walk, 0.85 + frac(roll(s, "gezHiz")) * 0.35, ph * 200);
        const look = Math.sin(sec / 40 + ph) > 0.75;
        const alongX = walk[0][1] === walk[1][1];
        const shopSide = alongX ? (walk[0][1] < 0 ? Math.PI : 0) : walk[0][0] < 0 ? -Math.PI / 2 : Math.PI / 2;
        stand(at.x, at.z, look ? shopSide : r.heading);
        if (!look) walkPose(p, r.d / (0.72 * kk) * Math.PI);
        else idleGesture(p, t, ph, false);
        p.dog = true;
        return true;
      }
    }

    // Sohbet grubu (ya da yer kalmadıysa yerin yakınında durma).
    const g = role.group;
    if (g) {
      stand(g.x, g.z, g.heading);
    } else {
      const place = w.placeOf((this._placeOf(i, k) ?? seg.yer).replace("hobi:", ""));
      const a = place.anchors[s % place.anchors.length];
      const [x, z] = w.nearestWalkable(a[0] + ((s % 7) - 3) * 1.4, a[1] + (((s >> 3) % 7) - 3) * 1.4, 6);
      stand(x, z, ph);
    }
    idleGesture(p, t, ph, true);
    p.dog = true;
    return true;
  }

  /** Sakinlerin konumlarını verilen dakikaya göre günceller ve çizim listesini kurar. */
  update(minute, time) {
    const crowd = this.crowd, at = this._at;
    const w = this.world;
    this.openDoors.clear();
    this.vehicleStates = [];
    const shown = [];
    for (let i = 0; i < this.n; i++) {
      const plan = this.plans[i];
      let k = 0;
      while (k < plan.length - 1 && minute >= plan[k].son) k++;
      const seg = activityAt(plan, minute);
      this.activities[i] = seg;
      this.currentPlace[i] = seg.ne === "meydan" ? this._placeOf(i, k) : null;
      this.athome[i] = seg.ne === "ev" ? 1 : 0;
      const c = this.colors[i];
      const p = this.poses[i];
      resetPose(p);
      p.height = c.height; p.t = time; p.sleeves = c.sleeves; p.shorts = false;
      let atWork = false;

      if (seg.ne === "uyku" || seg.ne === "ev") {
        this.homeActs[i] = null;
        if (this.dollhouse?.contains(i) && this.dollhouse.pose(i, seg, minute, time, p)) {
          this.homeActs[i] = p.activity;
          shown.push(i);
          p.indoor = true;
          continue;
        }
        this.visible[i] = 0;
        continue;
      }
      p.indoor = false;

      if (seg.ne === "yol") {
        const trip = this._trip(i, seg, k);
        this.travelCache[i] = trip;
        const leg = trip.legs.find((l) => minute < l.t1) ?? trip.legs[trip.legs.length - 1];
        p.mode = trip.mode;
        if (leg.kind === "before" || leg.kind === "after") {
          // Çıkmadan önce içeride (ya da yerinde) bekler; vardıktan sonra kapıdan girer.
          if ((leg.kind === "before" && trip.hideAtA) || (leg.kind === "after" && trip.hideAtB)) { this.visible[i] = 0; continue; }
          const [x, z] = leg.kind === "after" ? [leg.x, leg.z] : trip.legs[1]?.pts?.[0] ?? [0, 0];
          p.x = x; p.z = z; p.y = w.groundY(x, z); p.heading = 0;
          idleGesture(p, time, i, false);
        } else if (leg.kind === "walk") {
          let el = (minute - leg.t0) * 60;
          let d = 0, stop = null, last = 0;
          for (const st of leg.stops) {
            const reach = (st.at - last) / leg.v;
            if (el < reach) break;
            el -= reach; d = st.at; last = st.at;
            if (el < st.dur) { stop = st; el = 0; break; }
            el -= st.dur;
          }
          if (!stop) d = Math.min(leg.L, d + el * leg.v);
          along(leg.pts, leg.lens, d, at);
          p.x = at.x; p.z = at.z; p.heading = at.heading;
          p.y = w.groundY(at.x, at.z);
          if (stop) {
            p.heading += stop.kind ? Math.PI / 2 : 0;
            idleGesture(p, time, i, false);
            if (!stop.kind) { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
          } else {
            walkPose(p, d / (0.72 * (c.height / 1.75)) * Math.PI);
          }
          p.dog = trip.mode === "yaya";
          p.phase = d;
          if (leg === trip.legs.find((l) => l.kind === "walk") && trip.doorA && d < 2.5) this.openDoors.add(trip.doorA);
          if (leg === trip.legs.findLast((l) => l.kind === "walk") && trip.doorB && leg.L - d < 2.5) this.openDoors.add(trip.doorB);
        } else if (leg.kind === "wait") {
          p.x = leg.x; p.z = leg.z; p.y = w.groundY(leg.x, leg.z);
          p.heading = leg.heading ?? 0;
          idleGesture(p, time, i, false);
          if (roll(this.residents[i].seed, "durakTel") % 2) { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
          // Taksi son saniyelerde gelip kaldırım kenarında bekler.
          if (leg.taxiAt && (leg.t1 - minute) * 60 < 25) {
            const r = leg.taxiAt;
            this.vehicleStates.push({ x: r.pts[0][0], z: r.pts[0][1], heading: Math.atan2(r.pts[1][0] - r.pts[0][0], r.pts[1][1] - r.pts[0][1]), color: 0, taxi: true });
          }
        } else if (leg.kind === "drive") {
          const r = leg.route;
          const u = (minute - leg.t0) / (leg.t1 - leg.t0);
          const pos = pointAt(r.pts, r.cum, u * r.len);
          this.vehicleStates.push({ x: pos.x, z: pos.z, heading: pos.heading, color: trip.color ?? 0, taxi: leg.taxi, owner: i });
          this.visible[i] = 0;
          continue;
        } else {
          // Otobüste.
          this.visible[i] = 0;
          continue;
        }
        atWork = trip.fromWork;
      } else {
        if (seg.ne === "is" && !this.works[i].loc.outdoor) { this.visible[i] = 0; continue; }
        if (!this._placeState(i, k, minute, time, p)) { this.visible[i] = 0; continue; }
        atWork = seg.ne === "is";
        p.phase = time * 2;
      }
      p.atWork = atWork;
      shown.push(i);
    }

    // Park halindeki arabalar: sürülmeyen her araba, bugünkü son araba yolculuğunun hedefinde ya da ev önünde.
    this.parked = [];
    if (this.traffic) {
      const driving = new Set(this.vehicleStates.map((v) => v.owner));
      for (let i = 0; i < this.n; i++) {
        if (!this.hasCar[i] || driving.has(i)) continue;
        const plan = this.plans[i];
        let k = 0;
        while (k < plan.length - 1 && minute >= plan[k].son) k++;
        // Önceki yolculuklar kurulmamışsa (ör. sayfa gün ortasında açıldıysa) şimdi kur.
        if (!this._ensured?.[i] || this._ensured[i] < k) {
          for (let j = 0; j < k; j++) if (plan[j].ne === "yol") this._trip(i, plan[j], j);
          (this._ensured ??= [])[i] = k;
        }
        let slot = this.carSlotBefore(i, k);
        const cur = plan[k];
        if (cur.ne === "yol") {
          const trip = this.tripStore[i].get(k);
          const drive = trip?.legs.find((l) => l.kind === "drive");
          if (drive && minute >= drive.t1 && trip.carTo != null) slot = trip.carTo;
        }
        if (slot != null) this.parked.push([slot, this.carColor[i]]);
      }
    }

    // Yürüyenler birbirine çok yaklaşırsa yana çekilir (oturan ve duranların içinden geçilmez).
    const grid = new Map();
    for (const i of shown) {
      const p = this.poses[i];
      if (p.indoor || !p.radius) continue;
      const key = Math.floor(p.x) * 100003 + Math.floor(p.z);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    for (const i of shown) {
      const p = this.poses[i];
      if (!p.moving || p.indoor || !p.radius) continue;
      const gx = Math.floor(p.x), gz = Math.floor(p.z);
      let px = 0, pz = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get((gx + dx) * 100003 + gz + dz) ?? []) {
            if (j === i) continue;
            const q = this.poses[j];
            const ox = p.x - q.x, oz = p.z - q.z;
            const dist = Math.hypot(ox, oz);
            const min = p.radius + q.radius;
            if (dist >= min || dist < 1e-4) continue;
            // Yürüme yönüne dik, uzaklaşan yana itilir.
            const sx = Math.cos(p.heading), sz = -Math.sin(p.heading);
            const sign = ox * sx + oz * sz >= 0 ? 1 : -1;
            const push = (min - dist) * (q.moving ? 0.5 : 1);
            px += sx * sign * push; pz += sz * sign * push;
          }
        }
      }
      if (px || pz) {
        const nx = p.x + px, nz = p.z + pz;
        if (w.isWalkable(nx, nz)) { p.x = nx; p.z = nz; }
      }
    }

    crowd.begin();
    for (const i of shown) {
      const p = this.poses[i];
      const c = this.colors[i];
      this.visible[i] = 1;
      this.positions[i * 3] = p.x; this.positions[i * 3 + 1] = p.y; this.positions[i * 3 + 2] = p.z;
      p.style = c.style; p.skin = c.skin; p.hairColor = c.hairColor;
      p.skirt = c.skirt && !(p.atWork && c.uniform) && !p.props?.includes("bisiklet");
      p.beard = c.beard; p.glasses = c.glasses;
      p.top = p.atWork && c.uniform ? c.uniform : c.top;
      p.bottom = c.bottom;
      crowd.add(i, p);
      if (p.dog && this.dogs[i] && !p.indoor) {
        const side = 0.75;
        const dx = Math.cos(p.heading) * side, dz = -Math.sin(p.heading) * side;
        const x = p.x + dx + Math.sin(p.heading) * 0.5, z = p.z + dz + Math.cos(p.heading) * 0.5;
        if (w.isWalkable(x, z)) crowd.addDog(x, w.groundY(x, z), z, p.heading, (p.phase ?? 0) * 1.6, DOG_COLORS[this.residents[i].seed % DOG_COLORS.length]);
      }
    }
    crowd.end();
    this.visibleCount = shown.length;
  }

  /** Dokunulan figürün sakin indeksi. */
  pick(raycaster) {
    for (const mesh of this.crowd.pickTargets()) {
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit?.instanceId != null) return this.crowd.drawToIndex[hit.instanceId];
    }
    return null;
  }
}
