// 10 Kasım: Atatürk'ü anma (8 Kasım 2026, kullanıcı: "bayraklar indirilecek, Atatürk portresi asılacak, tam 09:05'te
// uygun seslerle ve herkesin katılımıyla anma; en ufak ayrıntı düşünülmeli").
//
// Gün boyu (Türkiye günü 10 Kasım):
// - Meydanda, bayrak gönderinin batısında anma köşesi: kırmızı halı kaplı kürsü, siyah örtü önünde çerçeveli portre
//   (1932 tarihli, kamu malı fotoğraf; köşesinde siyah yas kurdelesi, altında "MUSTAFA KEMAL ATATÜRK 1881–1938"),
//   iki yanda saçaklı Türk bayrakları ve ayaklı çelenkler (belediye, ada halkı). Gece projektörle aydınlanır, önünde
//   mumlar yanar.
// - Resmî binaların cephesinde portre pankartı, apartmanların bir kısmının balkonunda portre posteri.
// - Zeplinin yan yüzünde "10 Kasım 1938 · 09.05 · Saygıyla anıyoruz".
// Tören (dakikalar TR saati; people.js anmaPlan ile herkes meydanda):
//   08:45 toplanma (sıralar; önde başkan ve muhtar çelenkle, polisler üniformalı) · 09:05:00–09:06:00 saygı duruşu:
//   siren, vapur düdüğü, trafik durur, kimse kıpırdamaz · 09:06:30–09:08:30 bayraklar yarıya iner (adanın bütün
//   gönderleri) · 09:09 çelenk portrenin önüne konur · 09:20 dağılma. Sonra gün boyu ziyaretçiler karanfil bırakır
//   (her ziyaret bir karanfil: yığın gerçekten büyür).
// Yalnız sitede (sunucu simülasyonu değişmez, sim.py paritesi korunur).
import * as THREE from "three";
import { FLAT_Y, FLOOR_H, unitLayout } from "./layout.js";
import { sunTimes } from "./sky.js";

/** Tören saatleri (gün içindeki dakika, TR). */
export const ANMA = {
  toplan: 525, // 08:45 herkes yerinde
  sessiz: 544, // 09:04 konuşmalar kesilir
  sukut: 545, // 09:05:00 siren, saygı duruşu
  sukutSon: 546, // 09:06:00
  indirBas: 546.5, // 09:06:30 bayraklar yarıya iner
  indirSon: 548.5, // 09:08:30
  celenk: 549, // 09:09:00 çelenk taşınır
  dagil: 560, // 09:20 dağılma
};
/** Karanfil ziyareti (dk): yürüyüp gelir, bırakır, bir süre saygıyla durur. */
export const KARANFIL_SURE = 4;

export function anmaOf(day) {
  const d = new Date(day * 86400000);
  return d.getUTCMonth() === 10 && d.getUTCDate() === 10;
}

/** Bayrak yüksekliği: 1 tam, 0 yarıya inmiş. Yalnız 10 Kasım'da 09:06:30'dan sonra iner. */
export function mastFactor(day, minute) {
  if (!anmaOf(day) || minute < ANMA.indirBas) return 1;
  const u = Math.min(1, (minute - ANMA.indirBas) / (ANMA.indirSon - ANMA.indirBas));
  return 1 - u * u * (3 - 2 * u);
}

/** Tören evresi (yalnız 10 Kasım): null | toplan | sessiz | sukut | indir | celenk | sonra. */
export function anmaPhase(day, minute) {
  if (!anmaOf(day) || minute < ANMA.toplan - 40 || minute >= ANMA.dagil) return null;
  if (minute < ANMA.sessiz) return "toplan";
  if (minute < ANMA.sukut) return "sessiz";
  if (minute < ANMA.sukutSon) return "sukut";
  if (minute < ANMA.indirSon) return "indir";
  if (minute < ANMA.celenk + 6) return "celenk";
  return "sonra";
}

// Anma köşesi: meydan gönderinin (0, −25,5) batısında, yüzü güneye (meydana, iskeleden gelene).
const KOSE = { x: -6.2, z: -27.6, w: 3.0, h: 4.5 };
const KURSU = { w: 6.4, d: 2.6, h: 0.3 };
/** Kalabalığın baktığı nokta (portre ile gönder arası) ve çelenk ayağının yeri. */
export function anmaYeri(world) {
  const gy = world.groundY(KOSE.x, KOSE.z);
  return {
    portre: { x: KOSE.x, z: KOSE.z, y: gy },
    odak: [-3.4, -26.4],
    celenk: [KOSE.x, KOSE.z + KURSU.d / 2 + 0.75],
    gonder: [0, -25.5],
  };
}
const inKursu = (x, z, pad = 0.6) => Math.abs(x - KOSE.x) < KURSU.w / 2 + pad && Math.abs(z - KOSE.z) < KURSU.d / 2 + pad + 0.3;

/**
 * Tören düzeni: kalabalık odağa dönük yaylar halinde (öndekiler ortada). Önce meydanın içi, yetmezse caddelere taşar.
 * Dönen dizi önden arkaya sıralı.
 */
export function anmaFormation(world, n) {
  const [fx, fz] = anmaYeri(world).odak;
  const out = [];
  const ok = (x, z) => world.isWalkable(x, z) && !inKursu(x, z) && Math.hypot(x, z) > 5.2 && Math.hypot(x, z + 25.5) > 1.2;
  for (const inside of [true, false]) {
    for (let d = 6.6; d < 90 && out.length < n + 4; d += 0.95) {
      const row = [];
      const span = 1.3, steps = Math.max(1, Math.floor((2 * span * d) / 0.82));
      for (let s = 0; s <= steps; s++) {
        const th = -span + (2 * span * s) / steps;
        const x = fx + Math.sin(th) * d, z = fz + Math.cos(th) * d;
        const inMeydan = Math.hypot(x, z) < 28.5;
        if (inMeydan !== inside || !ok(x, z)) continue;
        if (!inside && out.some((q) => Math.hypot(q.x - x, q.z - z) < 0.75)) continue;
        row.push({ x, z, heading: Math.atan2(fx - x, fz - z), th: Math.abs(th) });
      }
      row.sort((a, b) => a.th - b.th);
      out.push(...row);
    }
  }
  return out.slice(0, Math.max(n, 0) + 4);
}

/** Karanfil bırakma yerleri: kürsünün önünde, portreye dönük (aynı anda en çok 9 ziyaretçi). */
export function karanfilYerleri(world) {
  // Ön sıra çelenk sehpasının (orta) iki yanında, arka sıra aralarda; basamaktaki mumlardan ≥0,8 m, kürsü köşesindeki
  // projektörlerden ≥1 m uzak (8 Kasım denetimi: eski yerlerin ikisi projektörün, arka sıra mumların üstündeydi).
  const out = [];
  const z0 = KOSE.z + KURSU.d / 2;
  for (const [dx, dz] of [[-0.95, 1.3], [0.95, 1.3], [-1.9, 1.3], [1.9, 1.3], [-0.5, 2.2], [0.5, 2.2], [-1.45, 2.2], [1.45, 2.2]]) {
    const x = KOSE.x + dx, z = z0 + dz;
    out.push({ x, z, heading: Math.PI, look: Math.atan2(KOSE.x - x, KOSE.z - z) });
  }
  return out;
}

/**
 * Tören planı (yalnız sitede): sakin 08:45'e kadar meydana gelir, 09:20'ye dek törende kalır, sonra kendi gününe
 * (o anda olacağı yere) döner. Yolculuktaysa yolculuğun başladığı yerden doğrudan meydana gider.
 */
export function anmaPlan(plan, commute, erken = 0) {
  // erken (dk): kişiye göre 0–16 dk erken varış (8 Kasım denetimi: herkes 08:43'te yola çıkıp meydan son iki dakikada doluyordu).
  const T0 = ANMA.toplan - erken, T1 = ANMA.dagil;
  const leave = T0 - commute;
  const out = [];
  let i = 0;
  while (i < plan.length && plan[i].son <= leave) out.push({ ...plan[i++] });
  if (i >= plan.length) return plan;
  let from, start;
  const seg = plan[i];
  if (seg.ne === "yol") {
    // Yola çıkmıştı: o yolculuğun yerine çıktığı yerden meydana.
    from = seg.nereden; start = seg.bas;
  } else {
    from = seg.yer ?? "ev"; start = Math.max(seg.bas, leave);
    if (seg.bas < start) out.push({ ...seg, son: start });
  }
  if (from === "meydan") out.push({ bas: start, son: T0, ne: "meydan", yer: "meydan" });
  else out.push({ bas: start, son: Math.max(T0, start + commute), ne: "yol", nereden: from, nereye: "meydan" });
  out.push({ bas: out[out.length - 1].son, son: T1, ne: "anma", yer: "meydan" });
  // Tören sonrası: planda T1 + yol süresinde nerede olacaksa oraya.
  const back = T1 + commute;
  let j = plan.findIndex((s) => s.son > back);
  if (j < 0) j = plan.length - 1;
  const s2 = plan[j];
  if (s2.ne === "yol") {
    if (s2.nereye === "meydan") out.push({ bas: T1, son: s2.son, ne: "meydan", yer: "meydan" });
    else out.push({ bas: T1, son: Math.max(s2.son, T1 + 5), ne: "yol", nereden: "meydan", nereye: s2.nereye });
  } else {
    const dest = s2.yer ?? "ev";
    if (dest === "meydan") out.push({ ...s2, bas: T1 });
    else {
      out.push({ bas: T1, son: back, ne: "yol", nereden: "meydan", nereye: dest });
      if (s2.son > back) out.push({ ...s2, bas: back });
    }
  }
  for (let k = j + 1; k < plan.length; k++) out.push({ ...plan[k], bas: Math.max(plan[k].bas, out[out.length - 1].son) });
  // Parçalar kesintisiz kalsın (0-1440).
  for (let k = 1; k < out.length; k++) out[k].bas = out[k - 1].son;
  return out.filter((s, k) => s.son > s.bas || k === out.length - 1);
}

// --- dokular ---

let portreImg = null;
const portreHazir = [];
/** Portre fotoğrafı (web/public/anma/ataturk.jpg); yüklenince bekleyenler çağrılır. */
export function portre(cb) {
  if (portreImg?.complete && portreImg.naturalWidth) { cb(portreImg); return; }
  portreHazir.push(cb);
  if (portreImg) return;
  portreImg = new Image();
  portreImg.onload = () => { for (const f of portreHazir.splice(0)) f(portreImg); };
  portreImg.onerror = () => console.warn("anma portresi yüklenemedi");
  portreImg.src = `${import.meta.env?.BASE_URL ?? "/"}anma/ataturk.jpg`;
}

/** Portre levhası (2:3): siyah zemin, fotoğraf, sağ üst köşede yas kurdelesi, altında ad ve yıllar. */
function levhaTexture() {
  const c = document.createElement("canvas");
  c.width = 600; c.height = 900;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const ciz = (img) => {
    const g = c.getContext("2d");
    g.fillStyle = "#0d0d0f"; g.fillRect(0, 0, 600, 900);
    if (img) g.drawImage(img, 30, 30, 540, 720);
    else { g.fillStyle = "#2a2a2e"; g.fillRect(30, 30, 540, 720); }
    // İnce altın iç çizgi.
    g.strokeStyle = "#b99a55"; g.lineWidth = 3; g.strokeRect(22, 22, 556, 736);
    // Yas kurdelesi: sağ üst köşede çapraz siyah şerit (ince parlak kenarlı).
    g.save();
    g.beginPath(); g.rect(30, 30, 540, 720); g.clip();
    g.translate(570, 30); g.rotate(Math.PI / 4);
    g.fillStyle = "#050506"; g.fillRect(-150, 62, 300, 46);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-150, 62, 300, 3); g.fillRect(-150, 105, 300, 3);
    g.restore();
    g.fillStyle = "#f1ece0"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = "700 40px Nunito, Georgia, serif";
    g.fillText("MUSTAFA KEMAL ATATÜRK", 300, 812);
    g.font = "600 32px Nunito, Georgia, serif";
    g.fillStyle = "#cfc6b2";
    g.fillText("1881 – 1938", 300, 860);
    t.needsUpdate = true;
  };
  ciz(null);
  portre(ciz);
  document.fonts?.ready.then(() => portre(ciz));
  return t;
}

/** Zeplinin yan yüzü (3:1): siyah zemin, solda portre, sağda yazı. Zeplin.setAnma çağırır. */
export function zeplinAnmaTuvali(img) {
  const W = 3000, H = 1000;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, W, H);
  if (img) {
    const ph = H * 0.84, pw = ph * 0.75;
    g.drawImage(img, W * 0.08, (H - ph) / 2, pw, ph);
    g.strokeStyle = "#b99a55"; g.lineWidth = 8; g.strokeRect(W * 0.08 - 12, (H - ph) / 2 - 12, pw + 24, ph + 24);
  }
  g.fillStyle = "#ffffff"; g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = "900 190px Nunito, sans-serif";
  g.fillText("10 KASIM 1938", W * 0.36, H * 0.42);
  g.font = "800 150px Nunito, sans-serif";
  g.fillStyle = "#e30a17";
  g.fillText("09.05", W * 0.36, H * 0.63);
  g.fillStyle = "#e9e3d6";
  g.font = "700 110px Nunito, sans-serif";
  g.fillText("Saygıyla anıyoruz", W * 0.36, H * 0.81);
  return c;
}

// --- sahne ---

export function buildAnma(world, { flagTexture } = {}) {
  const group = new THREE.Group();
  group.name = "anma";
  group.visible = false;
  const gy = world.groundY(KOSE.x, KOSE.z);
  const top = gy + KURSU.h;
  const levha = levhaTexture();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const add = (geo, mat, x, y, z, ry = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Kürsü: siyah etek, kırmızı halı, önde basamak.
  add(new THREE.BoxGeometry(KURSU.w, KURSU.h, KURSU.d), std("#16161a"), KOSE.x, gy + KURSU.h / 2, KOSE.z);
  add(new THREE.BoxGeometry(KURSU.w - 0.2, 0.02, KURSU.d - 0.2), std("#8e1b22", { roughness: 0.95 }), KOSE.x, top + 0.01, KOSE.z);
  add(new THREE.BoxGeometry(KURSU.w - 1.2, 0.15, 0.45), std("#16161a"), KOSE.x, gy + 0.075, KOSE.z + KURSU.d / 2 + 0.22);
  // Siyah fon örtüsü (portrenin arkasında, kürsünün arka kenarında), kenarları hafif kıvrımlı.
  const fon = new THREE.PlaneGeometry(4.8, 6.9, 24, 1);
  { const p = fon.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, 0.06 * Math.sin(p.getX(k) * 9)); fon.computeVertexNormals(); }
  add(fon, std("#0a0a0c", { roughness: 1, side: THREE.DoubleSide }), KOSE.x, top + 3.45, KOSE.z - KURSU.d / 2 + 0.15);
  add(new THREE.BoxGeometry(5.0, 0.12, 0.12), std("#2b2b2f", { metalness: 0.5, roughness: 0.4 }), KOSE.x, top + 6.6, KOSE.z - KURSU.d / 2 + 0.1);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 6.65, 8), std("#2b2b2f", { metalness: 0.5, roughness: 0.4 }), KOSE.x + sx * 2.5, top + 3.32, KOSE.z - KURSU.d / 2 + 0.1);
  // Portre: çerçeve + levha (ayaklı pano), hafif geriye yaslı.
  // Pano kürsüden 1,55 m yukarıda: önündeki sehpaya konan çelenk adı ve yılları kapatmaz.
  const panoZ = KOSE.z - KURSU.d / 2 + 0.55, panoY = top + 1.55 + KOSE.h / 2;
  const pano = new THREE.Group();
  pano.position.set(KOSE.x, panoY, panoZ);
  pano.rotation.x = -0.05;
  group.add(pano);
  const cerceve = new THREE.Mesh(new THREE.BoxGeometry(KOSE.w + 0.24, KOSE.h + 0.24, 0.1), std("#1b1712", { roughness: 0.5 }));
  cerceve.castShadow = true;
  pano.add(cerceve);
  const portreMat = new THREE.MeshStandardMaterial({ map: levha, roughness: 0.55, emissive: "#ffffff", emissiveMap: levha, emissiveIntensity: 0 });
  const yuz = new THREE.Mesh(new THREE.PlaneGeometry(KOSE.w, KOSE.h), portreMat);
  yuz.position.z = 0.052;
  pano.add(yuz);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, panoY - top, 0.08), std("#1b1712"), KOSE.x + sx * (KOSE.w / 2 - 0.3), top + (panoY - top) / 2, panoZ - 0.05);

  // Kürsünün iki ucunda saçaklı Türk bayrakları (sarkan, sırıklı, altın tepelikli).
  if (flagTexture) {
    const bez = new THREE.PlaneGeometry(1.15, 1.7, 8, 8);
    { const p = bez.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, 0.05 * Math.sin(p.getY(k) * 5 + p.getX(k) * 2)); bez.computeVertexNormals(); }
    // Doku yatay (1200×800): sarkan bayrakta ay yıldız yukarıda, göndere yakın.
    const tex = flagTexture.clone(); tex.center.set(0.5, 0.5); tex.rotation = -Math.PI / 2; tex.needsUpdate = true;
    const bayrakMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const x = KOSE.x + sx * (KURSU.w / 2 - 0.45), z = KOSE.z - 0.2;
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.0, 8), std("#c9a24a", { metalness: 0.7, roughness: 0.35 }), x, top + 1.5, z);
      add(new THREE.SphereGeometry(0.06, 10, 8), std("#e8c35a", { metalness: 0.8, roughness: 0.3 }), x, top + 3.04, z);
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 12), std("#1b1712"), x, top + 0.04, z);
      add(bez, bayrakMat, x + sx * 0.02, top + 2.05, z + 0.03, sx * 0.25);
      add(new THREE.BoxGeometry(1.15, 0.06, 0.02), std("#d9b45a", { metalness: 0.6, roughness: 0.4 }), x + sx * 0.02, top + 1.19, z + 0.03, sx * 0.25, false);
    }
  }

  // Çelenkler: halka (kırmızı karanfil), iç halka (beyaz), çapraz kırmızı-beyaz kurdele, üç ayaklı sehpa.
  const celenkGeo = (() => {
    // Gerçek çelenk gibi: koyu yeşil yaprak halkası (dışta sivri yapraklar), üstünde sık kırmızı karanfiller, içte beyaz
    // karanfil halkası, önden çapraz geçen kırmızı ve beyaz kurdele (uçları sarkar).
    const parts = [];
    const col = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let k = 0; k < n; k++) a.set([cc.r, cc.g, cc.b], k * 3); geo.setAttribute("color", new THREE.BufferAttribute(a, 3)); return geo; };
    const rnd = (n) => { const v = Math.sin(n * 57.31 + 3.7) * 24634.6345; return v - Math.floor(v); };
    parts.push(col(new THREE.TorusGeometry(0.5, 0.16, 8, 32), "#1f4a26"));
    for (let k = 0; k < 44; k++) {
      const a = (k / 44) * Math.PI * 2 + rnd(k) * 0.1, r = 0.66 + rnd(k + 1) * 0.04;
      const leaf = new THREE.ConeGeometry(0.05, 0.2, 4).scale(1, 1, 0.35).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * r, Math.sin(a) * r, -0.02 + rnd(k + 2) * 0.03);
      parts.push(col(leaf, k % 3 ? "#2c6332" : "#3d7a3a"));
    }
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2 * 2.0 + rnd(k + 9) * 0.2, ring = k % 2;
      const r = ring ? 0.58 + rnd(k) * 0.04 : 0.44 + rnd(k + 4) * 0.04;
      parts.push(col(new THREE.IcosahedronGeometry(0.058 + rnd(k + 5) * 0.012, 1).scale(1, 1, 0.75).translate(Math.cos(a) * r, Math.sin(a) * r, 0.1 + rnd(k + 6) * 0.03), rnd(k + 7) < 0.1 ? "#9e0d16" : "#cf1520"));
    }
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * Math.PI * 2, r = 0.33;
      parts.push(col(new THREE.IcosahedronGeometry(0.048, 1).scale(1, 1, 0.75).translate(Math.cos(a) * r, Math.sin(a) * r, 0.08), "#f4f1ea"));
    }
    // Kurdeleler: halkanın önünden çapraz, uçları halkanın altından sarkar.
    parts.push(col(new THREE.BoxGeometry(0.14, 1.5, 0.012).rotateZ(0.55).translate(0.08, -0.3, 0.19), "#e30a17"));
    parts.push(col(new THREE.BoxGeometry(0.14, 1.45, 0.012).rotateZ(-0.38).translate(-0.12, -0.36, 0.2), "#f4f1ea"));
    const g = mergeGeos(parts);
    return g;
  })();
  const celenkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const sehpaMat = std("#2b2b2f", { metalness: 0.4, roughness: 0.5 });
  const ayakli = (x, z, yy, h = 1.45) => {
    const c = add(celenkGeo, celenkMat, x, yy + h, z, 0);
    for (const a of [0, 2.1, 4.2]) {
      const leg = add(new THREE.CylinderGeometry(0.015, 0.015, h + 0.15, 5), sehpaMat, x + Math.sin(a) * 0.25, yy + (h + 0.15) / 2, z + Math.cos(a) * 0.25 - 0.1, 0, false);
      leg.rotation.x = Math.cos(a) * 0.16; leg.rotation.z = -Math.sin(a) * 0.16;
    }
    return c;
  };
  // Kürsünün iki ön köşesinde, yerde (8 Kasım denetimi: kürsünün üstündeyken saçaklı bayrakların önüne biniyordu).
  for (const sx of [-1, 1]) { const x = KOSE.x + sx * (KURSU.w / 2 + 0.6), z = KOSE.z + 0.7; ayakli(x, z, world.groundY(x, z), 1.5); }
  // Törende konan çelenk (kürsünün önündeki sehpaya; konana dek taşıyanların elinde, people.js anmaCelenk).
  const [cx, cz] = anmaYeri(world).celenk;
  const sehpaY = world.groundY(cx, cz);
  const sehpa = new THREE.Group();
  for (const a of [0, 2.1, 4.2]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 5), sehpaMat);
    leg.position.set(cx + Math.sin(a) * 0.25, sehpaY + 0.6, cz + Math.cos(a) * 0.25 - 0.1);
    leg.rotation.x = Math.cos(a) * 0.16; leg.rotation.z = -Math.sin(a) * 0.16;
    sehpa.add(leg);
  }
  group.add(sehpa);
  const torenCelenk = new THREE.Mesh(celenkGeo, celenkMat);
  torenCelenk.castShadow = true;
  group.add(torenCelenk);

  // Karanfiller: kürsünün önüne bırakılan her karanfil (ziyaret başına bir), sırayla dizilerek yığılır.
  const MAXK = 900;
  const sap = new THREE.CylinderGeometry(0.006, 0.006, 0.34, 4).rotateZ(Math.PI / 2).translate(0.17, 0, 0);
  const bas = new THREE.IcosahedronGeometry(0.04, 0).scale(0.8, 1, 1);
  // Sap ve çiçek ayrı: çiçeğin rengi (çoğu kırmızı, kimi beyaz) örnek rengiyle verilir, sap hep yeşil.
  // Gece mum ışığında görünsünler: çiçeklerin hafif kızıl ışıması (update gece açar; nokta ışık eklenmez).
  const kBasMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, emissive: "#ff3020", emissiveIntensity: 0 });
  const karanfil = new THREE.InstancedMesh(bas.translate(-0.02, 0, 0), kBasMat, MAXK);
  const saplar = new THREE.InstancedMesh(sap, new THREE.MeshStandardMaterial({ color: "#3f7a35", roughness: 0.8 }), MAXK);
  karanfil.count = saplar.count = 0;
  karanfil.frustumCulled = saplar.frustumCulled = false;
  const kRenk = new THREE.Color();
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const rnd = (n) => { const v = Math.sin(n * 91.7 + 13.3) * 43758.5453; return v - Math.floor(v); };
    for (let k = 0; k < MAXK; k++) {
      // Önce portrenin tam önünde, kürsünün ön kenarında sık bir yığın; çoğaldıkça iki yana ve geriye yayılır,
      // 360'tan sonra basamağa ve önündeki zemine taşar. Katman katman (üst üste).
      const lay = Math.floor(k / 60), u = rnd(k) * 2 - 1, v = rnd(k + 7);
      const onKursu = lay < 6;
      const yari = onKursu ? Math.min(KURSU.w / 2 - 0.4, 0.9 + lay * 0.35) : KURSU.w / 2 - 0.6;
      const x = KOSE.x + u * yari;
      const z = onKursu ? KOSE.z + KURSU.d / 2 - 0.2 - v * (0.35 + lay * 0.08) : KOSE.z + KURSU.d / 2 + 0.3 + v * (0.3 + 0.12 * (lay - 6));
      const y = (onKursu ? top + 0.03 : world.groundY(x, z) + 0.03) + (lay % 3) * 0.03;
      e.set(0, rnd(k + 3) * Math.PI * 2, (rnd(k + 5) - 0.5) * 0.3);
      m4.compose(p.set(x, y, z), q.setFromEuler(e), s);
      karanfil.setMatrixAt(k, m4);
      saplar.setMatrixAt(k, m4);
      karanfil.setColorAt(k, kRenk.set(rnd(k + 11) < 0.82 ? "#c8101e" : "#f4f1ea"));
    }
  }
  group.add(karanfil, saplar);

  // Mumlar (gün batımından gece yarısına): kürsünün önünde iki sıra, kırmızı camlı.
  const mum = new THREE.Group();
  const mumlar = [];
  // Basamağın üstünde bir sıra, basamağın önündeki zeminde (çelenk sehpasının iki yanında) bir sıra.
  const basamakY = gy + 0.15;
  for (let k = 0; k <= 16; k++) { const x = KOSE.x - 2.4 + k * 0.3; mumlar.push([x, basamakY, KOSE.z + KURSU.d / 2 + 0.24]); }
  for (let k = 0; k < 12; k++) {
    const sx = k < 6 ? -1 : 1, x = KOSE.x + sx * (0.65 + (k % 6) * 0.33), z = KOSE.z + KURSU.d / 2 + 0.62;
    mumlar.push([x, world.groundY(x, z), z]);
  }
  const cam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), new THREE.MeshStandardMaterial({ color: "#b0141c", roughness: 0.25, transparent: true, opacity: 0.8, emissive: "#ff3a1a", emissiveIntensity: 0.6 }), mumlar.length);
  const alev = new THREE.InstancedMesh(new THREE.ConeGeometry(0.014, 0.05, 6).translate(0, 0.025, 0), new THREE.MeshBasicMaterial({ color: "#ffcf6a", toneMapped: false }), mumlar.length);
  {
    const m4 = new THREE.Matrix4();
    mumlar.forEach(([x, y, z], k) => { cam.setMatrixAt(k, m4.makeTranslation(x, y + 0.05, z)); alev.setMatrixAt(k, m4.makeTranslation(x, y + 0.1, z)); });
  }
  const parilti = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(mumlar.flatMap(([x, y, z]) => [x, y + 0.13, z]), 3)),
    new THREE.PointsMaterial({ color: "#ffb347", size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, map: glowSprite() }),
  );
  mum.add(cam, alev, parilti);
  group.add(mum);
  // Projektörler: kürsünün önünde iki kutu, gece portreye ışık konisi.
  const isik = new THREE.Group();
  for (const sx of [-1, 1]) {
    const x = KOSE.x + sx * (KURSU.w / 2 - 0.25), z = KOSE.z + KURSU.d / 2 + 0.35, y = world.groundY(x, z);
    add(new THREE.BoxGeometry(0.3, 0.22, 0.3), std("#222226", { metalness: 0.5, roughness: 0.4 }), x, y + 0.11, z);
    // Projektörün ışığı: önündeki küçük parlak cam (ışın konisi çizilmez; sissiz havada görünmez).
    const cam = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ color: "#fff4d6", toneMapped: false }));
    cam.position.set(x, y + 0.13, z - 0.152); cam.rotation.y = Math.PI;
    isik.add(cam);
  }
  group.add(isik);

  // Resmî binalarda cephe pankartı (portre levhası), apartman balkonlarında portre posteri.
  const pankart = [], poster = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const resmi = new Set(["belediye", "okul", "karakol", "adliye", "hastane", "saglik", "muhtarlik", "liman"]);
  for (const b of world.buildings) {
    const fl = b.floors ?? 1;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const toW = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    if (resmi.has(b.kind)) {
      const tepe = FLAT_Y + fl * FLOOR_H - 0.45;
      const tab = FLAT_Y + (fl > 1 ? FLOOR_H + 0.25 : 2.35);
      const h = Math.min(tepe - tab, Math.min(3.4, b.w * 0.24) * 1.5);
      if (h < 1.2) continue;
      const w = h / 1.5;
      // Cepheden 0,32 m önde (pencere çerçeveleri ve denizlikler taşıyor: daha yakında pencereler önüne biniyordu).
      const [x, z] = toW(fl > 1 ? b.w * 0.27 : b.w / 2 - w / 2 - 0.6, b.d / 2 + 0.32);
      q.setFromAxisAngle(UP, b.rot);
      pankart.push(m4.compose(p.set(x, tab + h / 2, z), q, sc.set(w, h, 1)).clone());
    } else if (b.kind === "konut" && b.balconies && fl >= 2) {
      const hsh = (Math.imul((Math.round(b.x * 11) ^ Math.round(b.z * 5)) | 0, 2246822519) >>> 0) / 4294967296;
      if (hsh > 0.42) continue;
      const plan = unitLayout(b);
      const unit = plan.units[Math.floor(hsh * 89) % plan.units.length];
      const floor = 1 + (Math.floor(hsh * 613) % (fl - 1));
      const ly = floor * FLOOR_H + 1.04;
      const [x, z] = toW(unit.cx + 0.6, b.d / 2 + 1.3);
      q.setFromAxisAngle(UP, b.rot);
      poster.push(m4.compose(p.set(x, FLAT_Y + ly - 0.78, z), q, sc.set(1.0, 1.5, 1)).clone());
    }
  }
  const levhaMat = new THREE.MeshStandardMaterial({ map: levha, roughness: 0.7, side: THREE.DoubleSide });
  const inst = (list, mat, geo) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mm, k) => m.setMatrixAt(k, mm));
    m.count = list.length; m.frustumCulled = false; m.castShadow = true;
    group.add(m);
    return m;
  };
  inst(pankart, levhaMat, new THREE.PlaneGeometry(1, 1));
  inst(pankart, std("#0d0d0f"), new THREE.BoxGeometry(1.08, 1.06, 0.04).translate(0, 0, -0.03));
  const posterGeo = new THREE.PlaneGeometry(1, 1, 1, 6);
  { const pp = posterGeo.attributes.position; for (let k = 0; k < pp.count; k++) pp.setZ(k, 0.03 * Math.sin((pp.getY(k) + 0.5) * 3)); posterGeo.computeVertexNormals(); }
  inst(poster, levhaMat, posterGeo);

  let active = null;
  return {
    group,
    counts: { pankart: pankart.length, poster: poster.length, karanfil: MAXK },
    /**
     * day/minute: ada saati; real: gerçek saniye; o: { karanfil: bırakılmış sayı, celenk: {x,y,z,heading} elde ya da
     * null (sehpada), gece: 0-1 }.
     */
    update(day, minute, real, o = {}) {
      const on = anmaOf(day);
      if (on !== active) { group.visible = on; active = on; }
      if (!on) return;
      karanfil.count = saplar.count = Math.min(MAXK, o.karanfil ?? 0);
      if (o.celenk) {
        torenCelenk.position.set(o.celenk.x, o.celenk.y, o.celenk.z);
        torenCelenk.rotation.set(0, o.celenk.heading ?? 0, 0);
      } else {
        torenCelenk.position.set(cx, sehpaY + 1.05, cz);
        torenCelenk.rotation.set(-0.08, 0, 0);
      }
      const set = sunTimes(day).set ?? 1020;
      const gece = o.gece ?? 0;
      const mumVakti = minute >= set - 15;
      mum.visible = mumVakti;
      if (mumVakti) parilti.material.opacity = 0.35 + 0.12 * Math.sin(real * 9.3) + 0.06 * Math.sin(real * 23.1);
      isik.visible = gece > 0.35;
      portreMat.emissiveIntensity = gece > 0.35 ? 0.42 : 0;
      kBasMat.emissiveIntensity = gece > 0.35 ? 0.38 : 0;
    },
  };
}

/** Basit birleştirme (aynı öznitelikler: position, normal, color). */
function mergeGeos(list) {
  const geos = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.normal) x.computeVertexNormals();
    return x;
  });
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
    else col.fill(1, o * 3, (o + n) * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

let glowTex = null;
function glowSprite() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
