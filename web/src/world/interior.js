// Ev içi (bebek evi) görünümü: seçilen apartmanın seçilen katı kesilir; alt katlar dışarıdan, o kat
// içeriden görünür. Her dairede salon, mutfak ve yatak odası eşyalarıyla birlikte kurulur; evdeki
// sakinler o anki işlerini yapar (uyur, yemek yapar, sofrada yer, kanepede televizyon izler...).
import * as THREE from "three";
import { pet, roll } from "../sim.js";
import { buildKit, drawBuilding, local, makeKit } from "./city.js";
import { FLAT_Y, FLOOR_H } from "./layout.js";
import { homeActivity } from "./life.js";
import { idleGesture, resetPose, sitPose } from "./people.js";
import { buildWorkInterior, workPose } from "./workinterior.js";

const WALL_H = 2.9;
const LOW_WALL = 0.95; // kameraya bakan duvarlar bu yüksekliğe kadar kesilir
const FLOORS = ["#b58a63", "#c79f74", "#9c7353", "#d2b48c", "#a98b6f"];
const PAINTS = ["#f3ece2", "#e7eef2", "#f1e4d6", "#e6efe3", "#f2e1e1", "#ece6f2"];
const SOFAS = ["#5b7a99", "#8a5a4a", "#6f8f6a", "#9a8f80", "#4a4f63", "#b07a55"];
const DUVETS = ["#e8eef5", "#d9e4ef", "#f2e3d5", "#e6d8ee", "#dfeadf", "#f3dede"];
const RUGS = ["#b8625a", "#5a7fa8", "#c9a25a", "#7a6a9a", "#5f8f7f"];

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

export class Dollhouse {
  constructor(world, city, people, scene) {
    Object.assign(this, { world, city, people, scene });
    this.building = null;
    this.floor = 0;
    this.group = null;
    this.spots = new Map(); // sakin indeksi -> dairedeki yerler
    this.workSpots = new Map(); // sakin indeksi -> iş yerindeki çalışma noktası
    this.tvs = [];
    this.lights = [];
  }

  isOpen() {
    return !!this.building;
  }

  open(b, floor) {
    this.close();
    this.building = b;
    this.floor = Math.max(0, Math.min(b.floors - 1, floor));
    this.city.setHidden(b, true);
    this.group = new THREE.Group();
    // Alt katlar: normal bina, çatısız.
    if (this.floor > 0) {
      const K = makeKit();
      drawBuilding(K, b, this.floor);
      this.group.add(buildKit(K));
    }
    if (b.daireler) this._buildFloor(b, this.floor);
    else this._buildWork(b, this.floor);
    this.scene.add(this.group);
  }

  setFloor(floor) {
    if (this.building) this.open(this.building, floor);
  }

  close() {
    if (!this.building) return;
    this.city.setHidden(this.building, false);
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
    });
    this.building = null;
    this.group = null;
    this.spots.clear();
    this.workSpots.clear();
    this.tvs = [];
    this.lights = [];
  }

  /** Kamera için: açık katın ortası ve binanın önü. */
  focus() {
    const b = this.building;
    const y = this.floor * FLOOR_H + 1.2;
    const c = local(b, 0, y, 1).clone();
    const front = local(b, 0, y, 30).clone().sub(local(b, 0, y, 0).clone()).normalize();
    return { target: c, front };
  }

  _buildFloor(b, f) {
    const g = this.group;
    const y0 = f * FLOOR_H;
    const add = (w, h, d, lx, ly, lz, color, rot = 0, opts = {}) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material ?? std(color, opts.mat));
      mesh.position.copy(local(b, lx, y0 + ly + h / 2, lz));
      mesh.rotation.y = b.rot + rot;
      mesh.castShadow = opts.shadow ?? true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const n = b.perFloor, bay = b.w / n, hd = b.d / 2;

    // Dış duvarlar: arka ve yanlar tam boy, ön duvar kesik.
    add(b.w + 0.3, 0.25, b.d + 0.3, 0, -0.25, 0, "#d6d0c6");
    add(b.w + 0.3, WALL_H, 0.25, 0, 0, -hd, b.wall);
    add(0.25, WALL_H, b.d + 0.3, -b.w / 2, 0, 0, b.wall);
    add(0.25, WALL_H, b.d + 0.3, b.w / 2, 0, 0, b.wall);
    add(b.w + 0.3, LOW_WALL, 0.25, 0, 0, hd, b.wall);

    for (let c = 0; c < n; c++) {
      const k = f * n + c;
      if (k >= b.daireler) continue;
      const slot = b.slot0 + k;
      const key = slot * 7 + 3;
      const pick = (arr, tag) => arr[roll(key, tag) % arr.length];
      const x0 = -b.w / 2 + c * bay, x1 = x0 + bay, cx = (x0 + x1) / 2;
      const paint = pick(PAINTS, "boya");

      // Döşeme, iç duvarlar.
      add(bay - 0.1, 0.06, b.d - 0.2, cx, 0, 0, pick(FLOORS, "parke"), 0, { shadow: false });
      add(bay - 0.3, 0.07, 3.6, cx, 0.01, -hd + 2.0, "#cfc4b6", 0, { shadow: false });
      if (c > 0) add(0.15, WALL_H, b.d - 0.3, x0, 0, 0, paint);
      add(bay - 1.2, LOW_WALL, 0.12, x0 + (bay - 1.2) / 2, 0, -2, paint); // yatak odası duvarı (kesik)
      add(bay - 0.3, WALL_H - 0.4, 0.04, cx, 0.2, -hd + 0.14, paint, 0, { shadow: false }); // arka duvar boyası
      // Arka pencere (yatak odası).
      add(1.2, 1.3, 0.03, cx, 0.95, -hd + 0.17, "#a8c8e0", 0, { shadow: false, mat: { roughness: 0.1 } });

      // Yatak odası: çift kişilik yatak, komodin, gardırop.
      const bedX = x0 + 1.25, bedZ = -hd + 1.15;
      add(1.6, 0.35, 2.05, bedX, 0.06, bedZ, "#7a5a44");
      add(1.55, 0.2, 2.0, bedX, 0.41, bedZ, "#f6f3ee");
      add(1.6, 0.9, 0.08, bedX, 0.06, -hd + 0.15, "#6b4a35");
      add(0.55, 0.12, 0.35, bedX - 0.38, 0.61, -hd + 0.45, "#ffffff");
      add(0.55, 0.12, 0.35, bedX + 0.38, 0.61, -hd + 0.45, "#ffffff");
      const duvet = add(1.62, 0.1, 1.35, bedX, 0.62, bedZ + 0.32, pick(DUVETS, "yorgan"));
      add(0.45, 0.5, 0.4, bedX + 1.1, 0.06, -hd + 0.4, "#8a6a52");
      add(0.6, 2.1, 1.4, x1 - 0.4, 0.06, -hd + 1.4, "#e9e2d6");

      // Mutfak: tezgâh (eviye ve ocakla), buzdolabı.
      add(2.4, 0.9, 0.62, x0 + 1.45, 0.06, -2 + 0.42, "#f2efe9");
      add(2.45, 0.05, 0.66, x0 + 1.45, 0.96, -2 + 0.42, "#5b5f66");
      add(0.5, 0.02, 0.4, x0 + 0.85, 1.0, -2 + 0.45, "#b9c2cc");
      add(0.6, 0.02, 0.5, x0 + 2.1, 1.0, -2 + 0.45, "#222222");
      add(0.72, 1.9, 0.68, x0 + 3.05, 0.06, -2 + 0.42, "#e6e9ec");

      // Yemek masası ve iki sandalye.
      const tx = x0 + bay * 0.62, tz = 0.9;
      add(0.85, 0.05, 1.25, tx, 0.74, tz, "#a07a58");
      add(0.08, 0.72, 0.08, tx, 0.02, tz, "#6b4a35");
      for (const side of [-1, 1]) {
        add(0.42, 0.05, 0.42, tx + side * 0.75, 0.45, tz, "#8a6a52");
        add(0.05, 0.45, 0.42, tx + side * 0.95, 0.5, tz, "#8a6a52");
      }

      // Salon: kanepe (sol duvarda, sağa bakar), sehpa, halı, televizyon (sağ duvarda).
      const sofa = pick(SOFAS, "koltuk");
      const sz = 3.6;
      add(0.9, 0.42, 2.1, x0 + 0.55, 0.06, sz, sofa);
      add(0.25, 0.5, 2.1, x0 + 0.18, 0.48, sz, sofa);
      for (const e of [-1, 1]) add(0.9, 0.22, 0.2, x0 + 0.55, 0.48, sz + e * 1.0, sofa);
      add(1.9, 0.02, 2.4, x0 + bay * 0.5, 0.06, sz, pick(RUGS, "hali"), 0, { shadow: false });
      add(0.6, 0.38, 1.0, x0 + bay * 0.45, 0.06, sz, "#7a5a44");
      add(0.42, 0.5, 1.6, x1 - 0.32, 0.06, sz, "#3f3a36");
      const screenMat = new THREE.MeshBasicMaterial({ color: "#1a1d22", toneMapped: false });
      const tv = add(0.06, 0.72, 1.25, x1 - 0.32, 0.75, sz, null, 0, { material: screenMat, shadow: false });
      add(0.3, 0.7, 0.3, x1 - 0.35, 0.06, hd - 0.5, "#6a8f5a"); // saksı bitkisi

      // Banyo: mutfakla yemek alanı arasında, sağ köşede (kesik duvarlı); klozet, lavabo, ayna, duş.
      const bx0 = x1 - 1.9, bz0 = -1.3, bz1 = 0.35;
      add(0.1, 1.0, bz1 - bz0, bx0, 0.06, (bz0 + bz1) / 2, paint);
      add(1.9, 1.0, 0.1, bx0 + 0.95, 0.06, bz1, paint);
      add(1.8, 0.03, bz1 - bz0 - 0.1, bx0 + 0.95, 0.065, (bz0 + bz1) / 2, "#dfe6ea", 0, { shadow: false });
      add(0.4, 0.42, 0.55, x1 - 0.35, 0.06, bz0 + 0.45, "#f6f6f4");
      add(0.4, 0.35, 0.18, x1 - 0.35, 0.48, bz0 + 0.2, "#f6f6f4");
      add(0.5, 0.82, 0.4, bx0 + 0.45, 0.06, bz0 + 0.3, "#f6f6f4");
      add(0.5, 0.6, 0.03, bx0 + 0.45, 1.3, bz0 + 0.12, "#cfe3ee", 0, { shadow: false, mat: { roughness: 0.05, metalness: 0.6 } });
      add(0.9, 0.06, 0.8, bx0 + 0.6, 0.06, bz1 - 0.5, "#e9eef0");
      add(0.02, 1.8, 0.8, bx0 + 1.05, 0.12, bz1 - 0.5, "#cfe3ee", 0, { shadow: false, mat: { roughness: 0.05, transparent: true, opacity: 0.4 } });

      // Üst mutfak dolapları, perde, kitaplık, ayaklı lamba, tablo.
      add(2.4, 0.6, 0.35, x0 + 1.45, 1.6, -2 + 0.25, "#ebe6dd");
      for (const dx of [-0.75, 0.75]) add(0.6, 1.45, 0.05, cx + dx, 0.75, -hd + 0.22, pick(["#c9b8a6", "#9fb3c8", "#d8c7a0", "#b9a3b8"], "perde"));
      add(0.32, 1.9, 1.0, x0 + 0.2, 0.06, hd - 0.6, "#7a5a44");
      for (let sh = 0; sh < 4; sh++) {
        add(0.26, 0.04, 0.95, x0 + 0.22, 0.12 + sh * 0.45, hd - 0.6, "#6b4a35");
        add(0.2, 0.32, 0.85, x0 + 0.24, 0.18 + sh * 0.45, hd - 0.6, ["#b8423c", "#2f4a6d", "#d9a441", "#3e8a86"][(sh + roll(key, "kitap")) % 4]);
      }
      add(0.04, 1.5, 0.04, x0 + 0.4, 0.06, sz - 1.45, "#3c4148");
      add(0.35, 0.3, 0.35, x0 + 0.4, 1.5, sz - 1.45, "#f3e3c0", 0, { mat: { emissive: "#ffd9a0", emissiveIntensity: 0.2 } });
      add(0.03, 0.6, 0.9, x0 + 0.1, 1.45, sz, pick(["#d98ca0", "#6f8fb5", "#e0b060", "#7aa37a"], "tablo"));

      // Mesleğe göre köşe: masa başı çalışanlara bilgisayarlı masa, ressama şövale.
      const jobId = i => (i != null ? this.people.works[i].job : "");
      const occ = this.people.slotToIndex.get(slot);
      const jj = jobId(occ);
      if (["yazilimci", "tasarimci", "mimar", "muhasebeci", "avukat"].includes(jj)) {
        add(1.2, 0.05, 0.6, x0 + 1.6, 0.74, hd - 0.55, "#a07a58");
        add(0.06, 0.72, 0.06, x0 + 1.1, 0.02, hd - 0.55, "#6b4a35");
        add(0.06, 0.72, 0.06, x0 + 2.1, 0.02, hd - 0.55, "#6b4a35");
        add(0.6, 0.38, 0.03, x0 + 1.6, 0.95, hd - 0.75, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#6fa0d8", toneMapped: false }), shadow: false });
      } else if (["ressam", "seramikci"].includes(jj)) {
        add(0.05, 1.6, 0.05, x0 + 1.6, 0.06, hd - 0.7, "#8a6a4a");
        add(0.7, 0.55, 0.03, x0 + 1.6, 1.15, hd - 0.68, "#f4efe4");
        add(0.5, 0.35, 0.035, x0 + 1.6, 1.25, hd - 0.66, "#e08a5a");
      }

      // Evcil hayvan.
      const i = this.people.slotToIndex.get(slot);
      const r = i != null ? this.people.residents[i] : null;
      const animal = r ? pet(r, this.people.day) : "";
      if (animal === "Kedi") {
        const cat = add(0.35, 0.18, 0.25, x0 + 0.55, 0.48, sz + 0.75, roll(key, "kedi") % 2 ? "#e0a050" : "#3a3533");
        cat.scale.set(1, 1, 1);
      } else if (animal === "Köpek") {
        add(0.7, 0.08, 0.5, x0 + bay * 0.5, 0.08, sz + 1.6, "#8a5a32");
        add(0.25, 0.3, 0.55, x0 + bay * 0.5, 0.16, sz + 1.6, "#c9954f");
      } else if (animal === "Papağan") {
        add(0.35, 0.5, 0.35, x1 - 0.5, 1.0, hd - 1.2, "#cfd6de", 0, { mat: { metalness: 0.6 } });
        add(0.12, 0.2, 0.1, x1 - 0.5, 1.15, hd - 1.2, "#3fa34d");
      } else if (animal === "Kaplumbağa") {
        add(0.25, 0.1, 0.3, x0 + bay * 0.6, 0.08, sz - 0.9, "#6f7d4a");
      }

      // Gece ışığı.
      const lamp = new THREE.PointLight("#ffd9a0", 0, 9, 1.6);
      lamp.position.copy(local(b, cx, y0 + 2.5, 1.2));
      g.add(lamp);
      this.lights.push({ lamp, slot });

      this.tvs.push({ mat: screenMat, slot });
      if (i != null) {
        const w = (lx, lz) => local(b, lx, 0, lz).clone();
        this.spots.set(i, {
          y0: FLAT_Y + y0 + 0.06,
          bed: { p: w(bedX, bedZ + 0.95), top: FLAT_Y + y0 + 0.63, duvet },
          sofa: [{ p: w(x0 + 0.62, sz - 0.4) }, { p: w(x0 + 0.62, sz + 0.4) }],
          chair: { p: w(tx - 0.75, tz), heading: Math.PI / 2 },
          cook: { p: w(x0 + 1.3, -2 + 1.15), heading: Math.PI },
          wardrobe: { p: w(x1 - 1.3, -hd + 1.4), heading: Math.PI / 2 },
          loop: [w(x0 + 1.4, 2), w(x1 - 1.2, 2), w(x1 - 1.2, 4.8), w(x0 + 1.6, 4.8)],
        });
      }
    }
  }

  /** İş yeri katı: kabuk, türüne göre döşeme ve o katta çalışanların noktaları. */
  _buildWork(b, f) {
    const g = this.group;
    const y0 = f * FLOOR_H;
    const add = (w, h, d, lx, ly, lz, color, rot = 0, opts = {}) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material ?? std(color, opts.mat));
      mesh.position.copy(local(b, lx, y0 + ly + h / 2, lz));
      mesh.rotation.y = b.rot + rot;
      mesh.castShadow = opts.shadow ?? true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const hd = b.d / 2;
    add(b.w + 0.3, 0.25, b.d + 0.3, 0, -0.25, 0, "#d6d0c6");
    add(b.w + 0.3, WALL_H, 0.25, 0, 0, -hd, b.wall);
    add(0.25, WALL_H, b.d + 0.3, -b.w / 2, 0, 0, b.wall);
    add(0.25, WALL_H, b.d + 0.3, b.w / 2, 0, 0, b.wall);
    add(b.w + 0.3, LOW_WALL, 0.25, 0, 0, hd, b.wall);
    const spots = buildWorkInterior(b, f, add, (lx, lz, heading, type) => ({ p: local(b, lx, 0, lz).clone(), heading: b.rot + heading, type, y: FLAT_Y + y0 + 0.06 }));
    for (const lx of [-b.w / 4, b.w / 4]) {
      const lamp = new THREE.PointLight("#fff1d8", 0, 12, 1.4);
      lamp.position.copy(local(b, lx, y0 + 2.6, 0));
      g.add(lamp);
      this.lights.push({ lamp, work: true });
    }
    // Bu iş yerinde çalışanlar: katlara dağılır, kattaki noktalara sırayla yerleşir.
    const people = this.people;
    const here = [];
    for (let i = 0; i < people.n; i++) {
      if (people.works[i].loc?.building !== b) continue;
      if (roll(people.residents[i].seed, "kat") % b.floors !== f) continue;
      here.push(i);
    }
    // Aynı noktaya düşenler yan yana dizilir (üst üste binmesinler).
    here.forEach((i, n) => {
      if (!spots.length) return;
      const sp = spots[n % spots.length];
      const lane = Math.floor(n / spots.length);
      if (!lane) return this.workSpots.set(i, sp);
      const off = (lane % 2 ? 1 : -1) * Math.ceil(lane / 2) * 1.3;
      const p = sp.p.clone().add({ x: Math.cos(sp.heading) * off, y: 0, z: -Math.sin(sp.heading) * off });
      this.workSpots.set(i, { ...sp, p });
    });
    this.workName = Object.values(this.world.workplaces).flat().find((w) => w?.building === b)?.name ?? null;
  }

  /** Bu sakin açık katta mı (evinde ya da işinde)? */
  contains(i) {
    return this.spots.has(i) || this.workSpots.has(i);
  }

  /** İşteki sakinin duruşu. */
  workPoseFor(i, seg, time, p) {
    const sp = this.workSpots.get(i);
    if (!sp || seg.ne !== "is") return false;
    resetPose(p);
    const r = this.people.residents[i];
    const ph = (r.seed % 1000) / 159;
    const k = p.height / 1.75;
    p.x = sp.p.x; p.z = sp.p.z; p.y = sp.y; p.heading = sp.heading;
    if (sp.type === "waiter" || sp.type === "walk") {
      // Masalar arasında gidip gelir.
      const u = Math.sin(time * 0.25 + ph);
      p.x += Math.cos(sp.heading) * u * 2.5; p.z -= Math.sin(sp.heading) * u * 2.5;
      p.heading = sp.heading + (Math.cos(time * 0.25 + ph) > 0 ? Math.PI / 2 : -Math.PI / 2);
      const phi = time * 3.2;
      p.hipL = 0.35 * Math.sin(phi); p.hipR = -p.hipL; p.kneeL = 0.3 * Math.max(0, Math.cos(phi)); p.kneeR = 0.3 * Math.max(0, -Math.cos(phi));
      if (sp.type === "waiter") { p.shR = 1.2; p.elR = 1.4; }
      return true;
    }
    workPose(sp.type, p, time, ph, sitPose, idleGesture, k);
    return true;
  }

  /** Evdeki sakinin duruşu. Evde değilse false. */
  pose(i, seg, minute, time, p) {
    const spot = this.spots.get(i);
    if (!spot || (seg.ne !== "ev" && seg.ne !== "uyku")) return false;
    const b = this.building;
    const r = this.people.residents[i];
    const act = homeActivity(r.seed, seg, minute, this.people.day, this.people.hobbies[i].id);
    const k = p.height / 1.75;
    const ph = (r.seed % 1000) / 159;
    const place = (pt, heading) => {
      p.x = pt.x; p.z = pt.z; p.y = spot.y0; p.heading = b.rot + heading;
    };
    resetPose(p);
    p.activity = act;
    switch (act) {
      case "uyku":
        place(spot.bed.p, 0);
        p.y = spot.bed.top + 0.1;
        p.lie = Math.PI / 2;
        p.kneeL = p.kneeR = 0.15;
        p.shL = p.shR = 0.05;
        p.headYaw = 0.4 * Math.sin(ph);
        break;
      case "tv": case "dinlenme": case "telefon": case "kitap": {
        place(spot.sofa[r.seed % 2].p, Math.PI / 2);
        sitPose(p, spot.y0 + 0.42, k);
        p.lean = -0.18;
        if (act === "telefon") { p.shR = 0.7; p.elR = 1.8; p.headPitch = 0.45; p.props = ["telefon"]; }
        else if (act === "kitap") { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; p.props = ["kitap"]; }
        else if (act === "dinlenme") { p.shL = p.shR = 0.2; p.elL = p.elR = 0.6; p.headPitch = -0.15; }
        break;
      }
      case "kahvalti": case "aksam_yemegi": {
        place(spot.chair.p, spot.chair.heading);
        sitPose(p, spot.y0 + 0.45, k);
        const bite = Math.max(0, Math.sin(time * 0.9 + ph)) ** 4;
        p.lean = 0.12; p.shL = 0.6; p.elL = 1.3; p.shR = 0.6 + 0.5 * bite; p.elR = 1.3 + 0.9 * bite; p.headPitch = 0.2;
        break;
      }
      case "yemek_yapma": {
        place(spot.cook.p, spot.cook.heading);
        const chop = Math.sin(time * 5 + ph);
        p.shL = 0.75; p.elL = 1.2; p.shR = 0.8 + 0.15 * chop; p.elR = 1.0 - 0.2 * chop; p.lean = 0.12; p.headPitch = 0.35;
        p.twist = 0.15 * Math.sin(time * 0.3 + ph);
        break;
      }
      case "hazirlik": {
        place(spot.wardrobe.p, spot.wardrobe.heading);
        idleGesture(p, time, ph, false);
        p.shR = 1.0 + 0.3 * Math.sin(time * 1.3 + ph); p.elR = 0.6;
        break;
      }
      case "temizlik": {
        const loop = spot.loop;
        const per = 2 * (loop[0].distanceTo(loop[1]) + loop[1].distanceTo(loop[2]));
        let d = ((time * 0.6 + ph * 3) % per);
        let j = 0;
        while (d > loop[j].distanceTo(loop[(j + 1) % 4])) { d -= loop[j].distanceTo(loop[(j + 1) % 4]); j = (j + 1) % 4; }
        const a = loop[j], c = loop[(j + 1) % 4];
        const u = d / a.distanceTo(c);
        p.x = a.x + (c.x - a.x) * u; p.z = a.z + (c.z - a.z) * u; p.y = spot.y0;
        p.heading = Math.atan2(c.x - a.x, c.z - a.z);
        const phi = (time * 0.6) / (0.72 * k) * Math.PI;
        p.hipL = 0.35 * Math.sin(phi); p.hipR = -p.hipL; p.kneeL = 0.3 * Math.max(0, Math.cos(phi)); p.kneeR = 0.3 * Math.max(0, -Math.cos(phi));
        p.shR = 0.9; p.elR = 0.4 + 0.3 * Math.sin(time * 4); p.lean = 0.2;
        break;
      }
    }
    // Uyurken yorgan kabarık.
    spot.bed.duvet.scale.y = act === "uyku" ? 3 : 1;
    return true;
  }

  /** Işıklar ve televizyon: kim evde, ne yapıyor? */
  update(night, time) {
    if (!this.building) return;
    const { people } = this;
    for (const l of this.lights) {
      if (l.work) { l.lamp.intensity = 8 + 18 * night; continue; }
      const i = people.slotToIndex.get(l.slot);
      const awake = i != null && people.athome[i] === 1;
      l.lamp.intensity = awake ? 4 + 26 * night : 0;
    }
    for (const t of this.tvs) {
      const i = people.slotToIndex.get(t.slot);
      const on = i != null && people.homeActs?.[i] === "tv";
      if (on) t.mat.color.setHSL((Math.sin(time * 1.7 + t.slot) + 1) * 0.3, 0.5, 0.45 + 0.15 * Math.sin(time * 9 + t.slot));
      else t.mat.color.set("#1a1d22");
    }
  }
}
