// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
//
// Dünya hücrelere bölünür (CELL_W x CELL_D). Ortada çarşı (merkez), doğusunda tepe ve fener, batısında
// tarlalar ve plaj sabittir. Mahalleler kuzeye ve yanlara, merkeze olan uzaklık sırasıyla eklenir; her
// yeni mahalle adanın kıyısını genişletir. Koordinatlar: x doğu, z güney, y yukarı.
import { addressParts, cap, cat, mahalleName, roll, fnv1a } from "../sim.js";
import { fbm, hash2 } from "./noise.js";
import * as P from "./palette.js";

export const CELL_W = 280;
export const CELL_D = 190;
export const FLAT_Y = 1.2;
export const FLOOR_H = 3.2;

const HUB = [0, 0];
const MEYDAN_R = 22;
const AVENUE_W = 10;

// Mahalle içi: orta caddenin iki yanında 4 sütun x 5 sıra sokak, her sokakta karşılıklı 5+5 bina.
const ROW_Z0 = -68;
const ROW_PITCH = 34;
const SOKAK_COLS = [[-127, -67], [-67, -7], [7, 67], [67, 127]];
const BINA_STEP = 12;
const BINA_W = 9;
const BINA_D = 9;

// İş yeri türlerinin bina biçimi.
const STYLES = {
  belediye: { w: 18, d: 14, floors: 3, roof: "flat", wall: "#f6eee6", roofColor: "#c96f7c", tower: true },
  muze: { w: 17, d: 13, floors: 2, roof: "gable", wall: "#efe4d6", roofColor: "#7a9cc6", columns: true },
  kutuphane: { w: 15, d: 12, floors: 2, roof: "gable", wall: "#b5d3f3", roofColor: "#8a7fc0" },
  saglik: { w: 16, d: 13, floors: 3, roof: "flat", wall: "#fbf8f4", roofColor: "#e07a6f", sign: "#e05a5a" },
  okul: { w: 18, d: 12, floors: 2, roof: "gable", wall: "#ffd59e", roofColor: "#e07a6f" },
  otel: { w: 15, d: 13, floors: 6, roof: "flat", wall: "#a8e0d1", roofColor: "#5fa79a" },
  plaza: { w: 14, d: 14, floors: 8, roof: "flat", wall: "#b9d7ef", roofColor: "#7a9cc6" },
  market: { w: 17, d: 12, floors: 1, roof: "flat", wall: "#fbe3a6", roofColor: "#5fa79a", awning: "#5fa79a" },
  firin: { w: 11, d: 10, floors: 2, roof: "gable", wall: "#f9c9a8", roofColor: "#d4886a", awning: "#d4886a" },
  kafe: { w: 11, d: 10, floors: 2, roof: "gable", wall: "#f7b2bd", roofColor: "#c96f7c", awning: "#e0607a" },
  atolye: { w: 13, d: 12, floors: 1, roof: "gable", wall: "#c8e6b4", roofColor: "#7a9cc6" },
  kahvehane: { w: 11, d: 10, floors: 1, roof: "gable", wall: "#d4c1f0", roofColor: "#8a7fc0", awning: "#8a62d1" },
};

// Merkezdeki iş yerleri, meydana yakın olandan uzağa sıralı parsellere yerleşir.
const CENTER_ORDER = [
  ["belediye", 0], ["muze", 0], ["kahvehane", 0], ["kafe", 0], ["firin", 0], ["market", 0], ["kutuphane", 0],
  ["saglik", 0], ["kafe", 1], ["plaza", 0], ["okul", 0], ["otel", 0], ["kafe", 2], ["firin", 1], ["market", 1],
  ["plaza", 1], ["kafe", 3], ["atolye", 0], ["market", 2], ["okul", 1], ["otel", 1], ["kafe", 4], ["firin", 2],
  ["plaza", 2], ["atolye", 1], ["market", 3], ["kafe", 5], ["atolye", 2], ["atolye", 3],
];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener"]);

/** Mahalle hücrelerinin sırası: merkeze yakından uzağa; güney kıyısı (liman tarafı) hiç kapanmaz. */
const MAHALLE_CELLS = (() => {
  const cells = [];
  for (let cz = -9; cz <= 0; cz++) {
    for (let cx = -9; cx <= 9; cx++) {
      if (cz === 0 && Math.abs(cx) <= 1) continue;
      cells.push([cx, cz]);
    }
  }
  const key = ([cx, cz]) => (cx * CELL_W) ** 2 + (cz * CELL_D) ** 2;
  return cells.sort((a, b) => key(a) - key(b) || Math.atan2(a[0], -a[1]) - Math.atan2(b[0], -b[1]));
})();

export function mahalleCount(population) {
  const perMahalle = cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
  return Math.max(1, Math.ceil(population / perMahalle));
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
    this.rects = this.cells.map(({ cx, cz }) => ({
      x0: (cx - 0.5) * CELL_W, x1: (cx + 0.5) * CELL_W, z0: (cz - 0.5) * CELL_D, z1: (cz + 0.5) * CELL_D,
    }));
    this.bounds = this.rects.reduce(
      (b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }),
      { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
    );
    this.hill = { x: CELL_W + 25, z: 15, r: 58, h: 20 };

    this.buildings = [];   // {x, z, w, d, floors, rot, wall, roof, roofType, ...}
    this.roads = [];       // {points: [[x,z]...], width, color}
    this.plazas = [];      // {x, z, r} veya {x0,z0,x1,z1,color}
    this.features = [];    // fener, iskele, tekne vb. özel parçalar
    this.labels = [];      // {text, x, z}
    this.workplaces = {};  // kind -> [{name, door, path, anchor, spread, outdoor}]
    this.places = {};      // place -> {anchors, spread, path}
    this.blocked = new Set(); // ağaç dikilmeyecek 4x4'lük kareler

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
    return 48 + 70 * fbm(x / 240, z / 240, 7);
  }

  height(x, z) {
    const d = this.sdf(x, z);
    const m = this.margin(x, z);
    let land = FLAT_Y;
    if (d > 0) land += Math.max(0, fbm(x / 70, z / 70, 3)) * 9 * Math.min(1, d / 30);
    const hx = x - this.hill.x, hz = z - this.hill.z;
    const hill = Math.exp(-(hx * hx + hz * hz) / (2 * this.hill.r * this.hill.r)) * Math.min(1, Math.max(0, (x - CELL_W / 2 - 10) / 40));
    land += hill * (this.hill.h + 4 * fbm(x / 40, z / 40, 11));
    if (d < m - 24) return land;
    if (d < m) {
      const t = (d - (m - 24)) / 24;
      return land * (1 - t * t * (3 - 2 * t)) - 0.25 * t;
    }
    return Math.max(-9, -0.25 - (d - m) * 0.2);
  }

  isLand(x, z) {
    return this.height(x, z) > 0.15;
  }

  /** (x0, z0)'dan (dx, dz) yönünde ilerleyip kıyıyı bulur; kıyıdan `back` birim içerideki nokta. */
  coastPoint(x0, z0, dx, dz, back = 0) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    for (let s = 0; s < 1200; s += 1) {
      if (this.height(x0 + dx * s, z0 + dz * s) <= 0) {
        return [x0 + dx * (s - back), z0 + dz * (s - back)];
      }
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

  addRoad(points, width, color = P.ROAD) {
    this.roads.push({ points, width, color });
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      this.block(Math.min(ax, bx) - width / 2, Math.min(az, bz) - width / 2, Math.max(ax, bx) + width / 2, Math.max(az, bz) + width / 2);
    }
  }

  addBuilding(b) {
    this.buildings.push(b);
    const half = Math.max(b.w, b.d) / 2;
    this.block(b.x - half, b.z - half, b.x + half, b.z + half, 3);
    return b;
  }

  // --- merkez (çarşı) ---

  _layoutCenter() {
    const R = MEYDAN_R;
    this.plazas.push({ x: 0, z: 0, r: R + 4 });
    this.block(-R - 4, -R - 4, R + 4, R + 4);
    this.features.push({ type: "cesme", x: 0, z: 0 });
    this.places.meydan = { anchors: [[0, 0]], spread: R - 4, path: [HUB] };

    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    this.addRoad([[0, -R], [0, -halfD]], AVENUE_W, P.AVENUE);
    this.addRoad([[R, 0], [halfW, 0]], AVENUE_W, P.AVENUE);
    this.addRoad([[-R, 0], [-halfW, 0]], AVENUE_W, P.AVENUE);

    // Parseller: caddelerin iki yanında, meydana yakından uzağa.
    const lots = [];
    const along = (axis, sign, dists) => {
      for (const t of dists) {
        for (const side of [-1, 1]) {
          lots.push({ axis, sign, t, side, dist: t });
        }
      }
    };
    along("x", 1, [40, 62, 84, 106, 128]);
    along("x", -1, [40, 62, 84, 106, 128]);
    along("z", -1, [40, 62, 84]);
    along("z", 1, [40, 62]);
    lots.sort((a, b) => a.dist - b.dist || (a.axis > b.axis ? 1 : -1) || a.sign - b.sign || a.side - b.side);

    CENTER_ORDER.forEach(([kind, index], i) => {
      const lot = lots[i];
      const style = STYLES[kind];
      const off = AVENUE_W / 2 + 3 + style.d / 2;
      let x, z, rot, door, street;
      if (lot.axis === "x") {
        x = lot.sign * lot.t; z = lot.side * off;
        rot = lot.side < 0 ? 0 : Math.PI;
        door = [x, lot.side * (AVENUE_W / 2 + 2)];
        street = [x, lot.side * 2];
      } else {
        z = lot.sign * lot.t; x = lot.side * off;
        rot = lot.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        door = [lot.side * (AVENUE_W / 2 + 2), z];
        street = [lot.side * 2, z];
      }
      const corner = lot.axis === "x" ? [lot.sign * R, street[1]] : [street[0], lot.sign * R];
      const b = this.addBuilding({
        kind, x, z, rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof,
        wall: style.wall, roof: style.roofColor, style, workplace: true,
      });
      const path = [door, street, corner, HUB];
      if (kind === "kahvehane") {
        this.places.kahvehane = { anchors: [door], spread: 4, path, indoor: true, building: b };
      } else {
        this._addWorkplace(kind, index, { door, path, anchor: door, spread: 3, building: b });
      }
    });

    // Park: kuzeybatı çeyreğinde.
    const park = { x0: -128, z0: -88, x1: -34, z1: -32 };
    this.plazas.push({ ...park, color: P.GRASS_DARK, park: true });
    this.features.push({ type: "gol", x: -82, z: -62, r: 11 });
    this.block(-95, -75, -69, -49);
    const parkGate = [-34, -60];
    this.addRoad([[-60, -60], [-6, -60]], 4, P.ROAD);
    this.places.park = { anchors: [[-60, -62], [-100, -45], [-105, -78], [-60, -80]], spread: 7, path: [parkGate, [-6, -60], [-2, -R], HUB] };

    // Kuzeydoğu: okul bahçesi; güneydoğu: otel havuzu; güneybatı: pazar yeri.
    this.plazas.push({ x0: 40, z0: -86, x1: 118, z1: -36, color: P.FIELD[1], field: "spor" });
    this.block(40, -86, 118, -36);
    this.plazas.push({ x0: 40, z0: 34, x1: 118, z1: 80, color: P.PLAZA });
    this.features.push({ type: "havuz", x: 80, z: 58, w: 30, d: 14 });
    this.block(62, 48, 98, 68);
    this.plazas.push({ x0: -118, z0: 34, x1: -40, z1: 80, color: P.PLAZA });
    for (let i = 0; i < 8; i++) this.features.push({ type: "tezgah", x: -108 + (i % 4) * 20, z: 46 + Math.floor(i / 4) * 20, c: P.CLOTHES[i] });
    this.block(-118, 34, -40, 80);

    this.labels.push({ text: "Çarşı", x: 0, z: 0, h: 34 });
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    (this.workplaces[kind] ??= [])[index] = { name: names[index % names.length], outdoor: OUTDOOR_KINDS.has(kind), ...entry };
  }

  // --- güney kıyısı: liman, iskele, tersane, balıkçı koyu, sahil yolu ---

  _layoutCoast() {
    const halfD = CELL_D / 2;
    const coast = (x) => this.coastPoint(x, 40, 0, 1);

    // Liman: güney caddesinin ucunda uzun iskele ve vapur.
    const [lx, lz] = coast(0);
    this.addRoad([[0, MEYDAN_R], [0, lz - 2]], AVENUE_W, P.AVENUE);
    this.features.push({ type: "iskele", x: 0, z: lz - 4, len: 48, w: 8 });
    this.features.push({ type: "vapur", x: 13, z: lz + 26 });
    const limanPath = [[0, lz - 6], [0, MEYDAN_R], HUB];
    this.addBuilding({ kind: "liman", x: -16, z: lz - 16, rot: Math.PI / 2, w: 12, d: 10, floors: 2, roofType: "flat", wall: "#fbf8f4", roof: "#4a7fd1", workplace: true });
    cat().isyerleri.liman.forEach((_, i) => this._addWorkplace("liman", i, { door: [0, lz + 6], path: limanPath, anchor: [0, lz + 10 + i * 8], spread: 5 }));

    // Balık tutma iskelesi.
    const [ix, iz] = coast(-48);
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 26, w: 4 });
    this.places.iskele = { anchors: [[ix, iz + 14], [ix, iz + 20]], spread: 1.5, path: [[ix, iz - 4], [ix, lz - 30], [0, lz - 30], [0, MEYDAN_R], HUB] };

    // Tersane ve balıkçı koyu.
    const [tx, tz] = coast(95);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 14, rot: 0, w: 22, d: 16, floors: 3, roofType: "gable", wall: "#b5c4d6", roof: "#5b6f8a", workplace: true });
    this.features.push({ type: "vinc", x: tx + 15, z: tz - 4 });
    this.features.push({ type: "tekne", x: tx - 4, z: tz + 8, rot: 0.2, big: true });
    const [bx, bz] = coast(-100);
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 14 + i * 13, z: bz - 12, rot: 0, w: 8, d: 7, floors: 1, roofType: "gable", wall: P.WALLS[(i * 3) % 8].getStyle(), roof: "#d4886a" });
    }
    this.features.push({ type: "tekne", x: bx - 8, z: bz + 10, rot: -0.4 });
    this.features.push({ type: "tekne", x: bx + 10, z: bz + 14, rot: 0.5 });

    // Sahil yolu: kıyıyı izleyen gezinti yolu.
    const promenade = [];
    for (let x = -150; x <= 150; x += 10) {
      const [, cz] = coast(x);
      promenade.push([x, cz - 9]);
    }
    this.addRoad(promenade, 5, P.ROAD);
    const midIdx = Math.floor(promenade.length / 2);
    const toHub = [[0, promenade[midIdx][1]], [0, MEYDAN_R], HUB];
    this._addWorkplace("tersane", 0, { door: [tx, tz - 4], path: [[tx, tz - 4], [tx, promenade[Math.round((tx + 150) / 10)][1]], ...toHub], anchor: [tx + 6, tz - 2], spread: 6 });
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: [bx, bz - 4], path: [[bx, bz - 4], [bx, promenade[Math.round((bx + 150) / 10)][1]], ...toHub], anchor: [bx, bz + 2], spread: 7,
    }));
    this.places.sahil_yolu = {
      anchors: promenade.filter((_, i) => i % 3 === 0), spread: 2,
      path: [promenade[midIdx], ...toHub],
    };
    this.labels.push({ text: "Liman", x: 0, z: lz + 10, h: 18 });
  }

  // --- doğa: tepe ve fener (doğu), tarlalar ve plaj (batı) ---

  _layoutNature() {
    const halfW = CELL_W / 2;
    const { x: hx, z: hz } = this.hill;
    const top = [hx, hz];
    const trail = [[halfW, 0], [hx - 50, 0], [hx - 28, hz - 10], top];
    this.addRoad(trail, 3, P.WET_SAND);
    this.places.tepe = { anchors: [top], spread: 8, path: [...trail].reverse().concat([[MEYDAN_R, 0], HUB]) };

    const [fx, fz] = this.coastPoint(hx, hz, 0.75, 0.66, 7);
    this.features.push({ type: "fener", x: fx, z: fz });
    this.block(fx - 4, fz - 4, fx + 4, fz + 4);
    const fenerTrail = [[fx - 4, fz - 4], [hx + 8, hz + 30], [hx - 50, 0]];
    this.addRoad(fenerTrail, 3, P.WET_SAND);
    const fenerPath = [...fenerTrail, [halfW, 0], [MEYDAN_R, 0], HUB];
    this._addWorkplace("fener", 0, { door: [fx, fz], path: fenerPath, anchor: [fx - 3, fz - 3], spread: 2 });
    this.places.fener = { anchors: [[fx - 4, fz - 5]], spread: 3, path: fenerPath };
    this.labels.push({ text: "Fener", x: fx, z: fz, h: 30 });

    // Batı: köy yolu, iki çiftlik ve plaj.
    const kx = -CELL_W;
    const village = [[-halfW, 0], [kx, 0]];
    this.addRoad(village, 6, P.AVENUE);
    const farms = cat().isyerleri.tarla;
    farms.forEach((name, i) => {
      const x0 = kx - 110 + i * 115, z0 = -82;
      for (let f = 0; f < 4; f++) {
        const fxx = x0 + (f % 2) * 50, fzz = z0 + Math.floor(f / 2) * 34;
        this.plazas.push({ x0: fxx, z0: fzz, x1: fxx + 44, z1: fzz + 28, color: P.FIELD[(f + i) % 3], field: "ekin" });
        this.block(fxx, fzz, fxx + 44, fzz + 28);
      }
      const barn = this.addBuilding({ kind: "ahir", x: x0 + 47, z: -13, rot: 0, w: 14, d: 10, floors: 2, roofType: "gable", wall: "#e07a6f", roof: "#f6eee6", workplace: true });
      const door = [barn.x, -6.5];
      this._addWorkplace("tarla", i, { door, path: [door, [barn.x, 0], [kx, 0], [-halfW, 0], [-MEYDAN_R, 0], HUB], anchor: [x0 + 47, z0 + 31], spread: 26 });
    });

    const [px, pz] = this.coastPoint(kx - 20, 10, -0.3, 1, 10);
    const beach = [];
    for (let i = -3; i <= 3; i++) beach.push(this.coastPoint(kx - 20 + i * 18, 10, -0.3, 1, 9));
    for (const [x, z] of beach) this.features.push({ type: "semsiye", x, z, c: P.CLOTHES[Math.abs(Math.round(x)) % 10] });
    const beachPath = [[px, pz - 10], [kx, 20], [kx, 0], [-halfW, 0], [-MEYDAN_R, 0], HUB];
    this.addRoad([[kx, 0], [kx, 20], [px, pz - 10]], 4, P.WET_SAND);
    this.places.plaj = { anchors: beach, spread: 6, path: beachPath };
    this._addWorkplace("plaj", 0, { door: [px, pz], path: beachPath, anchor: [px, pz], spread: 10 });
    this.labels.push({ text: "Plaj", x: px, z: pz, h: 14 });
    this.labels.push({ text: "Tepe", x: hx, z: hz, h: 46 });
  }

  // --- mahalleler ---

  cellCenter(cell) {
    return [cell.cx * CELL_W, cell.cz * CELL_D];
  }

  _layoutMahalle(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfD = CELL_D / 2;
    const entryZ = cell.cz === 0 ? -halfD : halfD;
    this.addRoad([[ox, oz - halfD], [ox, oz + halfD]], 8, P.AVENUE);
    // Mahalle girişinden merkezin kuzey caddesine giden ana yol.
    if (ox !== 0) this.addRoad([[ox, oz + entryZ], [0, oz + entryZ]], 8, P.AVENUE);
    if (oz + entryZ !== -halfD) this.addRoad([[0, oz + entryZ], [0, -halfD]], 8, P.AVENUE);

    const perMahalle = cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
    const firstSlot = cell.mahalle * perMahalle;
    const rows = cap("sokak_per_mahalle") / SOKAK_COLS.length;
    for (let r = 0; r < rows; r++) {
      const z = oz + ROW_Z0 + r * ROW_PITCH;
      this.addRoad([[ox - 127, z], [ox + 127, z]], 6, P.ROAD);
    }
    const perBina = cap("daire_per_bina");
    const binaPerSokak = cap("bina_per_sokak");
    for (let s = 0; s < cap("sokak_per_mahalle"); s++) {
      for (let b = 0; b < binaPerSokak; b++) {
        const slot0 = firstSlot + (s * binaPerSokak + b) * perBina;
        if (slot0 >= this.population) continue;
        const home = this.homeOf(slot0);
        const key = cell.mahalle * 1000 + s * 10 + b;
        const floors = 3 + (hash2(key, 1, 5) * 3 | 0);
        this.addBuilding({
          kind: "konut", x: home.bx, z: home.bz, rot: home.north ? 0 : Math.PI, w: BINA_W, d: BINA_D, floors,
          roofType: hash2(key, 2, 5) < 0.7 ? "gable" : "flat",
          wall: P.WALLS[hash2(key, 3, 5) * P.WALLS.length | 0].getStyle(),
          roof: P.ROOFS[hash2(key, 4, 5) * P.ROOFS.length | 0].getStyle(),
          slot0, daireler: perBina,
        });
      }
    }
    this.labels.push({ text: mahalleName(cell.mahalle), x: ox, z: oz, h: 30 });
  }

  /** Bir sakinin evi: bina konumu, kapı ve meydana giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const cell = this.cells.find((c) => c.mahalle === p.mahalle) ?? { cx: MAHALLE_CELLS[p.mahalle % MAHALLE_CELLS.length][0], cz: MAHALLE_CELLS[p.mahalle % MAHALLE_CELLS.length][1] };
    const [ox, oz] = this.cellCenter(cell);
    const half = cap("bina_per_sokak") / 2;
    const r = Math.floor(p.sokak / SOKAK_COLS.length), c = p.sokak % SOKAK_COLS.length;
    const streetZ = oz + ROW_Z0 + r * ROW_PITCH;
    const north = p.bina < half;
    const bx = ox + SOKAK_COLS[c][0] + 6 + (p.bina % half) * BINA_STEP;
    const bz = streetZ + (north ? -8.5 : 8.5);
    const door = [bx, streetZ + (north ? -3.6 : 3.6)];
    const halfD = CELL_D / 2;
    const entryZ = oz + (cell.cz === 0 ? -halfD : halfD);
    const path = [door, [bx, streetZ], [ox, streetZ], [ox, entryZ], [0, entryZ], [0, -halfD], [0, -MEYDAN_R], HUB];
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

export function isIndoorWork(kind) {
  return !OUTDOOR_KINDS.has(kind);
}

export function buildingSeed(b) {
  return fnv1a(`${b.kind}:${Math.round(b.x)}:${Math.round(b.z)}`);
}

export { roll };
