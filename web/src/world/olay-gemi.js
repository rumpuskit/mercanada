// Dev konteyner gemisi (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Yalnız Mercanada (Yük Limanı). Ufukta 172 metrelik dev bir konteyner gemisi görünür (rıhtımdaki geminin iki katı), iki römorkör
// eşliğinde yaklaşır, limanın önünde döner; römorkörler onu yandan iterek rıhtımdaki geminin dış yanına yanaştırır (rıhtım dolu:
// gemiden gemiye aktarma). Halatlar bağlanır, güvertedeki iki vinç konteynerleri rıhtımdaki gemiye aktarıp geri alır; sakinler
// vapur iskelesinden izler. Olaydan sonra gemi limanda kalır, AYRILIS dakika sonra römorkörlerle açılıp döner ve açığa gider.
// Limanın kendi gemisi, rıhtım vinci ve işçileri olduğu gibi çalışır (port.js'e dokunulmaz; dev geminin vinçleri rıhtım vincinin
// bölgesinden uzak bölmelere çalışır). Vapur yolu (iskelenin doğusu, x < 40) hiç kesilmez.
// Her şey (dakika, plan, dünya) işlevidir: video günün her saniyesini aynı çizer.
import * as THREE from "three";
import { hull, box, colored, cyl, rod } from "./harbor.js";
import { shipDeckY } from "./port.js";
import { romorkor, kopukHavuzu, tekneIzi, birlestir, TEKNE_MAT, ease, clamp01, lerp } from "./olay-tekne.js";

const L = 172, B = 28, DERIN = 14; // dev gemi: boy, en, gövde derinliği
const CL = 12.19, CH = 2.59, CW = 2.44; // 40 ftlik konteyner
const RENK = ["#2f5f9a", "#b8312f", "#2f7a4f", "#d9822b", "#7a7f87", "#e3e1da", "#8a3b6f", "#1f8a8a", "#c9a227", "#3a3f47"];
const TUG = 26;
const AYRILIS = 150; // olay bitiminden sonra limandan ayrılış (dk)
const CEVRIM = 120; // vinç çevrimi (sn)

export function buildGemiOlay({ world, scene }) {
  let G = null, K = null;
  const _p = { x: 0, z: 0, h: 0 }, _q = { x: 0, z: 0, h: 0 }, _r = { x: 0, z: 0, h: 0 };
  const Y = new THREE.Vector3(0, 1, 0);

  function geoKur() {
    const group = new THREE.Group(); group.name = "olay-gemi"; scene.add(group);
    const gemi = new THREE.Group(); group.add(gemi);
    const H = hull(L, B, DERIN, { top: "#1f3049", stripe: "#e9e6df", deck: "#56645a", inner: "#1f3049" });
    const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
    const p = [H.geo];
    // Köprüüstü ve yaşam bloğu (kıçta), baca (şirket renkleri), pruvada baş kasarası ve direk.
    const k0 = at(0.1), ky = k0.y, kh = 24;
    p.push(box(B - 3, kh, 13, 0, ky + kh / 2, H.z(0.1), "#f2f1ec"));
    for (let y = 3; y < kh - 3; y += 2.8) p.push(box(B - 2.9, 0.9, 13.05, 0, ky + y, H.z(0.1), "#2a3440"));
    p.push(box(B + 3, 0.5, 5, 0, ky + kh + 0.25, H.z(0.1) + 4, "#e3e1da"), box(B + 2.8, 1.6, 0.1, 0, ky + kh - 1.2, H.z(0.1) + 6.6, "#25303b"));
    p.push(box(5, 9, 6, 0, ky + 4.5 + 2, H.z(0.035), "#e3e1da"), box(5.05, 2.2, 6.05, 0, ky + 9, H.z(0.035), "#c8402e"), box(5.05, 1.0, 6.05, 0, ky + 10.6, H.z(0.035), "#1d2026"));
    p.push(cyl(0.25, 0.3, 14, 0, ky + kh + 7, H.z(0.1) - 2, "#e6e6e2", 6));
    p.push(box(at(0.95).w * 1.7, 2.2, 9, 0, at(0.95).y + 1.1, H.z(0.95), "#d9d6cc"));
    p.push(cyl(0.3, 0.35, 16, 0, at(0.93).y + 8, H.z(0.93), "#e6e6e2", 6));
    // Ambar kapakları (koyu gri, konteyner bölmelerinin altında).
    p.push(box(B - 4, 0.7, H.z(0.9) - H.z(0.18), 0, at(0.5).y + 0.35, (H.z(0.9) + H.z(0.18)) / 2, "#4a5562"));
    const govde = new THREE.Mesh(birlestir(p), TEKNE_MAT());
    govde.castShadow = govde.receiveShadow = true;
    gemi.add(govde);
    // Konteynerler: bölmeler (40 ft) boyuna, sıralar enine, katlar 3–6; vinçlerin yerinde boşluk.
    const slots = [];
    const deckTop = at(0.5).y + 0.7, taban = (z) => at(z / L + 0.5).y + 0.7;
    const vincZ = K.vincler.map((v) => v.lz);
    for (let z = H.z(0.19) + CL / 2; z < H.z(0.89) - CL / 2; z += CL + 0.45) {
      if (vincZ.some((vz) => Math.abs(z - vz) < CL / 2 + 3)) continue;
      const s = z / L + 0.5, w = at(s).w * 2 - 1.5, nr = Math.max(2, Math.floor(w / (CW + 0.1)));
      for (let r = 0; r < nr; r++) {
        const x = (r - (nr - 1) / 2) * (CW + 0.1), orta = 1 - Math.abs(r - (nr - 1) / 2) / nr;
        const seed = Math.abs(Math.round(z * 7 + r * 13));
        const katlar = Math.min(6, 3 + Math.round(orta * 2 + (seed % 3) * 0.6));
        for (let k = 0; k < katlar; k++) slots.push([x, taban(z) + k * CH, z, RENK[(seed + k * 5) % RENK.length]]);
      }
    }
    // Vinçlerin kaynağı: vincin yanındaki bölmede güney yarıdaki bir yığının üstü (taşınan konteyner orada durur).
    for (const v of K.vincler) {
      const aday = slots.filter(([x, , z]) => x > 3 && x < 10 && Math.abs(z - v.lz) > CL / 2 + 2 && Math.abs(z - v.lz) < CL * 1.7);
      const ust = aday.reduce((a, q) => (!a || q[1] > a[1] || (q[1] === a[1] && Math.abs(q[2] - v.lz) < Math.abs(a[2] - v.lz)) ? q : a), null);
      v.kaynak = ust ? [ust[0], ust[1] + CH, ust[2]] : [6, deckTop + 4 * CH, v.lz + CL + 0.45];
    }
    const kgeo = new THREE.BoxGeometry(CW, CH, CL).translate(0, CH / 2, 0);
    const kmat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.15 });
    const kont = new THREE.InstancedMesh(kgeo, kmat, slots.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    slots.forEach(([x, y, z, r], i) => { kont.setMatrixAt(i, m4.makeTranslation(x, y, z)); kont.setColorAt(i, c.set(r)); });
    kont.castShadow = kont.receiveShadow = true;
    gemi.add(kont);
    // Güverte vinçleri (sarı): kaide, dönen kabin, bom (eğilir), halat, kanca/kıskaç; taşınan konteyner ayrı.
    const vinc = K.vincler.map((v) => {
      const kaideH = v.ust - deckTop;
      const kaide = new THREE.Mesh(birlestir([cyl(1.6, 1.9, kaideH, 0, kaideH / 2, 0, "#d9b12e", 12), box(4.5, 0.4, 4.5, 0, kaideH, 0, "#3a3f47")]), TEKNE_MAT());
      kaide.position.set(0, deckTop, v.lz); gemi.add(kaide);
      const kabin = new THREE.Group(); kabin.position.set(0, v.ust, v.lz); gemi.add(kabin);
      kabin.add(new THREE.Mesh(birlestir([box(4, 3.2, 4.4, 0, 1.6, -0.6, "#e8b93a"), box(4.05, 1.0, 1.2, 0, 2.2, 1.5, "#25303b"), box(1.2, 1.4, 1.2, 0, 3.6, -2.0, "#e8b93a")]), TEKNE_MAT()));
      const bom = new THREE.Group(); bom.position.set(0, 1.6, 1.2); kabin.add(bom);
      bom.add(new THREE.Mesh(birlestir([box(0.9, 0.9, v.bomL, 0, 0, v.bomL / 2, "#e8b93a"), box(0.3, 0.3, v.bomL, 0, 0.6, v.bomL / 2, "#d9b12e")]), TEKNE_MAT()));
      const halat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: "#2a2d33" }));
      gemi.add(halat);
      // Taşınan konteyner 20 ft (rıhtımdaki geminin bölmesine oturur).
      const yuk = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, 6.06).translate(0, CH / 2, 0), new THREE.MeshStandardMaterial({ color: v.lz > 0 ? "#d9822b" : "#2f7a4f", roughness: 0.75 }));
      const kiskac = new THREE.Mesh(birlestir([box(CW + 0.3, 0.35, 6.4, 0, 0, 0, "#3a3f47")]), TEKNE_MAT());
      gemi.add(yuk, kiskac);
      [kaide, kabin, bom, yuk, kiskac].forEach((o) => o.traverse((m) => { if (m.isMesh) m.castShadow = true; }));
      return { kabin, bom, halat, yuk, kiskac };
    });
    // Palamar halatları (yanaşınca): dev geminin kuzey bordasından rıhtımdaki geminin güney bordasına.
    const palamar = new THREE.Group(); group.add(palamar);
    const tugs = [romorkor(TUG), romorkor(TUG)];
    tugs.forEach((t) => group.add(t.mesh));
    const halatlar = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#d9cfa8", roughness: 0.9 })); group.add(m); return m; });
    const kop = kopukHavuzu(group, 420);
    group.visible = false;
    return { group, gemi, H, deckTop, vinc, palamar, tugs, halatlar, kop };
  }

  // --- yol: A (açıktan kuzeye) → B (sola dönüş yayı) → C (batıya, yavaşlar) → D (yandan itilir, kuzeye) ---
  function yolKur(o) {
    const P = world.port, son = { x: 130, z: P.ship.z + P.ship.beam / 2 + 1.6 + B / 2 };
    const R = 200, zC = son.z + 65, xA = son.x + 200 + R;
    const A0 = { x: xA, z: 3000 }, A1 = { x: xA, z: zC + R }, C0 = { x: xA - R, z: zC }, C1 = { x: son.x, z: zC };
    const D = o.son - o.bas, tDok = o.bas + 0.5 * D;
    const T = { D1: tDok, D0: tDok - 7.5, C0: tDok - 10.5, B0: tDok - 13, A0: o.bas };
    return { son, R, zC, A0, A1, C0, C1, T, merkezB: { x: xA - R, z: zC + R }, tDok };
  }
  /** Dev geminin duruşu (dakika): {x, z, h} (h: pruva yönü; batı = −π/2); olaydan önce/ayrıldıktan sonra null. */
  function gemiPoz(m, out) {
    if (!K || m < K.o.bas) return null;
    const Y = K.yol, T = Y.T;
    if (m < T.B0) { // A: sabit hızla kuzeye
      const u = (m - T.A0) / (T.B0 - T.A0);
      out.x = Y.A0.x; out.z = lerp(Y.A0.z, Y.A1.z, u); out.h = Math.PI; return out;
    }
    if (m < T.C0) { const u = (m - T.B0) / (T.C0 - T.B0), f = u * Math.PI / 2; out.x = Y.merkezB.x + Y.R * Math.cos(f); out.z = Y.merkezB.z - Y.R * Math.sin(f); out.h = Math.PI + f; return out; }
    if (m < T.D0) { const u = (m - T.C0) / (T.D0 - T.C0), e = u * (2 - u); out.x = lerp(Y.C0.x, Y.C1.x, e); out.z = Y.zC; out.h = 1.5 * Math.PI; return out; }
    if (m < T.D1) { const u = ease((m - T.D0) / (T.D1 - T.D0)); out.x = Y.son.x; out.z = lerp(Y.zC, Y.son.z, u); out.h = 1.5 * Math.PI; return out; }
    const a0 = K.ayril;
    if (m < a0) { out.x = Y.son.x; out.z = Y.son.z; out.h = 1.5 * Math.PI; return out; }
    // Ayrılış: römorkörler açar (6 dk, güneye 90 m), gemi yerinde döner (8 dk, pruva doğuya), doğuya gidip sağa döner, açığa.
    const t = m - a0, zA = Y.son.z + 90;
    if (t < 6) { out.x = Y.son.x; out.z = lerp(Y.son.z, zA, ease(t / 6)); out.h = 1.5 * Math.PI; return out; }
    if (t < 14) { out.x = Y.son.x; out.z = zA; out.h = 1.5 * Math.PI - Math.PI * ease((t - 6) / 8); return out; }
    const sx = 330, R2 = 200;
    if (t < 18) { const u = (t - 14) / 4; out.x = lerp(Y.son.x, sx, u * u); out.z = zA; out.h = Math.PI / 2; return out; }
    if (t < 21) { const f = ((t - 18) / 3) * Math.PI / 2; out.x = sx + R2 * Math.sin(f); out.z = zA + R2 - R2 * Math.cos(f); out.h = Math.PI / 2 - f; return out; }
    if (t < 34) { const dt = t - 21; out.x = sx + R2; out.z = zA + R2 + dt * 60 * (1.74 + dt * 0.15); out.h = 0; return out; }
    return null;
  }
  // Not: C bölümünde x, C0'dan C1'e iner (u·(2−u): yavaşlayarak durur); D'de yandan itilir.
  const aci = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u; // kısa yoldan
  const yerel = (P, lx, lz, out) => { const c = Math.cos(P.h), s = Math.sin(P.h); out.x = P.x + lx * c + lz * s; out.z = P.z - lx * s + lz * c; return out; };

  /** Römorkör j (0 baş, 1 kıç) duruşu: eşlik (halatla önde/arkada) → yana geçiş → itme → ayrılma; ayrılışta geri gelir. */
  function tugPoz(j, m, out) {
    if (!K) return null;
    const T = K.yol.T, sg = j ? -1 : 1;
    const gp = gemiPoz(m, _r);
    const esl = [0, sg * (L / 2 + 30 + TUG / 2)], itme = [B / 2 + TUG / 2 + 0.4, sg * 48]; // gemi yerelinde (x: güney yanı, z: boyuna)
    const yerelH = (lx, lz, lh) => { yerel(_r, lx, lz, out); out.h = _r.h + lh; return out; };
    if (m < K.o.bas || !gp) {
      if (m >= K.ayril - 10 && m < K.ayril) return gelis(j, m, out);
      return null;
    }
    if (m < T.C0) return yerelH(esl[0], esl[1], j ? Math.PI : 0); // baş römorkörü önde çeker, kıçtaki arkada (pruvası gemiye)
    if (m < T.D0) {
      // Halatı bırakır, geminin güney yanına geçer (yay: dışarıdan dolanır), pruvası gemiye döner.
      const u = ease((m - T.C0) / (T.D0 - T.C0)), n = 1 - u;
      const cx = itme[0] + 30, cz = (esl[1] + itme[1]) / 2;
      const lx = n * n * esl[0] + 2 * n * u * cx + u * u * itme[0], lz = n * n * esl[1] + 2 * n * u * cz + u * u * itme[1];
      return yerelH(lx, lz, lerp(j ? Math.PI : 0, -Math.PI / 2 + (j ? 2 * Math.PI : 0), u));
    }
    if (m < T.D1 + 2.5) return yerelH(itme[0], itme[1], -Math.PI / 2);
    if (m < T.D1 + 12) {
      // İtmeyi bırakır: geri geri 14 m açılır (pruva gemide), döner ve açığa gider.
      const t = m - T.D1 - 2.5;
      yerel(_r, itme[0], itme[1], _q);
      const bx = _q.x, bz = _q.z + ease(Math.min(1, t / 1.2)) * 14, h0 = _r.h - Math.PI / 2;
      const hedef = [K.yol.son.x + 400 + j * 80, K.yol.son.z + 1500], hH = Math.atan2(hedef[0] - bx, hedef[1] - bz);
      if (t < 1.2) { out.x = bx; out.z = bz; out.h = h0; return out; }
      const e = ((t - 1.2) / 8.3) ** 1.6;
      out.x = lerp(bx, hedef[0], e); out.z = lerp(bz, hedef[1], e); out.h = aci(h0, hH, ease((t - 1.2) / 0.8));
      return out;
    }
    if (m < K.ayril - 10) return null;
    if (m < K.ayril) return gelis(j, m, out);
    // Ayrılış: önce güney yanında halatla çeker (pruva güneye), dönüşte uçlarda iter, sonra eşlik eder ve ayrılır.
    const t = m - K.ayril;
    const cek = [B / 2 + 40 + TUG / 2, sg * 45];
    if (t < 6) return yerelH(cek[0], cek[1], Math.PI / 2);
    if (t < 14) return yerelH(cek[0], cek[1], Math.PI / 2); // dönerken de güney yanında (gemiyle birlikte döner)
    if (t < 22) { const u = ease((t - 14) / 8); return yerelH(lerp(cek[0], esl[0], u), lerp(cek[1], esl[1], u), lerp(Math.PI / 2, j ? Math.PI : 0, u)); }
    if (t < 34) return yerelH(esl[0], esl[1], j ? Math.PI : 0);
    return null;
  }
  /** Ayrılıştan önce açıktan gelip çekme yerine varış (10 dk). */
  function gelis(j, m, out) {
    const sg = j ? -1 : 1, Y = K.yol, P = { x: Y.son.x, z: Y.son.z, h: 1.5 * Math.PI };
    yerel(P, B / 2 + 40 + TUG / 2, sg * 45, _q);
    const u = (m - K.ayril + 10) / 10, e = 1 - (1 - u) ** 2;
    const a = [Y.son.x + 500 + j * 80, Y.son.z + 1700];
    out.x = lerp(a[0], _q.x, e); out.z = lerp(a[1], _q.z, e);
    // Gelirken gemiye doğru, son dakikada pruvası güneye (çekme yönü) döner.
    out.h = aci(Math.atan2(_q.x - a[0], _q.z - a[1]), 0, clamp01((u - 0.88) / 0.12));
    return out;
  }

  function kur(o) {
    const P = world.port;
    if (!P) return null;
    const yol = yolKur(o);
    // Vinçler: dev geminin ekseninde; hedefleri rıhtımdaki geminin dış sırası (rıhtım vincinin uzağındaki bölmeler j = ±4).
    const hatch = shipDeckY(P) + 1.05, BAY = 6.06 + 0.35;
    const vincler = [-4, 4].map((jb) => {
      const fx = P.crane.x + jb * BAY, k = jb + 4, r = 3, seed = k * 11 + r * 5, kat = 1 + (seed % 3 === 0 ? 0 : 1);
      const lz = yol.son.x - (fx + 2 * (jb < 0 ? 1 : -1)); // vincin gemi yerelindeki boyuna yeri (batı = +z)
      return { fx, fz: P.ship.z - 4.0 + r * (2.44 + 0.25), fy: hatch + kat * 2.59, lz, ust: 0, bomL: 30 };
    });
    K = { o, yol, vincler, ayril: o.son + AYRILIS };
    if (!G) G = geoKurOnce();
    // Vinç kaidesinin üstü: konteyner yığınlarının üstünde.
    return { odak: [yol.son.x, yol.son.z], odakY: 12, kalabalik: [0, (world.ferryPier?.z1 ?? 279) - 7], kiyi: null, yon: Math.atan2(-0.8, 0.6), yerAdi: "Yük Limanı", zaman: null,
      gitD: 300, gitEgim: 0.3, cekimOlcek: 4.2, cekimOlcekH: 2.4, kalabalikArkadan: true };
  }
  function geoKurOnce() {
    // Vinç kaidesi yüksekliği gövdenin güverte yüksekliğinden (ilk kurulumda: yol K'da hazır).
    const H0 = hull(L, B, DERIN, { top: "#000", stripe: "#000", deck: "#000" });
    const deckTop = H0.deckY(0.5) + 0.7;
    H0.geo.dispose();
    for (const v of K.vincler) v.ust = deckTop + 6 * CH + 3;
    return geoKur();
  }

  /** Vincin o anki durumu (gemi yanaştıktan sonra; sn: olaydaki saniye): bom azimutu (gemi yerelinde), uzanım, kanca yüksekliği, yük nerede. */
  const _v = new THREE.Vector3();
  function vincDurum(i, m) {
    const v = K.vincler[i], G0 = G;
    const bas = (K.yol.tDok + 4) * 60, sn = m * 60 - bas - i * (CEVRIM / 2);
    // Kaynak: vincin güney yanındaki yığının üstü (gemi yerelinde); hedef: rıhtımdaki geminin dış sırası (dünya → yerel).
    const kaynak = v.kaynak;
    const P = { x: K.yol.son.x, z: K.yol.son.z, h: 1.5 * Math.PI };
    // dünya (fx, fz) → gemi yereli: lx = (x − Px)·cos h − (z − Pz)·sin h ; lz = (x − Px)·sin h + (z − Pz)·cos h
    const dx = v.fx - P.x, dz = v.fz - P.z, c = Math.cos(P.h), s = Math.sin(P.h);
    const hedef = [dx * c - dz * s, v.fy - 0.0, dx * s + dz * c];
    const pivot = [0, v.ust + 1.6, v.lz + 1.2];
    const az = (q) => Math.atan2(q[0] - pivot[0], q[2] - pivot[2]), uz = (q) => Math.hypot(q[0] - pivot[0], q[2] - pivot[2]);
    const yukari = v.ust + 2; // kancanın taşıma yüksekliği (yığınların üstü)
    if (sn < 0 || !(m < K.ayril - 1)) return { az: az(kaynak), uzan: uzn(uz(kaynak)), y: yukari, yuk: "kaynak", kaynak, hedef, pivot };
    const t = sn % CEVRIM, ad = (a, b) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; };
    const A0 = az(kaynak), A1 = A0 + ad(A0, az(hedef)), U0 = uz(kaynak), U1 = uz(hedef);
    const ky = kaynak[1] + CH + 0.35, hy = hedef[1] + CH + 0.35; // kıskacın oturduğu yükseklik
    let a = A0, u = U0, y = yukari, yuk = "kaynak";
    if (t < 8) { y = lerp(yukari, ky, ease(t / 8)); }
    else if (t < 14) { y = lerp(ky, yukari, ease((t - 8) / 6)); yuk = "kanca"; }
    else if (t < 34) { const e = ease((t - 14) / 20); a = lerp(A0, A1, e); u = lerp(U0, U1, e); yuk = "kanca"; }
    else if (t < 44) { a = A1; u = U1; y = lerp(yukari, hy, ease((t - 34) / 10)); yuk = "kanca"; }
    else if (t < 50) { a = A1; u = U1; y = lerp(hy, yukari, ease((t - 44) / 6)); yuk = "hedef"; }
    else if (t < 72) { a = A1; u = U1; yuk = "hedef"; }
    else if (t < 80) { a = A1; u = U1; y = lerp(yukari, hy, ease((t - 72) / 8)); yuk = "hedef"; }
    else if (t < 86) { a = A1; u = U1; y = lerp(hy, yukari, ease((t - 80) / 6)); yuk = "kanca"; }
    else if (t < 104) { const e = ease((t - 86) / 18); a = lerp(A1, A0, e); u = lerp(U1, U0, e); yuk = "kanca"; }
    else if (t < 112) { y = lerp(yukari, ky, ease((t - 104) / 8)); yuk = "kanca"; }
    else { y = lerp(ky, yukari, ease((t - 112) / 8)); }
    return { az: a, uzan: uzn(u), y, yuk, kaynak, hedef, pivot };
  }
  const uzn = (u) => Math.max(6, Math.min(29, u));

  function update(o, evre, minute, real, env) {
    if (!G) return;
    if (!o || !K || K.o !== o) { G.group.visible = false; return; }
    const gp = gemiPoz(minute, _p);
    const t0 = tugPoz(0, minute, { x: 0, z: 0, h: 0 }), t1 = tugPoz(1, minute, { x: 0, z: 0, h: 0 });
    G.group.visible = !!(gp || t0 || t1);
    if (!G.group.visible) return;
    G.gemi.visible = !!gp;
    if (gp) { G.gemi.position.set(gp.x, 0.05 * Math.sin(real * 0.3), gp.z); G.gemi.rotation.set(0, gp.h, 0.004 * Math.sin(real * 0.25)); }
    // Vinçler.
    const docked = gp && minute >= K.yol.tDok;
    G.vinc.forEach((V, i) => {
      const d = docked ? vincDurum(i, minute) : vincDurum(i, -1e9);
      V.kabin.rotation.y = d.az;
      // Bom: uzanım için eğim (bomL boyunda): cos = uzan / bomL.
      const bl = K.vincler[i].bomL, eg = Math.acos(Math.min(0.98, d.uzan / bl));
      V.bom.rotation.x = -eg;
      const ucY = d.pivot[1] + bl * Math.sin(eg), ux = d.pivot[0] + Math.sin(d.az) * d.uzan, uzz = d.pivot[2] + Math.cos(d.az) * d.uzan;
      const ky = Math.min(d.y, ucY - 1);
      V.halat.position.set(ux, ucY, uzz); V.halat.scale.set(1, Math.max(0.3, ucY - ky - 0.2), 1);
      V.kiskac.position.set(ux, ky, uzz); V.kiskac.rotation.y = 0;
      const yuk = V.yuk;
      if (d.yuk === "kanca") { yuk.position.set(ux, ky - 0.2 - CH, uzz); yuk.rotation.y = 0; }
      else if (d.yuk === "hedef") { yuk.position.set(d.hedef[0], d.hedef[1], d.hedef[2]); yuk.rotation.y = 0; }
      else { yuk.position.set(d.kaynak[0], d.kaynak[1], d.kaynak[2]); yuk.rotation.y = 0; }
      // Hedefte (rıhtımdaki gemi) konteyner dünya ekseninde boyuna yatmalı: gemi yereli z → dünya x (aynı eksen).
    });
    // Palamar halatları: yanaştıktan 1 dk sonra, ayrılışa dek.
    const palVar = gp && minute >= K.yol.tDok + 1 && minute < K.ayril + 0.5;
    if (palVar && !G.palamar.children.length) palamarKur();
    G.palamar.visible = !!palVar;
    // Römorkörler ve halatları.
    [t0, t1].forEach((tp, j) => {
      const T = G.tugs[j].mesh;
      T.visible = !!tp;
      if (tp) { T.position.set(tp.x, 0.15 + 0.08 * Math.sin(real * 1.2 + j), tp.z); T.rotation.set(0.01 * Math.sin(real + j), tp.h, 0.015 * Math.sin(real * 0.9 + j)); }
      const h = G.halatlar[j], Tt = K.yol.T;
      const cekiyor = tp && gp && ((minute < Tt.C0) || (minute >= K.ayril && minute < K.ayril + 14));
      h.visible = !!cekiyor;
      if (cekiyor) {
        const kz = G.tugs[j].kic[2], c = Math.sin(tp.h), z = Math.cos(tp.h);
        const a = new THREE.Vector3(tp.x + c * kz, 2.8, tp.z + z * kz);
        const ayr = minute >= K.ayril;
        const lz = ayr ? (j ? -45 : 45) : (j ? -L / 2 + 2 : L / 2 - 2), lx = ayr ? B / 2 - 0.5 : 0;
        yerel(gp, lx, lz, _q);
        const b = new THREE.Vector3(_q.x, ayr ? 9 : 11, _q.z), dv = b.clone().sub(a), Lh = dv.length();
        h.position.copy(a); h.scale.set(1, Lh, 1); h.quaternion.setFromUnitVectors(Y, dv.normalize());
      }
    });
    // Köpük: geminin izi ve pruva dalgası, römorkörlerin izi ve iterken çalkantı.
    G.kop.basla();
    if (gp) tekneIzi(G.kop, (sn, out) => gemiPoz(o.bas + sn / 60, out), (minute - o.bas) * 60, { boy: L, en: B, hiz0: 2.4, n: 10, dt: 6, guc: 0.9 });
    [t0, t1].forEach((tp, j) => {
      if (!tp) return;
      tekneIzi(G.kop, (sn, out) => tugPoz(j, o.bas + sn / 60, out), (minute - o.bas) * 60, { boy: TUG, en: TUG * 0.38, hiz0: 3, n: 10, dt: 1.4 });
      const Tt = K.yol.T, calis = (minute >= Tt.D0 && minute < Tt.D1 + 2.5) || (minute >= K.ayril && minute < K.ayril + 14);
      if (calis) {
        const c = Math.sin(tp.h), z = Math.cos(tp.h);
        for (let k = 0; k < 4; k++) { const d = TUG * 0.5 + 2 + k * 4; G.kop.leke(tp.x - c * d, tp.z - z * d, 2.4 + k * 1.2, 3 + k, (0.8 - k * 0.15) * (0.75 + 0.25 * Math.sin(real * 2 + k)), tp.h); }
      }
    });
    G.kop.bitir(env?.light ?? 1);
  }

  function palamarKur() {
    const P = world.port, gp = { x: K.yol.son.x, z: K.yol.son.z, h: 1.5 * Math.PI };
    const fz = P.ship.z + P.ship.beam / 2 - 0.3, fy = shipDeckY(P) + 0.6;
    const parts = [];
    for (const [lz, fx] of [[70, 58], [52, 66], [-40, 128], [-58, 134]]) {
      yerel(gp, -B / 2 + 0.8, lz, _q);
      parts.push(rod(new THREE.Vector3(_q.x, G.deckTop - 0.2, _q.z), new THREE.Vector3(fx, fy, fz), 0.08, "#d9cfa8"));
    }
    // Usturmaçalar (iki gemi arasında büyük lastik balonlar).
    for (const x of [65, 85, 105, 125]) parts.push(colored(new THREE.CylinderGeometry(1.0, 1.0, 3.2, 10).rotateZ(Math.PI / 2).translate(x, 0.8, fz + 0.3 + 0.8), "#26282c"));
    G.palamar.add(new THREE.Mesh(birlestir(parts), TEKNE_MAT()));
  }

  function canli(minute) {
    if (!K) return null;
    if (minute < K.o.bas || minute > K.o.son) return null;
    const gp = gemiPoz(minute, _p);
    return gp ? [gp.x, 14, gp.z] : null;
  }

  function ses(minute) {
    if (!K) return null;
    const T = K.yol.T;
    return { kalabalik: minute > T.C0 && minute < K.o.son ? 0.5 : 0 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const T = K.yol.T, n = S.seyirci;
    const izle = n ? ` ${n} kişi vapur iskelesinden izledi.` : "";
    const bas = `Saat ${saatte(o.bas)} ufukta 172 metrelik dev bir konteyner gemisi göründü; Yük Limanı'ndaki gemiden iki kat uzun.`;
    if (minute < T.C0) return { kisa: "Ufukta dev bir gemi!", uzun: `${bas} İki römorkör eşliğinde limana doğru geliyor.` };
    if (minute < T.D0) return { kisa: "Dev gemi limanın önünde", uzun: `${bas} Gemi limanın önünde yavaşladı; römorkörler halatı bırakıp yanına geçiyor.` };
    if (minute < T.D1) return { kisa: "Dev gemi limana yanaşıyor", uzun: `${bas} İki römorkör gemiyi yandan iterek rıhtımdaki geminin yanına yanaştırıyor.` };
    const dok = `Gemi saat ${saatte(T.D1)} iki römorkörün yardımıyla rıhtımdaki geminin yanına bağlandı; güvertesindeki iki vinç konteynerleri öbür gemiye aktarıyor.`;
    if (minute < o.son) return { kisa: "Dev gemi Yük Limanı'nda", uzun: `${bas} ${dok}${izle}` };
    const ayr = minute >= K.ayril ? ` Gemi saat ${saatte(K.ayril)} römorkörlerle limandan ayrıldı.` : "";
    return { kisa: `Bugün dev gemi geldi · ${saatYaz(o.bas)}`, uzun: `${bas} ${dok}${izle}${ayr}` };
  }

  return {
    kur, update, canli, yazi, ses,
    seyirci: { r0: 2, r1: 26, isR: 300, uzak: 1.8, kiyida: true, en: 30, tavirlar: ["cek", "goster", "cek", "sasir", "bak", "konus"] },
  };
}
