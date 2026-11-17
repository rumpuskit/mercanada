// Elektrik kesintisi (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; yalnız Mercanada,
// yalnız öğleden sonra yuvası ve yalnız gün batımından sonra sığan kısa günlerde: olay-plan.js gerek/pencereGun).
// Gün batımından sonra bütün adada elektrik kesilir: sokak lambaları, pencereler, vitrin ve ışıklı tabelalar, saha
// projektörleri, liman ışıkları ve zeplinin ışıkları söner (main.js updateWindows, olay.elektrik → durum()); deniz feneri
// pillidir, yanmaya devam eder. Evdeki komşular kapı önüne çıkıp telefon fenerlerini yakar, kimi pencerede mum yanar.
// 25–30 dk sonra ışıklar mahalle mahalle (ada hücreleri: çarşı, tepe, kır, mahalleler) geri gelir; kapı önündekiler kendi
// mahallesinin ışığı gelince içeri döner. Her şey (dakika, o.tohum, dünya) işlevidir. Işık yok: telefon feneri additive
// parıltı ve zeminde ışık lekesi (PointLight/SpotLight yok).
import * as THREE from "three";
import { kesir } from "./olay-plan.js";
import { idleGesture } from "./people.js";
import { CELL_W, CELL_D } from "./layout.js";

const yon = (dx, dz) => Math.atan2(dx, dz);
const ss = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const HUCRE_AD = { merkez: ["çarşıda", "çarşı"], tepe: ["tepede", "tepe"], kir: ["kırda", "kır"] };

/** Yumuşak ışık dokusu (merkez beyaz, kenar saydam). */
function isikDokusu(ic = "rgba(255,250,235,1)", dis = "rgba(255,240,210,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, ic); r.addColorStop(0.25, "rgba(255,246,225,0.55)"); r.addColorStop(1, dis);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildElektrikOlay({ world, group: anaGrup, traffic, zeplin, sky }) {
  const group = new THREE.Group();
  group.name = "elektrik";
  group.visible = false;
  anaGrup.add(group);
  let K = null, gorsel = null;
  const hucreler = world.cells.map((c, i) => ({ i, ...c, r: world.rects[i] }));

  /** (x, z) hangi ada hücresinde (mahalle): içindeki, yoksa en yakın hücre. Sayısal tablo (kare başına dize kurulmaz:
   *  trafik ışıkları her karede sorar). */
  const tablo = new Map(world.cells.map((c, i) => [(c.cx + 64) * 128 + (c.cz + 64), i]));
  function hucre(x, z) {
    const k = tablo.get((Math.round(x / CELL_W) + 64) * 128 + (Math.round(z / CELL_D) + 64));
    if (k !== undefined) return k;
    let en = 0, dmin = Infinity;
    for (const h of hucreler) { const r = h.r, d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)); if (d < dmin) { dmin = d; en = h.i; } }
    return en;
  }

  function gorselKur() {
    if (gorsel) return gorsel;
    const N = 48;
    // Telefon fenerinin kendisi (elde parlak nokta) ve önündeki zemin lekesi: iki InstancedMesh, kameraya dönük / yatık.
    const parilti = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: isikDokusu(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), N);
    const leke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: isikDokusu("rgba(255,248,230,0.9)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }), N);
    for (const m of [parilti, leke]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 6; group.add(m); }
    gorsel = { parilti, leke, N };
    return gorsel;
  }

  function kur(o) {
    const D = o.son - o.bas, kesikSon = o.bas + D * 0.84;
    // Işığı geri gelecek hücreler: binası olanlar; sıra tohumdan. Hücre başına dönüş dakikası.
    const dolu = new Set(world.buildings.map((b) => hucre(b.x, b.z)));
    const sira = hucreler.filter((h) => dolu.has(h.i)).sort((a, b) => kesir("elekSira", o.tohum, a.i) - kesir("elekSira", o.tohum, b.i));
    const donus = new Float32Array(hucreler.length).fill(kesikSon);
    sira.forEach((h, k) => { donus[h.i] = kesikSon + (k / Math.max(1, sira.length - 1)) * (o.son - 0.5 - kesikSon); });
    const meydan = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    const pitch = world.pitch ? [(world.pitch.x0 + world.pitch.x1) / 2, (world.pitch.z0 + world.pitch.z1) / 2] : meydan;
    const liman = world.features.find((f) => f.type === "vapur") ?? { x: meydan[0], z: meydan[1] + 150 };
    const ad = (h) => (h.type === "mahalle" ? (() => { const b = world.buildings.find((b) => hucre(b.x, b.z) === h.i && /Mahallesi/.test(b.address ?? "")); const m = b && /([^,]+ Mahallesi)/.exec(b.address); return m ? [`${m[1].trim()}'nde`, m[1].trim()] : ["bir mahallede", "bir mahalle"]; })() : HUCRE_AD[h.type] ?? ["bir mahallede", "bir mahalle"]);
    K = { o, kesikSon, donus, sira, ilk: sira[0] ? ad(sira[0]) : null, hMeydan: hucre(...meydan), hSaha: hucre(...pitch), hLiman: hucre(liman.x, liman.z), disari: [], surum: -1 };
    // Durum nesnesi (main.js her 6 karede okur; kare başına nesne kurulmaz).
    K.E = { hucre, acik: (h) => K.yanik || K.m >= K.donus[h], kesik: (x, z) => !K.yanik && K.m < K.donus[hucre(x, z)], mum, surum: 0, sahaKesik: false, carsiKesik: false, limanKesik: false, zeplinKesik: false };
    gorselKur();
    // Odak: en kalabalık konut sokağı (40 m içinde en çok daire kapısı; meydana yakın olan önce). Kapı önüne çıkanlar,
    // mumlu pencereler ve karanlık apartmanlar burada aynı kadrajda (17 Kasım denemesi: meydanda konut yok, kalabalık
    // çekimi 110 m uzaktan çekiliyordu).
    const binalar = new Map(); // bina → { h (bir kapı), n (daire) }
    for (let sl = 0; sl < (world.population ?? 0); sl++) { const h = world.homeOf?.(sl); if (!h?.door || !h.building) continue; const v = binalar.get(h.building); if (v) v.n++; else binalar.set(h.building, { h, n: 1 }); }
    const liste = [...binalar.values()];
    let en = null;
    for (const a of liste) {
      let n = 0;
      for (const q of liste) if (Math.abs(q.h.door[0] - a.h.door[0]) < 40 && Math.abs(q.h.door[1] - a.h.door[1]) < 40) n += q.n;
      const puan = n - Math.hypot(a.h.door[0] - meydan[0], a.h.door[1] - meydan[1]) / 8;
      if (!en || puan > en.puan) en = { h: a.h, puan };
    }
    let odak = [meydan[0], meydan[1]], yerAdi = "Mercanada";
    if (en) {
      const { door, building: b } = en.h, L = Math.hypot(door[0] - b.x, door[1] - b.z) || 1;
      odak = [door[0] + ((door[0] - b.x) / L) * 5, door[1] + ((door[1] - b.z) / L) * 5];
      yerAdi = b.address?.split(" No")[0]?.split(",")[0] ?? yerAdi;
    }
    K.odak = odak;
    // Kamera denizden (güney) kente: karanlık apartmanlar, arkada meydan ve çarşı. "Olaya git" yüksekten geniş.
    return { odak, odakY: 3, kalabalik: null, kiyi: null, yon: 0.35, yerAdi, zaman: { donus: [kesikSon, o.son] },
      gitD: 170, gitEgim: 0.75, cekimOlcek: 1.8, cekimOlcekH: 1.8 };
  }

  /** Kesinti durumu (olay.elektrik): null ya da K.E (o dakikaya göre güncellenir). */
  function durum(o, minute) {
    if (!o || !K || K.o !== o || minute < o.bas || minute >= o.son) return null;
    K.m = minute;
    const E = K.E;
    // Kesilmeden önce ışıklar iki sn içinde üç kez göz kırpar (0–0,6 yanık, 0,9–1,3, 1,5–1,7 sn yanık; sonra karanlık).
    const sn = (minute - o.bas) * 60;
    K.yanik = sn < 0.6 || (sn > 0.9 && sn < 1.3) || (sn > 1.5 && sn < 1.7);
    let n = 0;
    for (const h of K.sira) if (minute >= K.donus[h.i]) n++;
    E.surum = K.yanik ? -2 : n;
    E.sahaKesik = !K.yanik && minute < K.donus[K.hSaha]; E.carsiKesik = !K.yanik && minute < K.donus[K.hMeydan]; E.limanKesik = !K.yanik && minute < K.donus[K.hLiman];
    E.zeplinKesik = E.carsiKesik;
    return E;
  }

  /** Pencerede mum (0–1): evinde biri olan dairelerin ~%14'ünde, kesintiden 2–6 dk sonra yakılır; titrer. */
  function mum(i, evde) {
    if (!evde) return 0;
    const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
    if (h > 0.14) return 0;
    const bas = K.o.bas + 2 + h * 28;
    if (K.m < bas) return 0;
    const s = K.m * 60;
    return Math.min(1, (K.m - bas) * 2) * (0.62 + 0.16 * Math.sin(s * 7.3 + i) + 0.12 * Math.sin(s * 12.7 + i * 2.3));
  }

  /** Kapı önüne çıkanlar: kesintide evinde olan sakinler (meydana yakın olanlar önce; en çok 40) kapısının 2–3 m önünde,
   *  yolun dışında durur, telefon fenerini yakar; kendi mahallesinin ışığı gelince 1–3 dk içinde içeri döner. */
  function gorev(people, day, S, plans) {
    if (!K || S.plan !== K.o) return [];
    const T = K.o.bas + 3, R = people.residents, out = [];
    const adaylar = [];
    plans.forEach((plan, i) => {
      const seg = plan.find((g) => g.bas <= T && g.son > K.kesikSon + 4);
      if (!seg || seg.ne !== "ev") return;
      const h = people.homes[i], d = h?.door, b = h?.building;
      if (!d || !b) return;
      adaylar.push({ i, h, d: Math.hypot(d[0] - S.odak[0], d[1] - S.odak[1]) + kesir("elekAday", R[i].seed, day) * 30 });
    });
    adaylar.sort((a, b) => a.d - b.d);
    const tutulan = [];
    for (const { i, h } of adaylar) {
      if (out.length >= gorsel.N - 8) break;
      const [dx, dz] = h.door, b = h.building;
      let ox = dx - b.x, oz = dz - b.z;
      const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
      const yan = (kesir("elekYan", R[i].seed, day) - 0.5) * 2.4, ileri = 2 + kesir("elekIleri", R[i].seed, day) * 1.2;
      const x = dx + ox * ileri - oz * yan, z = dz + oz * ileri + ox * yan;
      if (!world.isWalkable?.(x, z) || traffic?.locate?.([x, z], 1.6, ["cadde", "sokak", "koy", "giris"])) continue;
      if (tutulan.some((q) => Math.hypot(q[0] - x, q[1] - z) < 0.9)) continue;
      tutulan.push([x, z]);
      const T0 = K.o.bas + 2 + kesir("elekCik", R[i].seed, day) * 5, gel = K.donus[hucre(x, z)];
      const T1 = Math.min(K.o.son + 2, gel + 1 + kesir("elekGir", R[i].seed, day) * 2);
      // Bakış: sokağa doğru, biraz yana (komşusuna); fener yere ve çevreye tutulur.
      const heading = yon(ox, oz) + (kesir("elekBak", R[i].seed, day) - 0.5) * 1.6;
      out.push({ i, T0, T1, commute: 1, item: { modul: "elektrik", x, z, heading, T0, T1, ph: kesir("elekPh", R[i].seed, day) * 6.28, rol: out.length % 3 === 2 ? "konus" : "fener" } });
    }
    K.disari = out.map((g) => g.item);
    group.userData.disari = K.disari; // deneme (?denetle): kapı önündekiler
    // Kalabalık çekimi (kaydet.mjs: kamera kalabalıktan odağa doğru, yüzlere bakar): odağa 6–25 m olan ilk kapı önü.
    const k = K.disari.find((it) => { const d = Math.hypot(it.x - S.odak[0], it.z - S.odak[1]); return d > 6 && d < 25; }) ?? K.disari[0];
    if (k) S.kalabalik = [k.x, k.z];
    return out;
  }

  function durus(i, it, minute, t, p, ph, stand) {
    stand(it.x, it.z, it.heading);
    // Telefon feneri: sağ kol önde, telefon aşağı-ileri; feneri ağır ağır sağa sola gezdirir.
    const s = minute * 60;
    idleGesture(p, t, ph, false);
    p.props = ["telefon"];
    p.shR = 1.05 + 0.15 * Math.sin(s * 0.35 + it.ph); p.elR = 0.35; p.abR = 0.1 * Math.sin(s * 0.5 + it.ph);
    p.headPitch = 0.12; p.headYaw = 0.35 * Math.sin(s * 0.3 + it.ph);
    if (it.rol === "konus") { const g = Math.max(0, Math.sin(t * 0.9 + ph)); p.shL = 0.3 + 0.5 * g; p.elL = 0.7 + 0.8 * g; }
    return true;
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eksen = new THREE.Vector3(0, 1, 0);
  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o || minute < o.bas || minute > o.son + 3) { if (group.visible) group.visible = false; return; }
    group.visible = true;
    const { parilti, leke } = gorsel, gece = 1 - (env.light ?? 0), cam = env.camera;
    // Kent ışıkları yokken alacakaranlık daha koyu (ortam ışığı; yalnız güneş batmışken, sönük mahalle oranınca).
    if (minute < o.son && sky) {
      const sonuk = 1 - K.sira.filter((h) => minute >= K.donus[h.i]).length / Math.max(1, K.sira.length);
      const k = 0.3 * sonuk * ss(gece, 0.3, 0.7);
      sky.hemi.intensity *= 1 - k; sky.sun.intensity *= 1 - k;
    }
    const g2 = Math.min(1, gece * 1.8);
    let n = 0;
    for (const it of K.disari) {
      if (minute < it.T0 + 0.3 || minute > it.T1) continue;
      const s = minute * 60, sn = Math.sin(it.heading), cs = Math.cos(it.heading);
      const gy = world.groundY(it.x, it.z);
      // El: gövdenin 0,45 m önünde, 0,2 m sağında, 1,25 m yukarıda.
      ps.set(it.x + sn * 0.45 - cs * 0.2, gy + 1.22, it.z + cs * 0.45 + sn * 0.2);
      q.copy(cam.quaternion); sc.setScalar(0.8 + 0.5 * g2);
      parilti.setMatrixAt(n, m4.compose(ps, q, sc));
      // Zemin lekesi: 2,2 m önde, fenerin gezdirildiği yöne doğru uzun.
      const a = it.heading + 0.35 * Math.sin(s * 0.3 + it.ph);
      ps.set(it.x + Math.sin(a) * 2.2, gy + 0.06, it.z + Math.cos(a) * 2.2);
      q.setFromAxisAngle(eksen, a); sc.set(1.5, 1, 2.6);
      leke.setMatrixAt(n, m4.compose(ps, q, sc));
      n++;
    }
    parilti.count = leke.count = n;
    parilti.instanceMatrix.needsUpdate = leke.instanceMatrix.needsUpdate = true;
    parilti.material.opacity = 0.4 + 0.6 * g2;
    leke.material.opacity = 0.7 * g2;
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const disari = K.disari.filter((it) => it.T0 <= minute).length, mumVar = minute >= o.bas + 3;
    const zep = zeplin ? " Zeplinin ışıkları da söndü." : "";
    const ilk = K.ilk, dk = Math.round(K.kesikSon - o.bas);
    const kapi = disari ? ` ${disari} komşu kapı önüne çıkıp telefon fenerini yaktı${mumVar ? ", kimi pencerelerde mum yanıyor" : ""}.` : mumVar ? " Kimi pencerelerde mum yanıyor." : "";
    if (minute < K.kesikSon) return { kisa: "Adada elektrik kesildi!", uzun: `Saat ${saatte(o.bas)} bütün adada elektrik kesildi; sokak lambaları, pencereler, vitrinler ve liman karardı.${zep} Deniz feneri pille yanmaya devam ediyor.${kapi}` };
    if (minute < o.son) return { kisa: "Işıklar mahalle mahalle geliyor", uzun: `Saat ${saatte(o.bas)} kesilen elektrik ${dk} dakika sonra geri gelmeye başladı; ışıklar önce ${ilk?.[0] ?? "bir mahallede"} yandı, mahalle mahalle bütün adaya yayılıyor.${disari ? ` Kapı önüne çıkan ${disari} komşu evlerine dönüyor.` : ""}` };
    return { kisa: `Bugün elektrik kesildi · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} bütün adada elektrik kesildi; ada ${dk} dakika karanlıkta kaldı, yalnız deniz feneri yandı.${disari ? ` ${disari} komşu kapı önlerinde telefon fenerleriyle bekledi, kimi pencerelerde mum yandı.` : ""} Işıklar önce ${ilk?.[0] ?? "bir mahallede"} yandı, ${Math.round(o.son - K.kesikSon)} dakikada bütün ada aydınlandı.` };
  }

  return {
    kur, update, yazi, gorev, durus, durum,
    // Genel seyirci yok (en: 0); kapı önüne çıkanlar gorev ile.
    seyirci: { r0: 10, r1: 14, isR: 0, uzak: 1, en: 0, tavirlar: ["bak"] },
    ses: (m) => (K && m >= K.o.bas + 2 && m < K.o.son ? { kalabalik: 0.3 } : null),
  };
}
