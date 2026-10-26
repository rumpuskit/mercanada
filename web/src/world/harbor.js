// Liman yapıları: tahta iskeleler (döşeme, kazık, korkuluk, baba, fener direği), vapur ve tekneler.
// Tekneler ve vapur dalgayla hafifçe sallanır.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

const box = (w, h, d, x, y, z, color) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const cyl = (r0, r1, h, x, y, z, color, seg = 8) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), color);

function merged(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });

/** Tahta iskele: x merkez, z başlangıç (kıyı), +z yönünde len metre, w genişlik, döşeme üstü top. */
function pier(f, top) {
  const parts = [];
  const plank = 0.28, gap = 0.04;
  const woods = ["#a77e57", "#9b7350", "#b08760", "#8f6a49"];
  for (let z = 0; z < f.len; z += plank + gap) {
    parts.push(box(f.w, 0.08, plank, f.x, top - 0.04, f.z + z + plank / 2, woods[Math.floor(z * 7.3) % 4]));
  }
  // Kenar kirişleri ve kazıklar.
  for (const side of [-1, 1]) {
    parts.push(box(0.22, 0.32, f.len, f.x + side * (f.w / 2 - 0.11), top - 0.24, f.z + f.len / 2, "#7a5a3e"));
    for (let z = 1; z < f.len; z += 4) parts.push(cyl(0.16, 0.18, top + 4, f.x + side * (f.w / 2 - 0.2), (top - 4) / 2, f.z + z, "#5e4532", 7));
  }
  // Kirişler (enine).
  for (let z = 1; z < f.len; z += 4) parts.push(box(f.w, 0.18, 0.2, f.x, top - 0.21, f.z + z, "#6e5038"));
  const wood = merged(parts);
  const metal = [];
  if (f.w > 5) {
    // Büyük iskele: korkuluk, babalar ve fener direkleri.
    for (const side of [-1, 1]) {
      const x = f.x + side * (f.w / 2 - 0.08);
      for (let z = 2; z < f.len - 1; z += 2.5) metal.push(cyl(0.035, 0.035, 1.05, x, top + 0.52, f.z + z, "#2f3540", 6));
      metal.push(box(0.06, 0.05, f.len - 3, x, top + 1.05, f.z + f.len / 2 + 0.5, "#2f3540"));
      metal.push(box(0.04, 0.04, f.len - 3, x, top + 0.6, f.z + f.len / 2 + 0.5, "#2f3540"));
      for (let z = 6; z < f.len; z += 12) {
        metal.push(cyl(0.16, 0.2, 0.45, f.x + side * (f.w / 2 - 0.6), top + 0.22, f.z + z, "#25282e", 10));
        metal.push(cyl(0.24, 0.24, 0.08, f.x + side * (f.w / 2 - 0.6), top + 0.48, f.z + z, "#25282e", 10));
      }
      for (let z = 10; z < f.len; z += 20) {
        metal.push(cyl(0.06, 0.09, 3.4, f.x + side * (f.w / 2 - 0.6), top + 1.7, f.z + z, "#2f3540", 8));
        metal.push(colored(new THREE.CylinderGeometry(0.18, 0.13, 0.4, 6).translate(f.x + side * (f.w / 2 - 0.6), top + 3.6, f.z + z), "#fff3c4"));
      }
    }
  } else {
    // Balıkçı iskelesi: tek yanda basit tahta korkuluk.
    for (let z = 2; z < f.len; z += 3) parts.push(box(0.08, 0.9, 0.08, f.x - f.w / 2 + 0.05, top + 0.45, f.z + z, "#6e5038"));
  }
  const group = new THREE.Group();
  const w = new THREE.Mesh(wood, MAT);
  w.castShadow = w.receiveShadow = true;
  group.add(w);
  if (metal.length) {
    const m = new THREE.Mesh(merged(metal), METAL);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

/** Şehir hatları vapuru (50 m): siyah gövde, beyaz iki katlı üst yapı, pencere sıraları, baca, can simitleri. */
function ferry() {
  const parts = [];
  // Gövde: pruva ve kıçta daralan.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-5.5, -24); hullShape.lineTo(5.5, -24); hullShape.lineTo(5.6, 18); hullShape.quadraticCurveTo(5, 24, 0, 26);
  hullShape.quadraticCurveTo(-5, 24, -5.6, 18); hullShape.lineTo(-5.5, -24);
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 3.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.6, 0);
  parts.push(colored(hull, "#1f2226"));
  const deckShape = new THREE.Shape(hullShape.getPoints(24));
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 1.6, 0), "#f4f4f1"));
  // Kırmızı şerit gövdenin birkaç santim dışında (aynı yüzeyde titreşmesin).
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 0.35, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(1.012, 1, 1.003).translate(0, 1.25, 0), "#b8312f"));
  // Üst yapı: iki kat.
  parts.push(box(9.4, 2.6, 34, 0, 4.5, -1, "#f6f6f3"));
  parts.push(box(8.2, 2.3, 18, 0, 7.0, 0, "#f6f6f3"));
  parts.push(box(9.6, 0.15, 35, 0, 5.85, -1, "#d9dde2"));
  parts.push(box(8.4, 0.15, 19, 0, 8.2, 0, "#d9dde2"));
  // Pencere sıraları (iki yan) ve kaptan köşkü camları.
  for (const side of [-1, 1]) {
    for (let z = -16; z <= 14; z += 2.2) parts.push(box(0.05, 1.0, 1.6, side * 4.71, 4.7, z, "#28323e"));
    for (let z = -7.5; z <= 7.5; z += 2.2) parts.push(box(0.05, 0.9, 1.6, side * 4.11, 7.2, z, "#28323e"));
  }
  parts.push(box(7.6, 0.9, 0.05, 0, 7.3, 9.02, "#28323e"));
  // Baca ve direk.
  parts.push(cyl(1.15, 1.3, 4.2, 0, 10.2, -3, "#f2f2ef", 14));
  parts.push(cyl(1.17, 1.17, 0.9, 0, 11.6, -3, "#1f2226", 14));
  parts.push(cyl(1.17, 1.17, 0.35, 0, 10.9, -3, "#e8b93a", 14));
  parts.push(cyl(0.08, 0.1, 6, 0, 11.2, 7, "#2f3540", 6));
  // Can simitleri.
  for (const side of [-1, 1]) for (const z of [-10, 0, 10]) parts.push(colored(new THREE.TorusGeometry(0.38, 0.1, 6, 12).rotateY(Math.PI / 2).translate(side * 4.75, 4.2, z + 1.1), "#f07a2a"));
  // Korkuluk: ana güvertenin kenarını (pruvada daralan çizgiyi) izler; dikmeler iki metrede bir.
  const edge = hullShape.getSpacedPoints(64).map((q) => new THREE.Vector3(q.x * 0.97, 0, -q.y * 0.985));
  let acc = 0;
  for (let k = 1; k < edge.length; k++) {
    const a = edge[k - 1], b = edge[k];
    parts.push(rod(a.clone().setY(4.2), b.clone().setY(4.2), 0.04, "#c9ced4"));
    parts.push(rod(a.clone().setY(3.7), b.clone().setY(3.7), 0.025, "#c9ced4"));
    acc += a.distanceTo(b);
    if (acc >= 2) { acc = 0; parts.push(rod(b.clone().setY(3.2), b.clone().setY(4.2), 0.03, "#c9ced4")); }
  }
  const g = new THREE.Mesh(merged(parts), MAT);
  g.castShadow = g.receiveShadow = true;
  return g;
}

/** a'dan b'ye ince çubuk (boru, halat). */
function rod(a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return colored(g.translate(a.x, a.y, a.z), color);
}

/**
 * Tekne gövdesi kesitlerden örülür: kıçta düz ayna, pruvaya doğru daralan ve yükselen borda, U kesitli
 * karina. Güverte, küpeşte ve iç borda aynı kesit işlevlerinden türetilir; hiçbir parça gövdeden taşmaz.
 * Su hattı y = 0'dadır (altı zehirli boya rengi). Dönen: geometri ve güverte yardımcıları.
 */
function hull(len, beam, depth, colors) {
  const N = 18, J = 7;
  const halfW = (s) => (s < 0.55 ? 0.86 + 0.14 * Math.sin((s / 0.55) * Math.PI / 2) : Math.pow(Math.cos(((s - 0.55) / 0.45) * Math.PI / 2), 0.75)) * beam / 2 + 0.015;
  const sheer = (s) => depth * (0.62 + 0.3 * s * s);
  const keel = (s) => -depth * 0.42 * (s > 0.8 ? 1 - ((s - 0.8) / 0.2) * 0.7 : 1);
  const z = (s) => (s - 0.5) * len;
  // Kesit noktası: t = 0 küpeşte, t = 1 omurga (orta hat).
  const sec = (s, t) => {
    const w = halfW(s), g = sheer(s), k = keel(s);
    return [w * Math.pow(Math.cos((t * Math.PI) / 2), 0.45), g + (k - g) * Math.pow(t, 1.25)];
  };
  const deckY = (s) => sheer(s) - Math.min(0.32, depth * 0.3);
  const tDeck = (s) => { const g = sheer(s), k = keel(s); return Math.pow((g - deckY(s)) / (g - k), 1 / 1.25); };
  const deckW = (s) => Math.max(0, sec(s, tDeck(s))[0] - 0.06);
  const pos = [], col = [];
  const C = (c) => new THREE.Color(c);
  const [top, stripe, bottom, deckC, inner] = [C(colors.top), C(colors.stripe), C("#7a2a26"), C(colors.deck), C(colors.inner ?? colors.top)];
  const colorAt = (y, g) => (y < 0.02 ? bottom : y > g - 0.18 ? stripe : top);
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); };
  const quad = (a, b, c, d, ca, cb = ca, cc = ca, cd = ca) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    for (let j = 0; j < J; j++) {
      const t0 = j / J, t1 = (j + 1) / J;
      for (const side of [-1, 1]) {
        const P = (s, t) => { const [x, y] = sec(s, t); return [side * x, y, z(s)]; };
        const a = P(s0, t0), b = P(s1, t0), c = P(s1, t1), d = P(s0, t1);
        const ca = colorAt(a[1], sheer(s0)), cb = colorAt(b[1], sheer(s1)), cc = colorAt(c[1], sheer(s1)), cd = colorAt(d[1], sheer(s0));
        if (side > 0) quad(a, b, c, d, ca, cb, cc, cd); else quad(a, d, c, b, ca, cd, cc, cb);
      }
    }
    // Güverte, iç borda ve küpeşte üstü.
    const dy0 = deckY(s0), dy1 = deckY(s1), w0 = deckW(s0), w1 = deckW(s1);
    quad([-w0, dy0, z(s0)], [w0, dy0, z(s0)], [w1, dy1, z(s1)], [-w1, dy1, z(s1)], deckC);
    for (const side of [-1, 1]) {
      const g0 = sheer(s0), g1 = sheer(s1), o0 = halfW(s0), o1 = halfW(s1);
      const a = [side * w0, dy0, z(s0)], b = [side * w1, dy1, z(s1)], c = [side * w1, g1, z(s1)], d = [side * w0, g0, z(s0)];
      if (side > 0) quad(a, d, c, b, inner); else quad(a, b, c, d, inner);
      const e = [side * o0, g0, z(s0)], f = [side * o1, g1, z(s1)];
      if (side > 0) quad(d, e, f, c, stripe); else quad(d, c, f, e, stripe);
    }
  }
  // Kıç aynası: düz, iki yandan ortaya üçgenlerle kapanır.
  for (let j = 0; j < J; j++) {
    const t0 = j / J, t1 = (j + 1) / J;
    const [x0, y0] = sec(0, t0), [x1, y1] = sec(0, t1);
    const cz = z(0), cy = keel(0);
    tri([-x0, y0, cz], [x0, y0, cz], [x1, y1, cz], colorAt(y0, sheer(0)), colorAt(y0, sheer(0)), colorAt(y1, sheer(0)));
    tri([-x0, y0, cz], [x1, y1, cz], [-x1, y1, cz], colorAt(y0, sheer(0)), colorAt(y1, sheer(0)), colorAt(y1, sheer(0)));
    void cy;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geo: g, z, deckY, deckW, halfW, sheer };
}

/**
 * Tekne. len < 7: sandal (oturaklar, dıştan takma motor, kürekler). Daha büyükleri balıkçı teknesi:
 * kaptan köşkü (camlı), direk ve seren, seyir feneri, usturmaçalar, ağ makarası.
 */
function boat(len, seed = 0) {
  const PAL = [
    { top: "#f4f1ea", stripe: "#2f5d8a", deck: "#b08a62" },
    { top: "#2f5d8a", stripe: "#f4f1ea", deck: "#a77e57" },
    { top: "#e9e2cf", stripe: "#b8312f", deck: "#9b7350" },
    { top: "#3e8a86", stripe: "#f2d36b", deck: "#a77e57" },
  ];
  const pal = PAL[seed % PAL.length];
  const small = len < 7;
  const beam = len * (small ? 0.38 : 0.32), depth = small ? 0.75 : len * 0.12;
  const H = hull(len, beam, depth, pal);
  const parts = [H.geo]; // gövde kendi köşe renkleriyle
  const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
  if (small) {
    for (const s of [0.28, 0.55, 0.78]) { const a = at(s); parts.push(box(a.w * 2, 0.05, 0.24, 0, a.y + 0.28, a.z, "#9b7350"), box(0.05, 0.28, 0.05, 0, a.y + 0.14, a.z, "#7a5a3e")); }
    // Dıştan takma motor (aynanın dışında).
    const k = at(0.0);
    parts.push(box(0.3, 0.42, 0.34, 0, H.sheer(0) + 0.12, k.z - 0.24, "#2a2d33"), box(0.12, 0.8, 0.12, 0, H.sheer(0) - 0.4, k.z - 0.3, "#3a3d43"), box(0.05, 0.2, 0.28, 0, -0.55, k.z - 0.3, "#2a2d33"));
    // Kürekler (oturakların üstünde, borda boyunca).
    for (const side of [-1, 1]) { const a = at(0.5); parts.push(box(0.05, 0.04, len * 0.55, side * a.w * 0.7, a.y + 0.34, a.z, "#c9a27a")); }
  } else {
    // Kaptan köşkü: güvertenin kıç-orta bölümünde, güverte genişliğine sığar.
    const s0 = 0.22, s1 = 0.46;
    const cw = Math.min(at(s0).w, at(s1).w) * 1.55, cz = (H.z(s0) + H.z(s1)) / 2, cl = H.z(s1) - H.z(s0), cy = Math.max(at(s0).y, at(s1).y);
    const ch = len * 0.13;
    parts.push(box(cw, ch, cl, 0, cy + ch / 2, cz, pal.stripe === "#f4f1ea" ? "#f4f1ea" : "#f6f4ee"));
    parts.push(box(cw + 0.2, 0.08, cl + 0.3, 0, cy + ch + 0.04, cz, pal.stripe));
    parts.push(box(cw + 0.02, ch * 0.32, cl * 0.8, 0, cy + ch * 0.68, cz, "#28323e"));
    parts.push(box(cw * 0.86, ch * 0.32, 0.03, 0, cy + ch * 0.68, cz + cl / 2 + 0.01, "#28323e"));
    // Direk, seren ve seyir feneri; köşkün önünde.
    const m = at(0.66);
    const mh = len * 0.55;
    parts.push(cyl(0.05, 0.07, mh, 0, m.y + mh / 2, m.z, "#d9d4c8", 6));
    parts.push(box(Math.min(m.w * 2.4, len * 0.22), 0.05, 0.05, 0, m.y + mh * 0.72, m.z, "#d9d4c8"));
    parts.push(colored(new THREE.SphereGeometry(0.09, 8, 6).translate(0, m.y + mh + 0.05, m.z), "#fff3c4"));
    // Ağ makarası ve kasalar (kıç güvertede).
    const a = at(0.1);
    parts.push(colored(new THREE.CylinderGeometry(0.28, 0.28, Math.min(1.1, a.w * 1.4), 10).rotateZ(Math.PI / 2).translate(0, a.y + 0.45, a.z), "#c94f3a"));
    for (const [dx, dz] of [[-0.35, 0.55], [0.35, 0.55]]) parts.push(box(0.5, 0.3, 0.4, dx * a.w, a.y + 0.15, a.z + dz, "#3e7fb0"));
    // Küpeşte üstünde paslanmaz tutamak (pruva bölümünde), dikmeleri gövdenin içinde.
    for (const side of [-1, 1]) {
      const tops = [];
      for (let s = 0.6; s <= 0.93; s += 0.11) {
        const q = at(s), x = side * (q.w + 0.03), y = H.sheer(s);
        parts.push(cyl(0.02, 0.02, 0.5, x, y + 0.25, q.z, "#c9ced4", 5));
        tops.push(new THREE.Vector3(x, y + 0.5, q.z));
      }
      // Dikmelerin üstünden geçen tutamak borusu, pruvada iki yan birleşir.
      tops.push(new THREE.Vector3(0, H.sheer(0.99) + 0.5, H.z(0.99)));
      for (let k = 1; k < tops.length; k++) parts.push(rod(tops[k - 1], tops[k], 0.022, "#c9ced4"));
    }
  }
  // Usturmaçalar: bordanın dışında, su hattının üstünde asılı.
  for (const side of [-1, 1]) for (const s of [0.3, 0.55]) {
    const w = H.halfW(s), y = H.sheer(s) * 0.5;
    parts.push(cyl(0.085, 0.085, 0.36, side * (w + 0.09), y, H.z(s), "#f4f4f1", 8));
    parts.push(rod(new THREE.Vector3(side * (w + 0.09), y + 0.18, H.z(s)), new THREE.Vector3(side * (w - 0.02), H.sheer(s), H.z(s)), 0.01, "#d9cfa8"));
  }
  const geo = mergeGeometries(parts.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { if (g.attributes.uv) g.deleteAttribute("uv"); if (g.attributes.normal) g.deleteAttribute("normal"); return g; }));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildHarbor(world) {
  const group = new THREE.Group();
  const floating = [];
  for (const f of world.features) {
    if (f.type === "iskele") group.add(pier(f, 1.53));
    else if (f.type === "vapur") {
      const m = ferry();
      m.position.set(f.x, 0.2, f.z);
      group.add(m);
      floating.push({ obj: m, base: 0.2, amp: 0.06, roll: 0.006, ph: 0.3 });
      // İskele köprüsü (vapurdan iskeleye).
      const plank = new THREE.Mesh(merged([box(2.2, 0.12, 4.2, 0, 0, 0, "#9aa1a8"), box(0.05, 0.9, 4.2, -1.08, 0.45, 0, "#2f3540"), box(0.05, 0.9, 4.2, 1.08, 0.45, 0, "#2f3540")]), METAL);
      plank.position.set(f.x - 7.2, 1.7, f.z - 4);
      plank.rotation.y = Math.PI / 2;
      group.add(plank);
    } else if (f.type === "tekne") {
      const len = f.len ?? 8;
      const m = boat(len, Math.round(Math.abs(f.x * 7 + f.z * 3)));
      m.position.set(f.x, 0.05, f.z);
      m.rotation.y = f.rot ?? 0;
      group.add(m);
      floating.push({ obj: m, base: 0.05, amp: 0.08 + 0.02 * (10 - Math.min(10, len)), roll: 0.04, ph: f.x * 0.13 + f.z * 0.07, rot: f.rot ?? 0 });
    }
  }
  group.userData.tick = (t) => {
    for (const b of floating) {
      b.obj.position.y = b.base + Math.sin(t * 0.9 + b.ph) * b.amp;
      b.obj.rotation.z = Math.sin(t * 0.7 + b.ph * 1.7) * b.roll;
      b.obj.rotation.x = Math.sin(t * 0.55 + b.ph) * b.roll * 0.5;
    }
  };
  return group;
}
