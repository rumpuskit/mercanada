// Sakinler: günlük planına göre evden çıkar, işe gider, hobisini yapar, meydanda arkadaşlarıyla buluşur.
// Plan simülasyondan gelir (sim.js); burada o planın sokakta nasıl göründüğü kurulur:
//  - Yürüyüş: herkesin kendi hızı var (1,1-1,5 m/s), kaldırımdan yürür, köşeleri yuvarlak döner;
//    erken kalırsa yolda durur (vitrine bakar, telefonuna bakar), köpeği varsa yanında yürür.
//  - Yerinde: meydanda gruplar halinde sohbet eder ya da bankta oturur, kahvehanede tavla oynar,
//    iskelede balık tutar, sahilde koşar ya da bisiklete biner, plajda yüzer, güneşlenir, yoga yapar,
//    tepede uçurtma uçurur, fenerde fotoğraf çeker, parkta kitap okur ya da resim yapar.
//  - İşte: dışarıda çalışanlar işini yapar (kasa taşır, tarlada eğilir, kulede nöbet tutar...).
// Oturak ve grup yerleri her karede sırayla dağıtılır; aynı yere iki kişi oturmaz.
import { Color } from "three";
import { activityAt, dayPlan, hobby, job, look, pet, roll, workplace } from "../sim.js";
import { Crowd } from "./human.js";
import * as P from "./palette.js";

// Dışarıda çalışanlar iş başındayken iş kıyafeti giyer.
const UNIFORMS = {
  cankurtaran: "#e0463c", liman_iscisi: "#f28c28", balikci: "#f2c230", gemi_ustasi: "#33507a",
  bahcivan: "#6a8f3c", zeytinci: "#7d8a4e", fener_bekcisi: "#2f3f5f", rehber: "#3e8a86",
};
const DOG_COLORS = ["#8a5a32", "#2b2622", "#e8dcc4", "#c9954f", "#6b6b6b"].map((c) => new Color(c));
const SIDEWALK = 4.9; // yol ortasından kaldırıma

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (n) => (n % 10000) / 10000;

/** Yol çizgisini kaldırıma kaydırır ve köşeleri yuvarlar. Uç noktalar (kapı, yer) sabit kalır. */
function sidewalkPath(pts, d) {
  const off = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i - 1], [x, z] = pts[i], [nx, nz] = pts[i + 1];
    let ax = x - px, az = z - pz, bx = nx - x, bz = nz - z;
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    let mx = -(az + bz), mz = ax + bx;
    const lm = Math.hypot(mx, mz);
    if (lm < 1e-3) { mx = -az; mz = ax; } else { mx /= lm; mz /= lm; }
    const cos = Math.max(0.5, mx * -az + mz * ax);
    off.push([x + (mx * d) / cos, z + (mz * d) / cos]);
  }
  off.push(pts[pts.length - 1]);
  // Köşe yuvarlama: her iç köşeyi, iki komşu parça üzerinde 2,5 m geriden iki noktayla değiştir.
  const out = [off[0]];
  for (let i = 1; i < off.length - 1; i++) {
    const [px, pz] = off[i - 1], [x, z] = off[i], [nx, nz] = off[i + 1];
    const la = Math.hypot(x - px, z - pz), lb = Math.hypot(nx - x, nz - z);
    const r = Math.min(2.5, la / 2.2, lb / 2.2);
    if (r < 0.3) { out.push(off[i]); continue; }
    out.push([x - ((x - px) / la) * r, z - ((z - pz) / la) * r]);
    out.push([x + ((nx - x) / lb) * r, z + ((nz - z) / lb) * r]);
  }
  out.push(off[off.length - 1]);
  return out;
}

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

// --- duruşlar ---

export function resetPose(p) {
  p.lie = 0; p.drop = 0; p.lean = 0; p.twist = 0; p.headYaw = 0; p.headPitch = 0;
  p.hipL = 0; p.hipR = 0; p.kneeL = 0; p.kneeR = 0;
  p.shL = 0; p.shR = 0; p.abL = 0; p.abR = 0; p.elL = 0.12; p.elR = 0.12;
  p.props = null;
}

/** Yürüyüş: φ adım evresi; koşu için run = 1. */
export function walkPose(p, phi, run = 0) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const hipA = run ? 0.62 : 0.42, kneeA = run ? 1.25 : 0.7;
  p.hipL = hipA * s; p.hipR = -hipA * s;
  p.kneeL = 0.1 + kneeA * Math.max(0, c) * (0.6 + 0.4 * Math.max(0, -s));
  p.kneeR = 0.1 + kneeA * Math.max(0, -c) * (0.6 + 0.4 * Math.max(0, s));
  p.shL = -(run ? 0.55 : 0.32) * s; p.shR = (run ? 0.55 : 0.32) * s;
  p.elL = run ? 1.45 : 0.2 + 0.18 * Math.max(0, -s); p.elR = run ? 1.45 : 0.2 + 0.18 * Math.max(0, s);
  p.lean = run ? 0.16 : 0.03;
  p.twist = 0.06 * s;
  p.y += (run ? 0.05 : 0.025) * Math.abs(Math.cos(phi));
}

export function sitPose(p, top, k) {
  p.y = top + 0.06 - 0.92 * k;
  p.hipL = p.hipR = 1.5; p.kneeL = p.kneeR = 1.45;
  p.shL = p.shR = 0.35; p.elL = p.elR = 0.9; p.abL = p.abR = -0.02;
  p.lean = -0.05;
}

export function idleGesture(p, t, phase, talk) {
  // Ağırlığını değiştirir, arada konuşurken elleriyle anlatır.
  p.twist = 0.05 * Math.sin(t * 0.4 + phase);
  p.headYaw = 0.25 * Math.sin(t * 0.3 + phase * 2);
  if (talk) {
    const g = Math.max(0, Math.sin(t * 0.9 + phase));
    p.shR = 0.35 + 0.5 * g; p.elR = 0.6 + 0.9 * g; p.abR = 0.05 * g;
    p.shL = 0.1 * g; p.elL = 0.3;
  }
  p.kneeL = 0.06 + 0.06 * Math.max(0, Math.sin(t * 0.25 + phase));
}

export class People {
  constructor(world, residents) {
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
        uniform: uniform ? new Color(uniform) : null,
      };
    });

    // Oturaklar yere göre.
    this.seatsByPlace = {};
    for (const s of world.seats) (this.seatsByPlace[s.place] ??= []).push(s);

    this.slotToIndex = new Map(residents.map((r, i) => [r.slot, i]));
    this.homeActs = new Array(this.n);
    this.dollhouse = null; // ev içi görünümü açıksa o kattaki sakinler içeride çizilir

    this.crowd = new Crowd(this.n);
    this.group = this.crowd.group;
    this.pose = {};
    this._at = {};
  }

  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    this.plans = this.residents.map((r) => dayPlan(r, day));
    this.dogs = this.residents.map((r) => pet(r, day) === "Köpek");
    this.travelCache.fill(null);
  }

  /** Bir yer adının (ev, is, meydan, hobi:park...) bu sakin için konumu ve meydana giden yolu. */
  location(i, yer) {
    if (yer === "ev") return { spot: this.homes[i].door, path: this.homes[i].path, indoor: true };
    if (yer === "is") {
      const { loc } = this.works[i];
      return { spot: this._spot(i, "is", [loc.anchor], loc.spread), path: loc.path, indoor: !loc.outdoor, name: loc.name };
    }
    const name = yer.startsWith("hobi:") ? yer.slice(5) : yer;
    const place = this.world.placeOf(name);
    return { spot: this._spot(i, name, place.anchors, place.spread), path: place.path, indoor: false, place: name };
  }

  _spot(i, tag, anchors, spread) {
    const s = this.residents[i].seed;
    const a = anchors[roll(s, "nokta_" + tag) % anchors.length];
    const ang = frac(roll(s, "aci_" + tag)) * Math.PI * 2;
    const rad = Math.sqrt(frac(roll(s, "uzak_" + tag))) * spread;
    return [a[0] + Math.cos(ang) * rad, a[1] + Math.sin(ang) * rad];
  }

  /** Yolculuk: kaldırımdan, kişinin kendi hızında; artan süre yolda iki kısa mola olarak geçer. */
  _trip(i, seg, segIndex) {
    const from = this.location(i, seg.nereden), to = this.location(i, seg.nereye);
    const a = from.path, b = to.path;
    let k = 0;
    while (k < a.length && k < b.length && a[a.length - 1 - k][0] === b[b.length - 1 - k][0] && a[a.length - 1 - k][1] === b[b.length - 1 - k][1]) k++;
    const road = [...a.slice(0, a.length - k + 1), ...b.slice(0, b.length - k).reverse()];
    const s = this.residents[i].seed;
    const side = roll(s, "kaldirim", segIndex) % 2 ? 1 : -1;
    const lane = SIDEWALK + (frac(roll(s, "serit")) - 0.5) * 0.9;
    const pts = sidewalkPath([from.spot, ...road, to.spot], side * lane);
    const lens = lengths(pts);
    const L = lens[lens.length - 1];
    const window = (seg.son - seg.bas) * 60;
    let v = this.speeds[i];
    const walkTime = L / v;
    let stops = [];
    if (walkTime < window) {
      const slack = window - walkTime;
      const stopTotal = Math.min(slack, 900);
      const f1 = 0.25 + frac(roll(s, "mola1", segIndex)) * 0.25, f2 = 0.6 + frac(roll(s, "mola2", segIndex)) * 0.25;
      stops = [{ at: f1 * L, dur: stopTotal * 0.4, kind: roll(s, "molaTur", segIndex) % 2 }, { at: f2 * L, dur: stopTotal * 0.6, kind: (roll(s, "molaTur", segIndex) + 1) % 2 }];
      v = L / Math.max(1, window - stopTotal);
    } else {
      v = L / window;
    }
    return { seg: segIndex, pts, lens, L, v, stops, toWork: seg.nereye === "is", fromWork: seg.nereden === "is" };
  }

  /** Sakinin şu an bulunduğu nokta: dışarıdaysa kendisi, içerideyse bulunduğu binanın kapısı. */
  focusPoint(i) {
    if (this.visible[i]) return [this.positions[i * 3], this.positions[i * 3 + 2]];
    const seg = this.activities[i];
    if (!seg || seg.ne === "uyku" || seg.ne === "ev" || seg.ne === "yol") return this.homes[i].door;
    const loc = this.location(i, seg.yer);
    return seg.yer === "is" ? this.works[i].loc.door : loc.spot;
  }

  _takeSeat(place, i, prefer) {
    const seats = this.seatsByPlace[place];
    if (!seats?.length) return null;
    for (let k = 0; k < seats.length; k++) {
      const idx = (prefer + k) % seats.length;
      if (!this.taken.has(seats[idx])) {
        this.taken.add(seats[idx]);
        return seats[idx];
      }
    }
    return null;
  }

  /** Grup sohbeti: aynı gruptakiler merkezin çevresine altın açıyla dizilir, merkeze bakar. */
  _groupSpot(key, cx, cz, out) {
    const n = this.groups.get(key) ?? 0;
    this.groups.set(key, n + 1);
    const a = n * 2.39996;
    const r = 0.75 + 0.18 * Math.sqrt(n);
    out.x = cx + Math.cos(a) * r;
    out.z = cz + Math.sin(a) * r;
    out.heading = Math.atan2(cx - out.x, cz - out.z);
    return out;
  }

  /** Bir yerdeki davranış: konum, duruş ve eşyalar. */
  _atPlace(i, seg, loc, minute, t, p) {
    const s = this.residents[i].seed;
    const k = p.height / 1.75;
    const ph = frac(s) * 6.283;
    const sec = minute * 60;
    const w = this.world;
    const at = this._at;
    const place = seg.ne === "is" ? "is" : loc.place;
    const hobbyId = seg.ne === "hobi" ? this.hobbies[i].id : null;
    p.dog = false;

    const stand = (x, z, heading) => {
      p.x = x; p.z = z; p.heading = heading; p.y = w.groundY(x, z);
    };
    const pingPong = (pts, speed, offset = 0) => {
      const lens = lengths(pts);
      const L = lens[lens.length - 1];
      let d = (sec * speed + offset) % (2 * L);
      const back = d > L;
      if (back) d = 2 * L - d;
      along(pts, lens, d, at);
      return { d, back, heading: back ? at.heading + Math.PI : at.heading };
    };

    if (seg.ne === "is") {
      const jobId = this.works[i].job;
      const [ax, az] = loc.spot;
      switch (jobId) {
        case "liman_iscisi": {
          // İskeleden vapura kasa taşır.
          const r = pingPong([[ax - 2, az - 16], [ax - 2, az + 16]], 1.0, ph * 10);
          stand(at.x, at.z, r.heading);
          walkPose(p, r.d / (0.72 * k) * Math.PI);
          if (!r.back) { p.props = ["kasa"]; p.shL = p.shR = 0.9; p.elL = p.elR = 1.1; p.abL = p.abR = 0.05; }
          return;
        }
        case "zeytinci": case "bahcivan": {
          // Tarlada sıra boyunca ilerleyip eğilerek toplar.
          const r = pingPong([[ax - 30, az], [ax + 30, az]], 0.08, ph * 50);
          stand(at.x, at.z + ((s % 7) - 3) * 2.2, r.heading);
          const bend = Math.max(0, Math.sin(t * 0.6 + ph));
          p.lean = 0.25 + 0.75 * bend; p.hipL = p.hipR = 0.3 * bend; p.kneeL = p.kneeR = 0.35 * bend;
          p.shL = p.shR = 0.6 + 0.6 * bend; p.elL = p.elR = 0.4;
          return;
        }
        case "cankurtaran": {
          const tower = w.features.find((f) => f.type === "cankurtaran");
          if (tower) {
            stand(tower.x, tower.z, 0);
            sitPose(p, w.groundY(tower.x, tower.z) + 2.7, k);
            p.headYaw = 0.6 * Math.sin(t * 0.15 + ph);
            return;
          }
          break;
        }
        case "fener_bekcisi": {
          const fener = w.features.find((f) => f.type === "fener");
          const a = sec * 0.03 + ph;
          stand(fener.x + Math.cos(a) * 6.5, fener.z + Math.sin(a) * 6.5, Math.atan2(-Math.sin(a), Math.cos(a)));
          walkPose(p, (sec * 0.03 * 6.5) / (0.72 * k) * Math.PI);
          return;
        }
        case "balikci": {
          // Kıyıda ağ onarır: çömelir, elleri önde.
          stand(ax, az, Math.PI * 0.1 + (s % 5) * 0.5);
          p.drop = 0.38 * k; p.hipL = p.hipR = 1.25; p.kneeL = p.kneeR = 2.0; p.lean = 0.35;
          p.shL = p.shR = 0.8; p.elL = p.elR = 0.9 + 0.2 * Math.sin(t * 2 + ph);
          return;
        }
        case "gemi_ustasi": {
          // Tersanede çekiçle çalışır.
          stand(ax, az, (s % 4) * 1.57);
          const hit = Math.max(0, Math.sin(t * 2.2 + ph));
          p.shR = 1.0 + 1.3 * hit; p.elR = 0.4 + 0.8 * (1 - hit); p.lean = 0.15;
          return;
        }
        default: {
          // Rehber ve diğerleri: iş arkadaşlarıyla küçük gruplar halinde konuşur.
          this._groupSpot("is:" + Math.round(ax) + ":" + Math.round(az) + ":" + (s % 3), ax + (s % 3) * 3, az, at);
          stand(at.x, at.z, at.heading);
          idleGesture(p, t, ph, true);
          return;
        }
      }
    }

    switch (hobbyId ?? place) {
      case "balik": {
        // İskelenin kenarında denize dönük, oltası elinde; arada olta atar.
        const [x, z] = loc.spot;
        const pier = w.piers.find((q) => x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 && z < q.z1);
        stand(x, z, pier && x < (pier.x0 + pier.x1) / 2 ? -Math.PI / 2 : Math.PI / 2);
        const cast = Math.max(0, Math.sin(t * 0.08 + ph)) ** 8;
        p.shR = 0.75 + 1.0 * cast; p.elR = 0.9 - 0.6 * cast; p.shL = 0.55; p.elL = 1.0;
        p.props = ["olta"];
        return;
      }
      case "bisiklet": case "kosu": {
        const prom = w.roads.find((r) => r.type === "sahil").points;
        const run = hobbyId === "kosu";
        const lanePts = prom.map(([x, z]) => [x, z + (run ? -1.6 : 1.6)]);
        const r = pingPong(lanePts, run ? 2.7 : 4.5, ph * 400);
        stand(at.x, at.z, r.heading);
        if (run) {
          walkPose(p, r.d / (1.1 * k) * Math.PI, 1);
          p.sleeves = false;
        } else {
          const crank = r.d / 2.2 * Math.PI;
          p.y += 0.98 - 0.92 * k + 0.0;
          p.hipL = 1.1 + 0.4 * Math.sin(crank); p.hipR = 1.1 - 0.4 * Math.sin(crank);
          p.kneeL = 1.2 + 0.5 * Math.cos(crank); p.kneeR = 1.2 - 0.5 * Math.cos(crank);
          p.lean = 0.35; p.shL = p.shR = 0.95; p.elL = p.elR = 0.35;
          p.props = ["bisiklet"];
          p.propY = -(0.98 - 0.92 * k) / k;
        }
        return;
      }
      case "yuzme": {
        // Yüzer, arada havlusuna uzanıp güneşlenir.
        if (Math.floor(sec / 900 + ph) % 5 >= 3) break;
        const [x, z] = loc.spot;
        const a = sec * 0.01 + ph;
        const sx = x + Math.cos(a) * 6, sz = z + 26 + Math.sin(a) * 4;
        p.x = sx; p.z = sz; p.heading = Math.atan2(-Math.sin(a), Math.cos(a));
        p.y = -1.25 * k; p.lean = 0.9;
        p.shL = 1.5 + 1.6 * Math.sin(t * 2 + ph); p.shR = 1.5 + 1.6 * Math.sin(t * 2 + ph + Math.PI);
        p.elL = p.elR = 0.3;
        return;
      }
      case "yoga": {
        const [x, z] = loc.spot;
        stand(x, z, Math.PI / 2);
        const pose = Math.floor((t / 20 + ph) % 3);
        if (pose === 0) { p.shL = p.shR = 3.0; p.elL = p.elR = 0; p.kneeR = 0.6; p.hipR = 0.9; p.abR = 0.5; }
        else if (pose === 1) { p.abL = p.abR = 1.5; p.hipL = 0.6; p.kneeL = 0.6; p.hipR = -0.4; p.headYaw = 1.2; }
        else { p.lean = 1.3; p.shL = p.shR = 2.6; p.hipL = p.hipR = 0; }
        p.props = ["mat"];
        return;
      }
      case "ucurtma": {
        const [x, z] = loc.spot;
        stand(x, z, Math.PI * 0.75 + 0.3 * Math.sin(t * 0.05 + ph));
        p.shL = p.shR = 1.7; p.elL = p.elR = 0.4; p.headPitch = -0.55;
        p.props = ["ucurtma"];
        return;
      }
      case "fotograf": {
        const [x, z] = loc.spot;
        stand(x, z, ph + t * 0.03);
        p.shR = 1.25; p.elR = 2.1; p.shL = 1.15; p.elL = 2.0; p.abL = -0.2; p.headPitch = 0.05;
        p.props = ["fotograf"];
        return;
      }
      case "resim": {
        const [x, z] = loc.spot;
        stand(x, z, ph);
        p.shR = 1.3 + 0.15 * Math.sin(t * 1.5 + ph); p.elR = 0.5; p.headPitch = 0.05;
        p.props = ["sovale"];
        return;
      }
    }

    // Meydana gelenler dağılır: bir kısmı kafede oturur, bir kısmı çarşıda vitrin gezer.
    if (place === "meydan" && !hobbyId) {
      const mode = roll(s, "meydanMod", this.day) % 100;
      if (mode >= 30 && mode < 55) {
        const seat = this._takeSeat("kafe", i, roll(s, "kafeMasa", this.day));
        if (seat) {
          p.x = seat.x; p.z = seat.z; p.heading = seat.heading;
          sitPose(p, seat.top, k);
          const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
          p.shR = 0.5 + 0.9 * sip; p.elR = 1.2 + 1.0 * sip; p.headPitch = 0.1 * sip;
          idleGesture(p, t, ph, sip < 0.1 && roll(s, "konuskan") % 2 === 0);
          p.lean = 0.12;
          return;
        }
      } else if (mode >= 55 && mode < 85) {
        const walk = w.carsiWalks[roll(s, "carsiYol", this.day) % w.carsiWalks.length];
        const r = pingPong(walk, 0.85 + frac(roll(s, "gezHiz")) * 0.35, ph * 200);
        // Arada durup vitrine bakar.
        const look = Math.sin(sec / 40 + ph) > 0.75;
        const alongX = walk[0][1] === walk[1][1];
        const shopSide = alongX ? (walk[0][1] < 0 ? Math.PI : 0) : walk[0][0] < 0 ? -Math.PI / 2 : Math.PI / 2;
        stand(at.x, at.z, look ? shopSide : r.heading);
        if (!look) walkPose(p, r.d / (0.72 * k) * Math.PI);
        else idleGesture(p, t, ph, false);
        p.dog = true;
        return;
      }
    }

    // Oturanlar: kahvehanede tavla, bankta kitap ya da gitar, meydanda dinlenme.
    const wantsSeat =
      place === "kahvehane" ||
      hobbyId === "kitap" || hobbyId === "gitar" || hobbyId === "satranc" ||
      (place === "meydan" && roll(s, "meydanMod", this.day) % 100 < 30) ||
      (place === "tepe" && roll(s, "tepeMod", this.day) % 100 < 40);
    if (wantsSeat) {
      const seat = this._takeSeat(place, i, roll(s, "oturak", this.day));
      if (seat) {
        p.x = seat.x; p.z = seat.z; p.heading = seat.heading;
        sitPose(p, seat.top, k);
        if (hobbyId === "kitap") { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; p.props = ["kitap"]; }
        else if (hobbyId === "gitar") { p.shR = 0.5; p.elR = 1.3 + 0.25 * Math.sin(t * 6 + ph); p.shL = 0.8; p.abL = 0.3; p.elL = 1.6; p.headPitch = 0.25; p.props = ["gitar"]; }
        else if (seat.table) {
          // Tavla/satranç: masaya eğilir, arada taş oynar.
          const move = Math.max(0, Math.sin(t * 0.7 + ph)) ** 6;
          p.lean = 0.25; p.shL = 0.6; p.elL = 1.4; p.shR = 0.7 + 0.5 * move; p.elR = 1.3 - 0.6 * move; p.headPitch = 0.4;
        } else {
          idleGesture(p, t, ph, roll(s, "konuskan") % 2 === 0);
          p.shL = p.shR = 0.35; p.elL = p.elR = 0.9;
          if (roll(s, "telefoncu") % 4 === 0) { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
        }
        return;
      }
    }

    // Plajda güneşlenenler.
    if (place === "plaj") {
      const [x, z] = loc.spot;
      p.x = x; p.z = z; p.heading = Math.PI; p.y = w.groundY(x, z) + 0.12; p.lie = Math.PI / 2;
      p.shL = p.shR = 0.1; p.abL = p.abR = 0.15; p.elL = p.elR = 0.2;
      p.props = ["havlu"]; p.sleeves = false; p.shorts = true;
      return;
    }

    // Gezinenler: meydanda çeşmenin, parkta havuzun, sahilde yolun çevresinde.
    const stroll = (place === "meydan" && roll(s, "meydanMod", this.day) % 100 >= 80) || place === "sahil_yolu" || place === "park";
    if (stroll) {
      let cx = 0, cz = 0, R = 20;
      if (place === "park") { const g = w.features.find((f) => f.type === "gol"); cx = g.x; cz = g.z; R = 19; }
      if (place === "sahil_yolu") {
        const prom = w.roads.find((r) => r.type === "sahil").points;
        const r = pingPong(prom, 0.9, ph * 300);
        stand(at.x, at.z, r.heading);
        walkPose(p, r.d / (0.72 * k) * Math.PI);
        p.dog = true;
        return;
      }
      const dir = s % 2 ? 1 : -1;
      const a = (sec * 0.9 * dir) / R + ph;
      const rr = R + ((s >> 3) % 5) * 0.8;
      stand(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir));
      walkPose(p, (sec * 0.9) / (0.72 * k) * Math.PI);
      p.dog = true;
      return;
    }

    // Diğerleri: küçük gruplar halinde sohbet.
    const [x, z] = loc.spot;
    const groupsHere = place === "meydan" ? 48 : 12;
    let g = roll(s, "grup", this.day) % groupsHere;
    for (let tries = 0; tries < groupsHere && (this.groups.get(place + g) ?? 0) >= 2 + (g % 4); tries++) g = (g + 1) % groupsHere;
    let gx = x + ((g % 4) - 1.5) * 4, gz = z + (Math.floor(g / 4) % 3 - 1) * 4;
    if (place === "meydan") {
      const a = g * 2.39996;
      const rr = 9 + ((g * 7) % 19);
      gx = Math.cos(a) * rr; gz = Math.sin(a) * rr;
    }
    this._groupSpot(place + g, gx, gz, at);
    stand(at.x, at.z, at.heading);
    idleGesture(p, t, ph, true);
    p.dog = true;
  }

  /** Sakinlerin konumlarını verilen dakikaya göre günceller ve çizim listesini kurar. */
  update(minute, time) {
    const crowd = this.crowd, p = this.pose, at = this._at;
    this.taken = new Set();
    this.groups = new Map();
    crowd.begin();
    for (let i = 0; i < this.n; i++) {
      const plan = this.plans[i];
      let segIndex = 0;
      while (segIndex < plan.length - 1 && minute >= plan[segIndex].son) segIndex++;
      const seg = activityAt(plan, minute);
      this.activities[i] = seg;
      this.athome[i] = seg.ne === "ev" ? 1 : 0;
      const c = this.colors[i];
      if (seg.ne === "uyku" || seg.ne === "ev") {
        this.homeActs[i] = null;
        p.height = c.height; p.t = time; p.sleeves = c.sleeves; p.shorts = false; p.dog = false;
        if (this.dollhouse?.contains(i) && this.dollhouse.pose(i, seg, minute, time, p)) {
          this.homeActs[i] = p.activity;
          this.visible[i] = 1;
          this.positions[i * 3] = p.x; this.positions[i * 3 + 1] = p.y; this.positions[i * 3 + 2] = p.z;
          p.style = c.style; p.skin = c.skin; p.hairColor = c.hairColor; p.top = c.top; p.bottom = c.bottom;
          crowd.add(i, p);
          continue;
        }
        this.visible[i] = 0;
        continue;
      }

      resetPose(p);
      p.height = c.height; p.t = time; p.sleeves = c.sleeves; p.shorts = false; p.dog = false;
      const k = c.height / 1.75;
      let atWork = false;

      if (seg.ne === "yol") {
        let trip = this.travelCache[i];
        if (!trip || trip.seg !== segIndex) trip = this.travelCache[i] = this._trip(i, seg, segIndex);
        // Geçen süreden yürünen mesafe; molalarda durur.
        let el = (minute - seg.bas) * 60;
        let d = 0, stop = null;
        let last = 0;
        for (const st of trip.stops) {
          const reach = (st.at - last) / trip.v;
          if (el < reach) break;
          el -= reach; d = st.at; last = st.at;
          if (el < st.dur) { stop = st; el = 0; break; }
          el -= st.dur;
        }
        if (!stop) d = Math.min(trip.L, d + el * trip.v);
        along(trip.pts, trip.lens, d, at);
        p.x = at.x; p.z = at.z; p.heading = at.heading;
        p.y = this.world.groundY(at.x, at.z);
        if (stop) {
          // Molada: vitrine/denize bakar ya da telefonuna.
          p.heading += stop.kind ? Math.PI / 2 : 0;
          idleGesture(p, time, i, false);
          if (!stop.kind) { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
        } else {
          walkPose(p, d / (0.72 * k) * Math.PI);
        }
        p.dog = true;
        atWork = trip.fromWork;
        p.phase = d;
      } else {
        const loc = this.location(i, seg.yer);
        if (loc.indoor) { this.visible[i] = 0; continue; }
        this._atPlace(i, seg, loc, minute, time, p);
        atWork = seg.ne === "is";
        p.phase = time * 2;
      }

      this.visible[i] = 1;
      this.positions[i * 3] = p.x; this.positions[i * 3 + 1] = p.y; this.positions[i * 3 + 2] = p.z;
      p.style = c.style; p.skin = c.skin; p.hairColor = c.hairColor;
      p.top = atWork && c.uniform ? c.uniform : c.top;
      p.bottom = c.bottom;
      crowd.add(i, p);

      if (p.dog && this.dogs[i]) {
        const side = 0.75;
        const dx = Math.cos(p.heading) * side, dz = -Math.sin(p.heading) * side;
        crowd.addDog(p.x + dx + Math.sin(p.heading) * 0.5, this.world.groundY(p.x, p.z), p.z + dz + Math.cos(p.heading) * 0.5, p.heading, p.phase * 1.6, DOG_COLORS[this.residents[i].seed % DOG_COLORS.length]);
      }
    }
    crowd.end();
    this.visibleCount = crowd.count;
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
