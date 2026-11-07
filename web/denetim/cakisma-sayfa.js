// cakisma.mjs bunu sayfada çalıştırır (__ada.world, ?denetle): tüm yerleşik nesnelerin taban izlerini toplar, birbirine giren çiftleri ve
// yolun üstüne düşen nesneleri döndürür. Taban izi: daire {x,z,r} ya da döndürülmüş dikdörtgen {x,z,w,d,rot}
// (layout.js kuralı: yerel (lx,lz) → (x + lx·cos + lz·sin, z − lx·sin + lz·cos)).
(() => {
  const w = __ada.world;
  const items = [];
  let gid = 0;
  const C = (k, x, z, r, g, extra = {}) => items.push({ k, x, z, r, g, ...extra });
  const R = (k, x, z, wd, d, rot, g, extra = {}) => items.push({ k, x, z, w: wd, d, rot: rot ?? 0, g, ...extra });
  const off = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

  for (const b of w.buildings) R("bina:" + b.kind, b.x, b.z, b.w, b.d, b.rot, ++gid, { bina: true });
  for (const t of w.trees ?? []) C("agac:" + t.kind, t.x, t.z, t.r + 0.15, ++gid, { tree: true });
  for (const l of w.lamps) C("lamba", l.x, l.z, 0.2, ++gid);
  // Masa, şemsiyesi ve sandalyeleri bir küme: kendi aralarında sayılmaz.
  const tableG = new Map();
  const near = (x, z) => { for (const [k, g] of tableG) { const [tx, tz] = k; if (Math.hypot(tx - x, tz - z) < 1.0) return g; } return null; };
  for (const f of w.features) if (f.type === "masa1") tableG.set([f.x, f.z], ++gid);
  for (const f of w.features) {
    const g = (f.type === "masa1" || f.type === "semsiye" || f.type === "sandalye") ? (near(f.x, f.z) ?? ++gid) : ++gid;
    switch (f.type) {
      case "bank": R("bank", f.x, f.z, 1.9, 0.6, f.rot, g); break;
      case "masa1": C("masa", f.x, f.z, 0.45, g); break;
      case "sandalye": C("sandalye", f.x, f.z, 0.25, g); break;
      case "semsiye": C("semsiye", f.x, f.z, 0.1, g); break;
      case "cop_kutusu": C("cop", f.x, f.z, 0.3, g); break;
      case "cesme": C("cesme", f.x, f.z, 8.0, g); break;
      case "gol": C("gol", f.x, f.z, f.r, g); break;
      case "havuz": R("havuz", f.x, f.z, f.w, f.d, 0, g); break;
      case "tezgah": R("tezgah", f.x, f.z, 3.4, 2.2, 0, g); break;
      case "fener": C("fener", f.x, f.z, 4.6, g); break;
      case "gonder": C("gonder", f.x, f.z, 0.6, g); break;
      case "minare": R("minare", f.x, f.z, 2.6, 2.6, 0, g); break;
      case "sadirvan": C("sadirvan", f.x, f.z, 2.9, g); break;
      case "pota": C("pota", f.x, f.z, 0.5, g); break;
      case "vinc": R("vinc", f.x, f.z, 1.8, 1.8, 0, g); break;
      case "cankurtaran": {
        const rot = w.beach?.face ?? 0;
        const [cx, cz] = off(f.x, f.z, rot, 0, -1.1);
        R("cankurtaran", cx, cz, 2.4, 4.6, rot, g);
        break;
      }
      case "oyun": {
        const items2 = __ada.playgroundItems(f);
        items2.forEach((o) => R("oyun:" + o.kind, o.x, o.z, o.w, o.d, o.rot, g));
        break;
      }
    }
  }
  const B = w.beach;
  if (B) {
    const face = B.face;
    B.clusters.forEach((c) => {
      const g = ++gid;
      C("plaj:semsiye", c.x, c.z, 0.1, g, { canopy: 1.5 });
      for (const side of [-1, 1]) {
        const [sx, sz] = off(c.x, c.z, face, side * 1.0, 0);
        R("plaj:sezlong", sx, sz, 0.66, 1.9, face, g);
      }
    });
    for (const { a, b } of B.walks) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), wr = Math.atan2(b[0] - a[0], b[1] - a[1]);
      R("plaj:tahta_yol", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1.8, len, wr, ++gid, { walk: true });
    }
    for (const [x, z] of B.showers) R("plaj:dus", x, z, 1.1, 1.1, face, ++gid);
    for (const [x, z] of B.cabins) R("plaj:kabin", x, z, 1.6, 1.6, face, ++gid);
    for (const [x, z] of B.bins) C("plaj:cop", x, z, 0.3, ++gid);
    if (B.volley) R("plaj:voleybol", B.volley.x, B.volley.z, 9.4, 16.2, B.volley.rot + Math.PI / 2, ++gid);
  }
  for (const f of w.features) {
    if (f.type === "tekne") R("tekne", f.x, f.z, (f.len ?? 8) * 0.36, f.len ?? 8, f.rot ?? 0, ++gid);
    if (f.type === "iskele") R("iskele", f.x, f.z + f.len / 2, f.w, f.len, 0, ++gid, { walk: true });
  }
  const K = w.koy;
  if (K) {
    for (const [rx, rz] of K.racks) R("koy:ag_sereni", rx, rz, 5.6, 0.4, 0, ++gid);
    R("koy:ters_sandal", K.upturned[0], K.upturned[1], 2.0, 5.5, K.upturned[2], ++gid);
    for (const [sx, sz, sr] of K.beached) R("koy:sandal", sx, sz, 1.6, 4.6, sr, ++gid);
    R("koy:kasalar", K.crates[0] - 0.3, K.crates[1], 2.1, 0.45, 0, ++gid);
    const tg = ++gid;
    R("koy:cay_masasi", K.table[0], K.table[1], 1.0, 0.7, 0, tg);
    R("koy:tezgah", K.stall[0] + 0.35, K.stall[1], 3.3, 1.2, 0, ++gid);
    for (const [tx, tz] of K.traps) R("koy:sepet", tx, tz, 1.5, 0.75, 0, ++gid);
    const [[bx0, bz0], [bx1]] = K.boardwalk;
    R("koy:tahta_yol", (bx0 + bx1) / 2, bz0, bx1 - bx0, 1.44, 0, ++gid, { walk: true });
    for (const [hx, hz] of K.huts) R("koy:veranda", hx, hz + 3.7, 8.4, 1.4, 0, ++gid, { veranda: true });
    R("koy:tabela", K.sign[0], K.sign[1], 2.6, 0.2, 0, ++gid);
    for (const q of K.posts) if (q.post === "ag" || q.post === "cay") C("koy:tabure", q.x, q.z, 0.18, q.post === "cay" ? tg : ++gid);
  }

  const cin = __ada.people.cinema;
  if (cin) {
    const g = ++gid;
    for (const st of cin.seats) C("sinema:sandalye", st.x, st.z, 0.3, g);
    R("sinema:perde", cin.spot[0], cin.spot[1] + 3.05, 7.0, 0.3, 0, g);
  }
  // --- kesişme ---
  const corners = (it) => {
    const c = Math.cos(it.rot), s = Math.sin(it.rot), hw = it.w / 2, hd = it.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [it.x + lx * c + lz * s, it.z - lx * s + lz * c]);
  };
  const axes = (it) => [[Math.cos(it.rot), -Math.sin(it.rot)], [Math.sin(it.rot), Math.cos(it.rot)]];
  const proj = (pts, [ax, az]) => { let lo = Infinity, hi = -Infinity; for (const [x, z] of pts) { const v = x * ax + z * az; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
  // Pozitif: iç içe geçme derinliği (m); negatif/0: değmiyor.
  const depth = (a, b) => {
    if (a.r != null && b.r != null) return a.r + b.r - Math.hypot(a.x - b.x, a.z - b.z);
    if (a.r != null || b.r != null) {
      const [cc, rr] = a.r != null ? [a, b] : [b, a];
      const c = Math.cos(rr.rot), s = Math.sin(rr.rot), dx = cc.x - rr.x, dz = cc.z - rr.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const qx = Math.max(-rr.w / 2, Math.min(rr.w / 2, lx)), qz = Math.max(-rr.d / 2, Math.min(rr.d / 2, lz));
      const inside = Math.abs(lx) < rr.w / 2 && Math.abs(lz) < rr.d / 2;
      return inside ? cc.r + Math.min(rr.w / 2 - Math.abs(lx), rr.d / 2 - Math.abs(lz)) : cc.r - Math.hypot(lx - qx, lz - qz);
    }
    const pa = corners(a), pb = corners(b);
    let m = Infinity;
    for (const ax of [...axes(a), ...axes(b)]) {
      const [a0, a1] = proj(pa, ax), [b0, b1] = proj(pb, ax);
      m = Math.min(m, Math.min(a1, b1) - Math.max(a0, b0));
    }
    return m;
  };
  const ext = (it) => it.r != null ? it.r : Math.hypot(it.w, it.d) / 2;
  const CELL = 20, grid = new Map();
  items.forEach((it, i) => {
    const e = ext(it);
    for (let gx = Math.floor((it.x - e) / CELL); gx <= Math.floor((it.x + e) / CELL); gx++)
      for (let gz = Math.floor((it.z - e) / CELL); gz <= Math.floor((it.z + e) / CELL); gz++) {
        const k = gx * 100003 + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  const seen = new Set(), hits = [];
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const i = list[p], j = list[q];
      const key = i < j ? i * 1e6 + j : j * 1e6 + i;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = items[i], b = items[j];
      if (a.g === b.g) continue;
      if (a.tree && b.tree) continue; // ağaç-ağaç (orman) sayılmaz
      const dd = depth(a, b);
      if (dd > 0.05) hits.push({ a: a.k, b: b.k, d: +dd.toFixed(2), x: +((a.x + b.x) / 2).toFixed(1), z: +((a.z + b.z) / 2).toFixed(1) });
    }
  }
  // Ağaç tacı ile plaj şemsiyesi kubbesi / kabin / bina: gövde dışı ama görsel iç içe geçme (taç ≈ boyun %28'i).
  const soft = [];
  for (const t of w.trees ?? []) {
    const crown = t.h * 0.28;
    for (const it of items) {
      if (it.tree || Math.abs(it.x - t.x) > 20 || Math.abs(it.z - t.z) > 20) continue;
      if (!(it.k.startsWith("plaj:") || it.k.startsWith("koy:") || it.k === "cankurtaran" || it.k.startsWith("oyun:") || it.bina || it.k === "fener" || it.k === "minare")) continue;
      if (it.bina && t.h * 0.45 > 3.2 * 4) continue;
      const rr = it.canopy ?? (it.r != null ? it.r : null);
      const dd = rr != null ? crown + rr - Math.hypot(it.x - t.x, it.z - t.z) : depth({ x: t.x, z: t.z, r: crown }, it);
      if (dd > 0.3) soft.push({ a: "tac:" + t.kind, b: it.k, d: +dd.toFixed(2), x: +t.x.toFixed(1), z: +t.z.toFixed(1) });
    }
  }
  // Yolun üstüne düşenler (binalar _validate'te; tahta yol, lamba hariç).
  const onRoad = [];
  for (const it of items) {
    if (it.bina || it.walk || it.k === "lamba") continue;
    const pts = it.r != null ? [[it.x, it.z]] : corners(it).concat([[it.x, it.z]]);
    for (const [x, z] of pts) {
      const h = w.roadIndex.at(x, z, 0.15);
      // Kaldırım ve yaya yolu üstündeki kent eşyası olağan; taşıt yoluna ya da patikanın ortasına düşen sayılır.
      if (h && (w.inCarriage(x, z) || h.road.type === "patika")) { onRoad.push({ a: it.k, b: "yol:" + h.road.type + (w.inCarriage(x, z) ? ":tasit" : ""), x: +x.toFixed(1), z: +z.toFixed(1) }); break; }
    }
  }
  return { n: items.length, hits, soft, onRoad };
})()
