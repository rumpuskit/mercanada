// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
// Ölçek gerçektir: 1 birim = 1 metre.
//
// Dünya hücrelere bölünür (CELL_W x CELL_D). Ortada çarşı (merkez), doğusunda tepe ve fener, batısında
// tarlalar ve plaj sabittir. Mahalleler kuzeye ve yanlara, merkeze olan uzaklık sırasıyla eklenir; her
// yeni mahalle adanın kıyısını genişletir. Koordinatlar: x doğu, z güney, y yukarı.
import { addressParts, cap, cat, mahalleName } from "../sim.js";
import { fbm, hash2 } from "./noise.js";

export const CELL_W = 520;
export const CELL_D = 270;
export const FLAT_Y = 1.2;
export const FLOOR_H = 3.2;

const HUB = [0, 0];
const MEYDAN_R = 30;

// Yol kesitleri (toplam genişlik = taşıt yolu + iki kaldırım).
export const ROADS = {
  cadde: { width: 14, carriage: 8, surface: "asfalt" },
  sokak: { width: 11, carriage: 6, surface: "parke" },
  sahil: { width: 7, carriage: 0, surface: "tas" },
  patika: { width: 3, carriage: 3, surface: "toprak" },
  koy: { width: 6, carriage: 6, surface: "toprak" },
};

// Mahalle içi: orta caddenin iki yanında 4 sütun x 5 sıra sokak, her sokakta karşılıklı 5+5 apartman.
const ROW_Z0 = -100;
const ROW_PITCH = 50;
const SOKAK_COLS = [[-245, -130], [-125, -10], [10, 125], [130, 245]];
const LOT = 23; // parsel genişliği
const BINA_D = 12;
const FRONT_YARD = 3;

// İş yeri türlerinin bina biçimi (metre).
const STYLES = {
  belediye: { w: 30, d: 20, floors: 3, roof: "hip", wall: "#f3ece0", roofColor: "#b5563f", tower: true },
  muze: { w: 26, d: 18, floors: 2, roof: "hip", wall: "#efe6d6", roofColor: "#8c4b3a", columns: true },
  kutuphane: { w: 20, d: 14, floors: 2, roof: "gable", wall: "#dfe8f0", roofColor: "#a85a44" },
  saglik: { w: 26, d: 16, floors: 3, roof: "flat", wall: "#f7f6f2", roofColor: "#c9c4bb", sign: "#d8433d" },
  okul: { w: 40, d: 16, floors: 3, roof: "hip", wall: "#f2d9a6", roofColor: "#b5563f" },
  otel: { w: 26, d: 16, floors: 6, roof: "flat", wall: "#e9f1ee", roofColor: "#c9c4bb", balconies: true },
  plaza: { w: 22, d: 22, floors: 9, roof: "flat", wall: "#cfdbe6", roofColor: "#9aa6b2", glass: true },
  market: { w: 24, d: 18, floors: 1, roof: "flat", wall: "#f4efe6", roofColor: "#c9c4bb", shop: true, awning: "#3e8a86" },
  firin: { w: 10, d: 12, floors: 3, roof: "gable", wall: "#f3dcc4", roofColor: "#b5563f", shop: true, awning: "#a8543a" },
  kafe: { w: 10, d: 12, floors: 3, roof: "gable", wall: "#f6e3d8", roofColor: "#b5563f", shop: true, awning: "#2f4a6d" },
  atolye: { w: 16, d: 14, floors: 2, roof: "gable", wall: "#e6e1d6", roofColor: "#8c4b3a", shop: true, awning: "#6f7d4a" },
  kahvehane: { w: 11, d: 12, floors: 2, roof: "gable", wall: "#eadfcf", roofColor: "#a85a44", shop: true, awning: "#b8423c" },
};

// Merkezdeki iş yerleri; sırayla meydana en yakın boş cepheye yerleşir.
const CENTER_ORDER = [
  ["belediye", 0], ["kahvehane", 0], ["kafe", 0], ["muze", 0], ["firin", 0], ["kafe", 1], ["market", 0],
  ["kutuphane", 0], ["saglik", 0], ["kafe", 2], ["plaza", 0], ["firin", 1], ["otel", 0], ["kafe", 3], ["market", 1],
  ["okul", 0], ["plaza", 1], ["atolye", 0], ["kafe", 4], ["market", 2], ["firin", 2], ["otel", 1], ["atolye", 1],
  ["kafe", 5], ["plaza", 2], ["market", 3], ["okul", 1], ["atolye", 2], ["atolye", 3],
];

// Konut cephe renkleri: Ege ve Marmara ada evleri.
const HOUSE_WALLS = ["#f4efe6", "#f3e3c8", "#e9d3c0", "#dfe7e4", "#f1d7cf", "#e8e0cf", "#f6f1e9", "#d9e2ea", "#efdcb8", "#e6d2d8"];
const HOUSE_ROOFS = ["#b5563f", "#a85a44", "#c06a4c", "#8c4b3a", "#9e5a48"];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener"]);

/** Mahalle hücrelerinin sırası: merkeze yakından uzağa; güney kıyısı (liman tarafı) hiç kapanmaz. */
const MAHALLE_CELLS = (() => {
  const cells = [];
  for (let cz = -9; cz <= 0; cz++) {
    for (let cx = -7; cx <= 7; cx++) {
      if (cz === 0 && Math.abs(cx) <= 1) continue;
      cells.push([cx, cz]);
    }
  }
  const key = ([cx, cz]) => (cx * CELL_W) ** 2 + (cz * CELL_D * 1.6) ** 2;
  return cells.sort((a, b) => key(a) - key(b) || Math.atan2(a[0], -a[1]) - Math.atan2(b[0], -b[1]));
})();

export function perMahalle() {
  return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
}

export function mahalleCount(population) {
  return Math.max(1, Math.ceil(population / perMahalle()));
}

function rectSdf(x, z, r) {
  const dx = Math.max(r.x0 - x, x - r.x1);
  const dz = Math.max(r.z0 - z, z - r.z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

export class World {
  constructor(population) {
    this.population = population;
    this.mahalleler = mahalleCount(population);
    this.cells = [
      { cx: 0, cz: 0, type: "merkez" },
      { cx: 1, cz: 0, type: "tepe" },
      { cx: -1, cz: 0, type: "kir" },
    ];
    for (let m = 0; m < this.mahalleler; m++) {
      const [cx, cz] = MAHALLE_CELLS[m];
      this.cells.push({ cx, cz, type: "mahalle", mahalle: m });
    }
    this.cellByKey = new Map(this.cells.map((c) => [`${c.cx},${c.cz}`, c]));
    this.rects = this.cells.map(({ cx, cz }) => ({
      x0: (cx - 0.5) * CELL_W, x1: (cx + 0.5) * CELL_W, z0: (cz - 0.5) * CELL_D, z1: (cz + 0.5) * CELL_D,
    }));
    this.bounds = this.rects.reduce(
      (b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }),
      { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
    );
    this.hill = { x: CELL_W + 40, z: 10, r: 85, h: 34 };

    this.buildings = [];   // {kind, x, z, rot, w, d, floors, roofType, wall, roof, ...}
    this.roads = [];       // {points, type, width, carriage, surface}
    this.crossings = [];   // yaya geçitleri {x, z, rot, len}
    this.plazas = [];      // {x, z, r} veya {x0, z0, x1, z1, kind}
    this.features = [];    // çeşme, iskele, vapur, fener, bank, ...
    this.labels = [];      // {text, x, z, h}
    this.workplaces = {};  // kind -> [{name, door, path, anchor, spread, outdoor}]
    this.places = {};      // place -> {anchors, spread, path}
    this.blocked = new Set(); // ağaç dikilmeyecek 4x4'lük kareler
    this.seats = [];       // oturulabilecek yerler {x, z, heading, top, place}
    this.piers = [];       // iskeleler {x0, x1, z0, z1, top}
    this.lamps = [];       // yollar dışındaki sokak lambaları {x, z, dir}

    this._layoutCenter();
    this._layoutCoast();
    this._layoutNature();
    for (const cell of this.cells) if (cell.type === "mahalle") this._layoutMahalle(cell);
  }

  // --- arazi ---

  sdf(x, z) {
    let d = Infinity;
    for (const r of this.rects) d = Math.min(d, rectSdf(x, z, r));
    return d;
  }

  margin(x, z) {
    return 60 + 80 * fbm(x / 320, z / 320, 7);
  }

  height(x, z) {
    const d = this.sdf(x, z);
    const m = this.margin(x, z);
    let land = FLAT_Y;
    if (d > 0) land += Math.max(0, fbm(x / 90, z / 90, 3)) * 10 * Math.min(1, d / 40);
    const hx = x - this.hill.x, hz = z - this.hill.z;
    const fade = Math.min(1, Math.max(0, (x - CELL_W / 2 - 20) / 60));
    land += Math.exp(-(hx * hx + hz * hz) / (2 * this.hill.r * this.hill.r)) * fade * (this.hill.h + 5 * fbm(x / 50, z / 50, 11));
    if (d < m - 30) return land;
    if (d < m) {
      const t = (d - (m - 30)) / 30;
      return land * (1 - t * t * (3 - 2 * t)) - 0.3 * t;
    }
    return Math.max(-12, -0.3 - (d - m) * 0.12);
  }

  /** Yürünen yüzeyin yüksekliği: iskele, kasaba zemini (kaldırım, meydan) ya da arazi. */
  groundY(x, z) {
    for (const p of this.piers) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.top;
    const h = this.height(x, z);
    return Math.abs(h - FLAT_Y) < 0.05 ? FLAT_Y + 0.17 : h;
  }

  addBench(x, z, rot, place) {
    this.features.push({ type: "bank", x, z, rot });
    const base = this.groundY(x, z);
    for (const o of [-0.45, 0.45]) {
      this.seats.push({ x: x + Math.cos(rot) * o, z: z - Math.sin(rot) * o, heading: rot, top: base + 0.49, place });
    }
  }

  addTables(x, z, n, axis, toward, place) {
    // Kaldırımdaki masalar: `toward` yönüne (yola) doğru 1,6 m açıkta, yan yana.
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6;
      const [tx, tz] = axis === "x" ? [x + along, z + toward * 1.6] : [x + toward * 1.6, z + along];
      this.features.push({ type: "masa1", x: tx, z: tz });
      const base = this.groundY(tx, tz);
      for (const side of [-1, 1]) {
        const cx = axis === "x" ? tx + side * 0.7 : tx, cz = axis === "x" ? tz : tz + side * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, top: base + 0.475, place, table: [tx, tz] });
      }
    }
  }

  isLand(x, z) {
    return this.height(x, z) > 0.15;
  }

  /** (x0, z0)'dan (dx, dz) yönünde ilerleyip kıyıyı bulur; kıyıdan `back` metre içerideki nokta. */
  coastPoint(x0, z0, dx, dz, back = 0) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    for (let s = 0; s < 2000; s += 1) {
      if (this.height(x0 + dx * s, z0 + dz * s) <= 0) return [x0 + dx * (s - back), z0 + dz * (s - back)];
    }
    return [x0, z0];
  }

  block(x0, z0, x1, z1, pad = 2) {
    for (let x = Math.floor((x0 - pad) / 4); x <= Math.floor((x1 + pad) / 4); x++) {
      for (let z = Math.floor((z0 - pad) / 4); z <= Math.floor((z1 + pad) / 4); z++) this.blocked.add(x * 100003 + z);
    }
  }

  isBlocked(x, z) {
    return this.blocked.has(Math.floor(x / 4) * 100003 + Math.floor(z / 4));
  }

  addRoad(points, type) {
    const spec = ROADS[type];
    this.roads.push({ points, type, ...spec });
    const hw = spec.width / 2 + 1;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      this.block(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, 0);
    }
  }

  addBuilding(b) {
    this.buildings.push(b);
    const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
    const hx = (b.w * c + b.d * s) / 2, hz = (b.w * s + b.d * c) / 2;
    this.block(b.x - hx, b.z - hz, b.x + hx, b.z + hz, 2);
    return b;
  }

  // --- merkez (çarşı) ---

  _layoutCenter() {
    const R = MEYDAN_R;
    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    this.plazas.push({ x: 0, z: 0, r: R + 2, kind: "meydan" });
    this.block(-R - 3, -R - 3, R + 3, R + 3, 0);
    this.features.push({ type: "cesme", x: 0, z: 0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      this.addBench(Math.cos(a) * 15, Math.sin(a) * 15, Math.atan2(-Math.cos(a), -Math.sin(a)), "meydan");
      this.features.push({ type: "agac", x: Math.cos(a) * 22, z: Math.sin(a) * 22 });
    }
    this.places.meydan = { anchors: [[0, 0]], spread: R - 6, path: [HUB] };
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.lamps.push({ x: Math.cos(a) * (R - 1), z: Math.sin(a) * (R - 1), dir: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }

    const av = ROADS.cadde.width;
    this.addRoad([[0, -R], [0, -halfD]], "cadde");
    this.addRoad([[R, 0], [halfW, 0]], "cadde");
    this.addRoad([[-R, 0], [-halfW, 0]], "cadde");

    // Cepheler: caddelerin iki yanı. Her bina, meydana en yakın boş cepheye yerleşir.
    const fronts = [];
    for (const [axis, sign, end] of [["x", 1, halfW - 12], ["x", -1, halfW - 12], ["z", -1, halfD - 8], ["z", 1, 105]]) {
      for (const side of [-1, 1]) fronts.push({ axis, sign, side, cursor: R + 12, end });
    }
    CENTER_ORDER.forEach(([kind, index]) => {
      const style = STYLES[kind];
      const front = fronts.filter((f) => f.cursor + style.w <= f.end).sort((a, b) => a.cursor - b.cursor)[0];
      const t = front.cursor + style.w / 2;
      front.cursor += style.w + 3;
      const off = av / 2 + 1.5 + style.d / 2;
      let x, z, rot, door, street;
      if (front.axis === "x") {
        x = front.sign * t; z = front.side * off;
        rot = front.side < 0 ? 0 : Math.PI;
        door = [x, front.side * (av / 2 + 1)];
        street = [x, 0];
      } else {
        z = front.sign * t; x = front.side * off;
        rot = front.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        door = [front.side * (av / 2 + 1), z];
        street = [0, z];
      }
      const b = this.addBuilding({
        kind, x, z, rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof,
        wall: style.wall, roof: style.roofColor, style, workplace: true,
      });
      const path = [street, HUB];
      if (kind === "kahvehane") {
        this.places.kahvehane = { anchors: [door], spread: 3, path, building: b };
        const toward = front.axis === "x" ? -front.side : -front.side;
        this.addTables(door[0], door[1], 3, front.axis, toward, "kahvehane");
      } else {
        this._addWorkplace(kind, index, { door, path, anchor: door, spread: 2, building: b });
        if (kind === "kafe" || kind === "firin") this.addTables(door[0], door[1], kind === "kafe" ? 3 : 2, front.axis, -front.side, "kafe");
      }
    });

    // Cephelerin kalanı: altı dükkân, üstü konut çarşı binaları.
    let filler = 0;
    for (const front of fronts) {
      while (true) {
        const key = 9000 + filler;
        const w = 10 + Math.floor(hash2(key, 1, 9) * 3) * 2;
        if (front.cursor + w > front.end) break;
        const t = front.cursor + w / 2;
        front.cursor += w + 1.5;
        filler++;
        const d = 12, off = av / 2 + 1.5 + d / 2;
        const [x, z, rot] = front.axis === "x"
          ? [front.sign * t, front.side * off, front.side < 0 ? 0 : Math.PI]
          : [front.side * off, front.sign * t, front.side < 0 ? Math.PI / 2 : -Math.PI / 2];
        const awning = ["#2f4a6d", "#b8423c", "#3e8a86", "#d9a441", "#6f7d4a", "#8a5a7a"][Math.floor(hash2(key, 2, 9) * 6)];
        this.addBuilding({
          kind: "carsi", x, z, rot, w, d, floors: 2 + Math.floor(hash2(key, 3, 9) * 3), roofType: hash2(key, 4, 9) < 0.6 ? "hip" : "flat",
          wall: HOUSE_WALLS[Math.floor(hash2(key, 5, 9) * HOUSE_WALLS.length)], roof: HOUSE_ROOFS[Math.floor(hash2(key, 6, 9) * HOUSE_ROOFS.length)],
          style: { shop: true, awning }, workplace: true,
        });
      }
    }
    this.carsiWalks = [
      [[-halfW + 15, -4.9], [-R - 4, -4.9]], [[R + 4, -4.9], [halfW - 15, -4.9]],
      [[-halfW + 15, 4.9], [-R - 4, 4.9]], [[R + 4, 4.9], [halfW - 15, 4.9]],
      [[-4.9, -halfD + 10], [-4.9, -R - 4]], [[4.9, -halfD + 10], [4.9, -R - 4]],
    ];

    // Park (kuzeybatı): çimen, havuz, yürüyüş yolları, banklar.
    const park = { x0: -halfW + 20, z0: -halfD + 12, x1: -45, z1: -42 };
    this.plazas.push({ ...park, kind: "park" });
    const pcx = (park.x0 + park.x1) / 2, pcz = (park.z0 + park.z1) / 2;
    this.features.push({ type: "gol", x: pcx, z: pcz, r: 14 });
    this.block(pcx - 16, pcz - 16, pcx + 16, pcz + 16, 0);
    this.addRoad([[park.x1 + 30, pcz], [pcx + 18, pcz]], "patika");
    this.addRoad([[pcx, park.z0 + 4], [pcx, pcz - 18]], "patika");
    for (let i = 0; i < 6; i++) this.addBench(pcx - 50 + i * 20, pcz + 24, Math.PI, "park");
    for (let i = 0; i < 4; i++) this.addBench(pcx - 30 + i * 20, pcz - 24, 0, "park");
    this.places.park = {
      anchors: [[pcx + 30, pcz + 20], [pcx - 40, pcz - 20], [pcx - 60, pcz + 15], [pcx + 50, pcz - 25]], spread: 10,
      path: [[park.x1 + 30, pcz], [0, pcz], HUB],
    };

    // Kuzeydoğu: futbol sahası; güneydoğu: otel bahçesi ve havuz; güneybatı: pazar yeri.
    this.plazas.push({ x0: 90, z0: -128, x1: 200, z1: -52, kind: "saha" });
    this.block(90, -128, 200, -52, 0);
    this.features.push({ type: "havuz", x: 140, z: 85, w: 25, d: 12 });
    this.block(124, 76, 156, 94, 0);
    const market = { x0: -200, z0: 50, x1: -90, z1: 100 };
    this.plazas.push({ ...market, kind: "pazar" });
    this.block(market.x0, market.z0, market.x1, market.z1, 0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        this.features.push({ type: "tezgah", x: market.x0 + 8 + c * 11.8, z: market.z0 + 9 + r * 16, c: (r * 9 + c) % 10 });
      }
    }
    this.places.pazar = { anchors: [[(market.x0 + market.x1) / 2, (market.z0 + market.z1) / 2]], spread: 45, path: [[market.x1, 0], HUB] };
    this.labels.push({ text: "Çarşı", x: 0, z: 0, h: 45 });
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    (this.workplaces[kind] ??= [])[index] = { name: names[index % names.length], outdoor: OUTDOOR_KINDS.has(kind), ...entry };
  }

  // --- güney kıyısı: liman, iskele, tersane, balıkçı koyu, sahil yolu ---

  _layoutCoast() {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);

    // Sahil yolu: kıyıyı izleyen taş gezinti yolu.
    const promenade = [];
    for (let x = -250; x <= 250; x += 10) promenade.push([x, coast(x)[1] - 10]);
    this.addRoad(promenade, "sahil");
    const promAt = (x) => promenade[Math.max(0, Math.min(promenade.length - 1, Math.round((x + 250) / 10)))];

    // Liman: güney caddesinin ucunda 80 m iskele ve yanaşmış vapur.
    const [, lz] = coast(0);
    this.addRoad([[0, MEYDAN_R], [0, lz - 3]], "cadde");
    this.features.push({ type: "iskele", x: 0, z: lz - 4, len: 80, w: 10 });
    this.piers.push({ x0: -5, x1: 5, z0: lz - 4, z1: lz + 76, top: 1.53 });
    this.features.push({ type: "vapur", x: 13, z: lz + 40 });
    this.addBuilding({ kind: "liman", x: -22, z: lz - 20, rot: Math.PI / 2, w: 16, d: 10, floors: 2, roofType: "hip", wall: "#f6f1e9", roof: "#8c4b3a", workplace: true });
    const limanPath = [[0, lz - 6], HUB];
    cat().isyerleri.liman.forEach((_, i) => this._addWorkplace("liman", i, { door: [0, lz + 4], path: limanPath, anchor: [0, lz + 20 + i * 10], spread: 4 }));
    this.labels.push({ text: "Liman", x: 0, z: lz + 20, h: 22 });

    // Balık tutma iskelesi.
    const [ix, iz] = coast(-90);
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 36, w: 3 });
    this.piers.push({ x0: ix - 1.5, x1: ix + 1.5, z0: iz - 3, z1: iz + 33, top: 1.53 });
    const pi = promAt(ix);
    this.places.iskele = { anchors: [[ix - 1.0, iz + 22], [ix + 1.0, iz + 26], [ix - 1.0, iz + 30], [ix + 1.0, iz + 31]], spread: 0, path: [[ix, iz - 3], pi, [0, pi[1]], HUB] };

    // Tersane.
    const [tx, tz] = coast(180);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 18, rot: 0, w: 32, d: 20, floors: 3, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", workplace: true, industrial: true });
    this.features.push({ type: "vinc", x: tx + 22, z: tz - 4 });
    this.features.push({ type: "tekne", x: tx - 6, z: tz + 10, rot: 0.15, len: 16 });
    const pt = promAt(tx);
    this._addWorkplace("tersane", 0, { door: [tx, tz - 7], path: [[tx, tz - 7], pt, [0, pt[1]], HUB], anchor: [tx + 8, tz - 3], spread: 6 });

    // Balıkçı koyu: kulübeler ve tekneler.
    const [bx, bz] = coast(-200);
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 18 + i * 14, z: bz - 13, rot: 0, w: 8, d: 6, floors: 1, roofType: "gable", wall: ["#e9edf0", "#dbe7ee", "#f3e3c8"][i], roof: "#7a8a9a" });
    }
    for (let i = 0; i < 3; i++) this.features.push({ type: "tekne", x: bx - 14 + i * 13, z: bz + 12 + (i % 2) * 5, rot: -0.3 + i * 0.3, len: 7 });
    const pb = promAt(bx);
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: [bx, bz - 5], path: [[bx, bz - 5], pb, [0, pb[1]], HUB], anchor: [bx, bz + 1], spread: 8,
    }));

    const mid = promAt(0);
    this.places.sahil_yolu = { anchors: promenade.filter((_, i) => i % 4 === 0), spread: 1.5, path: [mid, HUB] };
  }

  // --- doğa: tepe ve fener (doğu), tarlalar ve plaj (batı) ---

  _layoutNature() {
    const halfW = CELL_W / 2;
    const { x: hx, z: hz } = this.hill;
    const top = [hx, hz];
    const trail = [[halfW, 0], [hx - 90, 0], [hx - 50, hz - 15], [hx - 20, hz - 5], top];
    this.addRoad(trail, "patika");
    this.addBench(hx + 3, hz + 4, 0, "tepe");
    this.addBench(hx - 4, hz + 5, 0.3, "tepe");
    this.places.tepe = { anchors: [top], spread: 7, path: [...trail].reverse().concat([HUB]) };
    this.labels.push({ text: "Tepe", x: hx, z: hz, h: 30 });

    const [fx, fz] = this.coastPoint(hx, hz, 0.75, 0.66, 8);
    this.features.push({ type: "fener", x: fx, z: fz });
    this.block(fx - 5, fz - 5, fx + 5, fz + 5, 0);
    const fenerTrail = [[fx - 5, fz - 5], [hx + 20, hz + 60], [hx - 90, 0]];
    this.addRoad(fenerTrail, "patika");
    const fenerPath = [...fenerTrail, [halfW, 0], HUB];
    this._addWorkplace("fener", 0, { door: [fx, fz], path: fenerPath, anchor: [fx - 4, fz - 4], spread: 2 });
    this.places.fener = { anchors: [[fx - 6, fz - 6]], spread: 3, path: fenerPath };
    this.labels.push({ text: "Fener", x: fx, z: fz, h: 34 });

    // Batı: köy yolu, iki çiftlik ve plaj.
    const kx = -CELL_W;
    this.addRoad([[-halfW, 0], [kx - 120, 0]], "koy");
    cat().isyerleri.tarla.forEach((name, i) => {
      const x0 = kx - 200 + i * 190, z0 = -125;
      for (let f = 0; f < 4; f++) {
        const fx0 = x0 + (f % 2) * 88, fz0 = z0 + Math.floor(f / 2) * 54;
        this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 82, z1: fz0 + 48, kind: "tarla", crop: (f + i) % 3 });
        this.block(fx0, fz0, fx0 + 82, fz0 + 48, 0);
      }
      const barn = this.addBuilding({ kind: "ahir", x: x0 + 85, z: -14, rot: 0, w: 18, d: 12, floors: 2, roofType: "gable", wall: "#b5563f", roof: "#6d6a66", workplace: true });
      const door = [barn.x, -7.5];
      this._addWorkplace("tarla", i, { door, path: [door, [barn.x, 0], [-halfW, 0], HUB], anchor: [x0 + 85, z0 + 51], spread: 40 });
    });

    const [px, pz] = this.coastPoint(kx - 30, 10, -0.2, 1, 14);
    const beach = [];
    for (let i = -4; i <= 4; i++) beach.push(this.coastPoint(kx - 30 + i * 16, 10, -0.2, 1, 12));
    beach.forEach(([x, z], i) => {
      this.features.push({ type: "semsiye", x, z, c: i % 10 });
      this.features.push({ type: "sezlong", x: x + 2.2, z: z + 1, rot: 0.1 });
    });
    const toBeach = [[kx - 30, 0], [px, pz - 14]];
    this.addRoad(toBeach, "patika");
    const beachPath = [[px, pz - 14], [kx - 30, 0], [-halfW, 0], HUB];
    this.places.plaj = { anchors: beach.map(([x, z]) => [x, z + 4]), spread: 5, path: beachPath };
    this._addWorkplace("plaj", 0, { door: [px, pz], path: beachPath, anchor: [px, pz + 2], spread: 3 });
    this.features.push({ type: "cankurtaran", x: px, z: pz - 2 });
    this.labels.push({ text: "Plaj", x: px, z: pz, h: 18 });
  }

  // --- mahalleler ---

  cellCenter(cell) {
    return [cell.cx * CELL_W, cell.cz * CELL_D];
  }

  _entryZ(cell) {
    return cell.cz * CELL_D + (cell.cz === 0 ? -CELL_D / 2 : CELL_D / 2);
  }

  _layoutMahalle(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfD = CELL_D / 2;
    const entryZ = this._entryZ(cell);
    this.addRoad([[ox, oz - halfD], [ox, oz + halfD]], "cadde");
    // Mahalle girişinden merkezin kuzey caddesine giden ana yol.
    if (ox !== 0) this.addRoad([[ox, entryZ], [0, entryZ]], "cadde");
    if (entryZ !== -halfD) this.addRoad([[0, entryZ], [0, -halfD]], "cadde");

    const rows = cap("sokak_per_mahalle") / SOKAK_COLS.length;
    for (let r = 0; r < rows; r++) {
      const z = oz + ROW_Z0 + r * ROW_PITCH;
      this.addRoad([[ox - 250, z], [ox - ROADS.cadde.width / 2, z]], "sokak");
      this.addRoad([[ox + ROADS.cadde.width / 2, z], [ox + 250, z]], "sokak");
      this.crossings.push({ x: ox - ROADS.cadde.width / 2 - 2, z, rot: 0, len: ROADS.sokak.carriage });
      this.crossings.push({ x: ox + ROADS.cadde.width / 2 + 2, z, rot: 0, len: ROADS.sokak.carriage });
    }
    const perBina = cap("daire_per_bina");
    const binaPerSokak = cap("bina_per_sokak");
    const first = cell.mahalle * perMahalle();
    for (let s = 0; s < cap("sokak_per_mahalle"); s++) {
      for (let b = 0; b < binaPerSokak; b++) {
        const slot0 = first + (s * binaPerSokak + b) * perBina;
        if (slot0 >= this.population) continue;
        const home = this.homeOf(slot0);
        const key = cell.mahalle * 1000 + s * 10 + b;
        const floors = 3 + Math.floor(hash2(key, 1, 5) * 3);
        const perFloor = Math.ceil(perBina / floors);
        this.addBuilding({
          kind: "konut", x: home.bx, z: home.bz, rot: home.north ? 0 : Math.PI,
          w: perFloor * 4.6 + 2.4, d: BINA_D, floors, perFloor,
          roofType: hash2(key, 2, 5) < 0.75 ? "hip" : "flat",
          wall: HOUSE_WALLS[Math.floor(hash2(key, 3, 5) * HOUSE_WALLS.length)],
          roof: HOUSE_ROOFS[Math.floor(hash2(key, 4, 5) * HOUSE_ROOFS.length)],
          balconies: hash2(key, 6, 5) < 0.7,
          slot0, daireler: perBina,
        });
      }
    }
    this.labels.push({ text: mahalleName(cell.mahalle), x: ox, z: oz, h: 45 });
  }

  /** Bir sakinin evi: bina konumu, kapı ve meydana giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const cell = this.cells.find((c) => c.mahalle === p.mahalle) ?? (() => {
      const [cx, cz] = MAHALLE_CELLS[p.mahalle % MAHALLE_CELLS.length];
      return { cx, cz };
    })();
    const [ox, oz] = this.cellCenter(cell);
    const half = cap("bina_per_sokak") / 2;
    const r = Math.floor(p.sokak / SOKAK_COLS.length), c = p.sokak % SOKAK_COLS.length;
    const streetZ = oz + ROW_Z0 + r * ROW_PITCH;
    const north = p.bina < half;
    const bx = ox + SOKAK_COLS[c][0] + LOT / 2 + (p.bina % half) * LOT;
    const facade = ROADS.sokak.width / 2 + FRONT_YARD;
    const bz = streetZ + (north ? -1 : 1) * (facade + BINA_D / 2);
    const door = [bx, streetZ + (north ? -1 : 1) * (facade - 0.5)];
    const entryZ = this._entryZ(cell);
    const path = [[bx, streetZ], [ox, streetZ], [ox, entryZ], [0, entryZ], [0, -CELL_D / 2], HUB];
    return { bx, bz, door, path, north, parts: p };
  }

  workplaceOf(wp) {
    const list = this.workplaces[wp.kind];
    return list[wp.index] ?? list.find(Boolean);
  }

  placeOf(name) {
    return this.places[name] ?? this.places.meydan;
  }
}
