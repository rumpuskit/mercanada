// Sakinler: her biri günlük planına göre evden işe, hobisine ve meydana gider.
// Evde, uykuda ya da kapalı bir iş yerindeyken görünmez; dışarıdakiler küçük figürler olarak çizilir.
import * as THREE from "three";
import { activityAt, dayPlan, hobby, look, roll, workplace } from "../sim.js";
import * as P from "./palette.js";

const UP = new THREE.Vector3(0, 1, 0);
const SCALE = 1.25;

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

    this.homes = residents.map((r) => world.homeOf(r.slot));
    this.works = residents.map((r) => ({ wp: workplace(r), loc: world.workplaceOf(workplace(r)) }));
    this.hobbies = residents.map((r) => hobby(r));
    this.looks = residents.map((r) => look(r));
    this.offsets = residents.map((r) => [((roll(r.seed, "yol_x") % 1000) / 1000 - 0.5) * 3, ((roll(r.seed, "yol_z") % 1000) / 1000 - 0.5) * 3]);
    this.travelCache = new Array(this.n);

    const body = new THREE.CapsuleGeometry(0.55, 1.0, 3, 8).translate(0, 1.05, 0);
    const head = new THREE.SphereGeometry(0.5, 10, 8).translate(0, 2.45, 0);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.n);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.7 }), this.n);
    for (let i = 0; i < this.n; i++) {
      this.bodies.setColorAt(i, P.CLOTHES[this.looks[i].ust % P.CLOTHES.length]);
      this.heads.setColorAt(i, P.SKIN[this.looks[i].ten % P.SKIN.length]);
    }
    for (const mesh of [this.bodies, this.heads]) {
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    this.group = new THREE.Group();
    this.group.add(this.bodies, this.heads);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    this.plans = this.residents.map((r) => dayPlan(r, day));
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
    return { spot: this._spot(i, name, place.anchors, place.spread), path: place.path, indoor: false };
  }

  _spot(i, tag, anchors, spread) {
    const s = this.residents[i].seed;
    const a = anchors[roll(s, "nokta_" + tag) % anchors.length];
    const ang = ((roll(s, "aci_" + tag) % 3600) / 3600) * Math.PI * 2;
    const rad = Math.sqrt((roll(s, "uzak_" + tag) % 1000) / 1000) * spread;
    return [a[0] + Math.cos(ang) * rad, a[1] + Math.sin(ang) * rad];
  }

  _travelPath(i, seg) {
    const from = this.location(i, seg.nereden), to = this.location(i, seg.nereye);
    const [ox, oz] = this.offsets[i];
    const mid = (pts) => pts.map(([x, z]) => [x + ox, z + oz]);
    // Ortak öneki at: aynı mahalleden aynı yere giderken meydana kadar inip dönmesinler.
    const a = from.path, b = to.path;
    let k = 0;
    while (k < a.length && k < b.length && a[a.length - 1 - k][0] === b[b.length - 1 - k][0] && a[a.length - 1 - k][1] === b[b.length - 1 - k][1]) k++;
    const pts = [from.spot, ...mid(a.slice(0, a.length - k + 1)), ...mid(b.slice(0, b.length - k).reverse()), to.spot];
    const lens = [0];
    for (let j = 1; j < pts.length; j++) lens.push(lens[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts, lens };
  }

  /** Sakinin şu an bulunduğu nokta: dışarıdaysa kendisi, içerideyse bulunduğu binanın kapısı. */
  focusPoint(i) {
    if (this.visible[i]) return [this.positions[i * 3], this.positions[i * 3 + 2]];
    const seg = this.activities[i];
    if (!seg || seg.ne === "uyku" || seg.ne === "ev" || seg.ne === "yol") return this.homes[i].door;
    const loc = this.location(i, seg.yer);
    return seg.yer === "is" ? this.works[i].loc.door : loc.spot;
  }

  /** Sakinlerin konumlarını verilen dakikaya göre günceller. */
  update(minute, time) {
    const m = this._m, q = this._q, p = this._p, sc = this._s;
    let visibleCount = 0;
    for (let i = 0; i < this.n; i++) {
      const plan = this.plans[i];
      let segIndex = 0;
      while (segIndex < plan.length - 1 && minute >= plan[segIndex].son) segIndex++;
      const seg = activityAt(plan, minute);
      this.activities[i] = seg;
      this.athome[i] = seg.ne === "ev" ? 1 : 0;
      let x, z, heading = 0, walking = false, show = true;
      if (seg.ne === "yol") {
        let cache = this.travelCache[i];
        if (!cache || cache.seg !== segIndex) cache = this.travelCache[i] = { seg: segIndex, ...this._travelPath(i, seg) };
        const { pts, lens } = cache;
        const d = seg.t * lens[lens.length - 1];
        let j = 1;
        while (j < lens.length - 1 && lens[j] < d) j++;
        const span = lens[j] - lens[j - 1] || 1;
        const u = Math.min(1, Math.max(0, (d - lens[j - 1]) / span));
        x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
        z = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
        heading = Math.atan2(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        walking = true;
      } else if (seg.ne === "uyku" || seg.ne === "ev") {
        show = false;
      } else {
        const loc = this.location(i, seg.yer);
        if (loc.indoor) show = false;
        else {
          // Yerinde hafifçe dolaşır.
          const phase = (this.residents[i].seed % 1000) / 159;
          x = loc.spot[0] + Math.sin(time * 0.21 + phase) * 1.2;
          z = loc.spot[1] + Math.cos(time * 0.17 + phase * 1.3) * 1.2;
          heading = phase * 6.28 + time * 0.05;
        }
      }
      this.visible[i] = show ? 1 : 0;
      if (!show) {
        m.makeScale(0, 0, 0);
      } else {
        visibleCount++;
        const y = Math.max(this.world.height(x, z), 0.9) + (walking ? Math.abs(Math.sin(time * 9 + i)) * 0.3 : 0);
        this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
        const boy = (this.looks[i].boy / 100) * SCALE;
        q.setFromAxisAngle(UP, heading);
        m.compose(p.set(x, y, z), q, sc.set(SCALE, boy, SCALE));
      }
      this.bodies.setMatrixAt(i, m);
      this.heads.setMatrixAt(i, m);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.visibleCount = visibleCount;
  }
}
