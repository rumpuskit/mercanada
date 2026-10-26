// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
// Ölçek gerçektir: 1 birim = 1 metre.
//
// Dünya hücrelere bölünür (CELL_W x CELL_D). Ortada çarşı (merkez), doğusunda tepe ve fener, batısında
// tarlalar ve plaj sabittir. Mahalleler kuzeye ve yanlara, merkeze olan uzaklık sırasıyla eklenir; her
// yeni mahalle adanın kıyısını genişletir. Koordinatlar: x doğu, z güney, y yukarı.
import { addressParts, cap, cat, mahalleName, sokakName } from "../sim.js";
import { fbm, hash2 } from "./noise.js";
import { buildNetwork, H as LAYER, stations } from "./roads.js";

export const CELL_W = 560; // mahalle hücresi: 4 sokak sütunu + iki yanda 27 m'lik mahalle yerleri şeridi
export const CELL_D = 270;
export const FLAT_Y = 1.2;
export const FLOOR_H = 3.2;

const HUB = [0, 0];
const MEYDAN_R = 30;

// Yol kesitleri (toplam genişlik = taşıt yolu + iki kaldırım).
export const ROADS = {
  cadde: { width: 14, carriage: 8, surface: "asfalt" },
  sokak: { width: 13, carriage: 8, surface: "parke" }, // iki dar şerit + iki yanda kenar parkı
  koy: { width: 6.5, carriage: 6.5, surface: "asfalt" },
  yaya: { width: 14, carriage: 0, surface: "tas" },
  sahil: { width: 7, carriage: 0, surface: "tas" },
  patika: { width: 2.6, carriage: 0, surface: "toprak" },
  giris: { width: 6, carriage: 6, surface: "asfalt" }, // otopark, hastane ve garaj girişi
};

// Mahalle içi: orta caddenin iki yanında 4 sütun x 5 sıra sokak, her sokakta karşılıklı 5+5 apartman.
const ROW_Z0 = -100;
const ROW_PITCH = 50;
const SOKAK_COLS = [[-245, -130], [-125, -10], [10, 125], [130, 245]];
const LOT = 23; // parsel genişliği
const BINA_D = 12;

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
  ["kutuphane", 0], ["kafe", 2], ["plaza", 0], ["firin", 1], ["otel", 0], ["kafe", 3], ["market", 1],
  ["plaza", 1], ["atolye", 0], ["kafe", 4], ["market", 2], ["firin", 2], ["otel", 1], ["atolye", 1],
  ["kafe", 5], ["plaza", 2], ["market", 3], ["atolye", 2], ["atolye", 3],
];

// Konut cephe renkleri: Ege ve Marmara ada evleri.
const HOUSE_WALLS = ["#f4efe6", "#f3e3c8", "#e9d3c0", "#dfe7e4", "#f1d7cf", "#e8e0cf", "#f6f1e9", "#d9e2ea", "#efdcb8", "#e6d2d8"];
const HOUSE_ROOFS = ["#b5563f", "#a85a44", "#c06a4c", "#8c4b3a", "#9e5a48"];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener"]);

// Yol yüksekliği için yumuşatma çekirdeği (12 m çapında, ağırlıklı).
const KERNEL = (() => {
  const k = [[0, 0, 4]];
  for (const r of [3, 6]) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r; k.push([Math.cos(a) * r, Math.sin(a) * r, r === 3 ? 2 : 1]); }
  const sum = k.reduce((t, [, , w]) => t + w, 0);
  return k.map(([x, z, w]) => [x, z, w / sum]);
})();

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

/** Yolları 40 m'lik ızgarada tutar: bir noktanın hangi yolun üstünde olduğunu hızlıca bulur. */
export class RoadIndex {
  constructor(roads) {
    this.cells = new Map();
    roads.forEach((road) => {
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
        const pad = road.width / 2 + 1;
        for (let gx = Math.floor((Math.min(ax, bx) - pad) / 40); gx <= Math.floor((Math.max(ax, bx) + pad) / 40); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - pad) / 40); gz <= Math.floor((Math.max(az, bz) + pad) / 40); gz++) {
            const key = gx * 100003 + gz;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push({ road, ax, az, bx, bz });
          }
        }
      }
    });
  }

  /** Noktanın üstünde olduğu yol (en geniş olanı) ve merkez çizgisine uzaklığı; yoksa null. */
  at(x, z, margin = 0) {
    const list = this.cells.get(Math.floor(x / 40) * 100003 + Math.floor(z / 40));
    let best = null;
    for (const s of list ?? []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
      if (d < s.road.width / 2 - margin && (!best || s.road.width > best.road.width)) best = { road: s.road, dist: d };
    }
    return best;
  }
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
    this.plazas = [];      // {x, z, r} veya {x0, z0, x1, z1, kind}
    this.features = [];    // çeşme, iskele, vapur, fener, bank, ...
    this.labels = [];      // {text, x, z, h}
    this.workplaces = {};  // kind -> [{name, door, path, anchor, spread, outdoor}]
    this.places = {};      // place -> {anchors, spread, path}
    this.blocked = new Set(); // ağaç dikilmeyecek 4x4'lük kareler
    this.seats = [];       // oturulabilecek yerler {x, z, heading, top, place}
    this.piers = [];       // iskeleler {x0, x1, z0, z1, top}
    this.lamps = [];       // yollar dışındaki sokak lambaları {x, z, dir}
    this.buildingBySlot0 = new Map();
    this.parks = [];       // küçük mahalle parkları (ağaç dikilebilir)

    this._roadHCache = new Map();
    this._groundCache = new Map();
    this.cols = new Map(); // x -> [[z0, z1]...]
    this.rows = new Map(); // z -> [[x0, x1]...]: hücre sınırlarındaki doğu-batı caddeleri, birleştirilerek çizilir

    this._layoutCenter();
    this._layoutCoast();
    this._layoutNature();
    for (const cell of this.cells) if (cell.type === "mahalle") this._layoutMahalle(cell);
    this._emitRows();
    this.network = buildNetwork(this.roads);
    this.roadIndex = new RoadIndex(this.roads);
    this._gradeRoads();
    for (const seat of this.seats) seat.top = this.groundY(seat.x, seat.z) + seat.h;
    this.obstacles = new Set();
    this._markObstacles();
    if (import.meta.env?.DEV || globalThis.location?.search.includes("denetle")) this._validate();
  }

  get flatY() {
    return FLAT_Y;
  }

  // --- tesviye: eğimli arazide yollar yumuşak bir eğimi izler, altlarındaki arazi yola göre kazılır/doldurulur ---

  /** Yol yüksekliği: arazinin 12 m'lik pencerede yumuşatılmış hali; düz kasabada FLAT_Y. */
  roadH(x, z) {
    const key = Math.round(x * 2) * 100003 + Math.round(z * 2);
    let h = this._roadHCache.get(key);
    if (h === undefined) {
      h = 0;
      for (const [dx, dz, w] of KERNEL) h += w * Math.max(FLAT_Y, this.rawHeight(x + dx, z + dz));
      this._roadHCache.set(key, h);
    }
    return h;
  }

  surfaceY(x, z) {
    return this.roadH(x, z);
  }

  _gradeRoads() {
    this.grade = new Map();
    for (const e of this.network.edges) {
      const hw = e.road.width / 2;
      for (const st of stations(e.pts, 0, 0, 2)) {
        const h = this.roadH(st.p[0], st.p[1]);
        const reach = hw + 4;
        for (let o = -reach; o <= reach; o += 1) {
          const x = st.p[0] + st.n[0] * o, z = st.p[1] + st.n[1] * o;
          const key = Math.floor(x / 2) * 100003 + Math.floor(z / 2);
          const d = Math.abs(o);
          const cur = this.grade.get(key);
          if (!cur || d < cur.d) this.grade.set(key, { h, d, hw });
        }
      }
    }
  }

  // --- engeller: binalar, ağaç gövdeleri, çeşme, bank, masa, lamba... (0,5 m'lik ızgara) ---

  _obKey(x, z) {
    return Math.floor(x * 2) * 100003 + Math.floor(z * 2);
  }

  addObstacleCircle(x, z, r) {
    for (let gx = Math.floor((x - r) * 2); gx <= Math.floor((x + r) * 2); gx++) {
      for (let gz = Math.floor((z - r) * 2); gz <= Math.floor((z + r) * 2); gz++) {
        const cx = gx / 2 + 0.25, cz = gz / 2 + 0.25;
        if (Math.hypot(cx - x, cz - z) <= r + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  addObstacleRect(x, z, w, d, rot = 0) {
    const c = Math.cos(rot), sn = Math.sin(rot), ext = (Math.abs(w * c) + Math.abs(d * sn) + Math.abs(w * sn) + Math.abs(d * c)) / 2 + 0.5;
    for (let gx = Math.floor((x - ext) * 2); gx <= Math.floor((x + ext) * 2); gx++) {
      for (let gz = Math.floor((z - ext) * 2); gz <= Math.floor((z + ext) * 2); gz++) {
        const dx = gx / 2 + 0.25 - x, dz = gz / 2 + 0.25 - z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) <= w / 2 + 0.25 && Math.abs(lz) <= d / 2 + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  /** Bir insan (x, z)'de durabilir mi? Engelsiz, karada ya da iskelede. */
  isWalkable(x, z) {
    if (this.obstacles.has(this._obKey(x, z))) return false;
    if (this.piers.some((p) => x > p.x0 + 0.3 && x < p.x1 - 0.3 && z > p.z0 && z < p.z1)) return true;
    return this.height(x, z) > 0.25;
  }

  /** Nokta bir taşıt yolunun (şeritler ve kenar parkı) üstünde mi? Yaya geçitleri de dahil. */
  inCarriage(x, z) {
    const C = 20;
    if (!this._carGrid) {
      this._carGrid = new Map();
      for (const r of this.roads) {
        if (!(r.carriage > 0)) continue;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1], b = r.points[i], h = r.carriage / 2;
          const seg = [a, b, h];
          for (let gx = Math.floor((Math.min(a[0], b[0]) - h) / C); gx <= Math.floor((Math.max(a[0], b[0]) + h) / C); gx++) {
            for (let gz = Math.floor((Math.min(a[1], b[1]) - h) / C); gz <= Math.floor((Math.max(a[1], b[1]) + h) / C); gz++) {
              const k = gx * 100003 + gz;
              if (!this._carGrid.has(k)) this._carGrid.set(k, []);
              this._carGrid.get(k).push(seg);
            }
          }
        }
      }
    }
    for (const [a, b, h] of this._carGrid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
      const q = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      if (Math.hypot(a[0] + ex * q - x, a[1] + ez * q - z) < h) return true;
    }
    return false;
  }

  /** (x, z)'ye en yakın yürünebilir nokta (spiral arama). */
  nearestWalkable(x, z, max = 6) {
    if (this.isWalkable(x, z)) return [x, z];
    for (let r = 0.5; r <= max; r += 0.5) {
      const n = Math.max(8, Math.round(r * 8));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }

  _markObstacles() {
    for (const b of this.buildings) this.addObstacleRect(b.x, b.z, b.w + 0.3, b.d + 0.3, b.rot);
    for (const f of this.features) {
      switch (f.type) {
        case "cesme":
          this.addObstacleCircle(f.x, f.z, 8.3);
          for (const [bx, bz] of this.flowerBeds ?? []) this.addObstacleCircle(bx, bz, 1.8);
          break;
        case "gol": this.addObstacleCircle(f.x, f.z, f.r + 0.9); break;
        case "havuz": this.addObstacleRect(f.x, f.z, f.w + 1, f.d + 1); break;
        case "tezgah": this.addObstacleRect(f.x, f.z, 3.4, 2.2); break;
        case "bank": this.addObstacleRect(f.x, f.z, 1.9, 0.6, f.rot); break;
        case "masa1": this.addObstacleCircle(f.x, f.z, 0.45); break;
        case "sandalye": this.addObstacleCircle(f.x, f.z, 0.25); break;
        case "semsiye": this.addObstacleCircle(f.x, f.z, 0.2); break;
        case "sezlong": this.addObstacleRect(f.x, f.z, 0.8, 2, f.rot); break;
        case "cankurtaran": this.addObstacleRect(f.x, f.z, 2.2, 2.2); break;
        case "fener": this.addObstacleCircle(f.x, f.z, 4.6); break;
        case "minare": this.addObstacleCircle(f.x, f.z, 1.8); break;
        case "sadirvan": this.addObstacleCircle(f.x, f.z, 2.9); break;
        case "oyun": for (const o of playgroundItems(f)) this.addObstacleRect(o.x, o.z, o.w, o.d, o.rot); break;
        case "pota": this.addObstacleCircle(f.x, f.z, 0.5); break;
        case "vinc": this.addObstacleRect(f.x, f.z, 1.8, 1.8); break;
        case "okul_bahce": {
          // Bahçe duvarı (güneyde 4 m'lik kapı açıklığı); bayrak direği.
          const { x0, x1, z0, z1, gateX } = f;
          this.addObstacleRect(x0, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect(x1, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect((x0 + gateX - 2) / 2, z1, gateX - 2 - x0, 0.4);
          this.addObstacleRect((gateX + 2 + x1) / 2, z1, x1 - gateX - 2, 0.4);
          this.addObstacleCircle(x0 + 2, z0 + 1.5, 0.3);
          break;
        }
        case "hastane_on":
          for (const dz of [-5.5, 5.5]) this.addObstacleCircle(f.x + 6.5, f.z + dz, 0.35);
          for (const [dx, dz] of [[2, -11], [2, 11], [16, -12.5], [16, 12.5]]) this.addObstacleCircle(f.x + dx, f.z + dz, 0.8);
          break;
      }
    }
  }

  /** Kuzey-güney yönündeki sınır caddeleri (aynı hatta olanlar birleştirilir). */
  addCol(x, z0, z1) {
    if (!this.cols.has(x)) this.cols.set(x, []);
    this.cols.get(x).push([Math.min(z0, z1), Math.max(z0, z1)]);
  }

  /** Aynı hat üzerindeki cadde parçalarını birleştirir (üst üste binen yollar olmasın). */
  addRow(z, x0, x1) {
    if (!this.rows.has(z)) this.rows.set(z, []);
    this.rows.get(z).push([Math.min(x0, x1), Math.max(x0, x1)]);
  }

  _emitRows() {
    for (const [x, list] of this.cols) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[x, a], [x, b]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[x, a], [x, b]], "cadde");
    }
    for (const [z, list] of this.rows) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[a, z], [b, z]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[a, z], [b, z]], "cadde");
    }
  }

  /** Geliştirme kontrolü: bir bina bir yolun ya da yaya alanının üstüne biniyor mu? */
  _validate() {
    for (const b of this.buildings) {
      const c = Math.cos(b.rot), sn = Math.sin(b.rot);
      for (const [fx, fz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0], [0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]]) {
        const lx = fx * b.w, lz = fz * b.d;
        const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c;
        const hit = this.roadIndex.at(x, z, 0.3);
        if (hit) {
          console.warn(`Bina yolda: ${b.kind} (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) -> ${hit.road.type}`);
          break;
        }
      }
    }
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

  /** Arazi: yolların altı ve yanı tesviye edilmiş. */
  height(x, z) {
    const raw = this.rawHeight(x, z);
    const g = this.grade?.get(Math.floor(x / 2) * 100003 + Math.floor(z / 2));
    if (!g) return raw;
    if (g.d <= g.hw) return g.h - 0.12; // yolun altı: yüzeyin hemen altında
    const t = Math.min(1, (g.d - g.hw) / 4);
    return g.h + (raw - g.h) * t * t * (3 - 2 * t);
  }

  /** Doğal arazi (tesviyesiz). */
  rawHeight(x, z) {
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

  /** Yürünen yüzeyin yüksekliği: iskele, meydan, yol katmanı (asfalt, kaldırım, yaya yolu) ya da arazi. */
  groundY(x, z) {
    const key = Math.round(x * 4) * 400009 + Math.round(z * 4);
    let y = this._groundCache.get(key);
    if (y !== undefined) return y;
    y = this._groundY(x, z);
    if (this.roadIndex) this._groundCache.set(key, y);
    return y;
  }

  _groundY(x, z) {
    for (const p of this.piers) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.top;
    for (const p of this.plazas) if (p.r && Math.hypot(x - p.x, z - p.z) < p.r) return FLAT_Y + 0.2;
    const hit = this.roadIndex?.at(x, z);
    if (hit) {
      const r = hit.road;
      const base = this.roadH(x, z);
      if (r.carriage > 0) return base + (hit.dist < r.carriage / 2 ? LAYER.carriage : LAYER.walk);
      return base + (r.type === "patika" ? LAYER.trail : LAYER.ped);
    }
    return this.height(x, z);
  }

  addBench(x, z, rot, place) {
    this.features.push({ type: "bank", x, z, rot });
    for (const o of [-0.45, 0.45]) {
      this.seats.push({ x: x + Math.cos(rot) * o, z: z - Math.sin(rot) * o, heading: rot, h: 0.49, place });
    }
  }

  addTables(x, z, n, axis, toward, place) {
    // Kaldırımdaki masalar: `toward` yönüne (yola) doğru 1,6 m açıkta, yan yana.
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6;
      const [tx, tz] = axis === "x" ? [x + along, z + toward * 1.6] : [x + toward * 1.6, z + along];
      this.features.push({ type: "masa1", x: tx, z: tz });
      for (const side of [-1, 1]) {
        const cx = axis === "x" ? tx + side * 0.7 : tx, cz = axis === "x" ? tz : tz + side * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, h: 0.475, place, table: [tx, tz] });
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
      this.flowerBeds = (this.flowerBeds ?? []).concat([[Math.cos(i / 8 * Math.PI * 2) * 18.5, Math.sin(i / 8 * Math.PI * 2) * 18.5]]);
    }
    this.places.meydan = { anchors: [[0, 0]], spread: R - 6, path: [HUB] };
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.lamps.push({ x: Math.cos(a) * (R - 1), z: Math.sin(a) * (R - 1), dir: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }

    // Çarşı yayalaştırılmıştır: meydana yalnızca yaya caddeleri açılır, araçlar çevre yolundan dolaşır.
    const av = ROADS.yaya.width;
    this.addRoad([[0, -R], [0, -halfD]], "yaya");
    this.addRoad([[R, 0], [halfW, 0]], "yaya");
    this.addRoad([[-R, 0], [-halfW, 0]], "yaya");
    this.addRow(-halfD, -halfW, halfW);
    this._layoutRing();

    // Cepheler: caddelerin iki yanı. Her bina, meydana en yakın boş cepheye yerleşir.
    const fronts = [];
    for (const [axis, sign, end] of [["x", 1, halfW - 12], ["x", -1, halfW - 12], ["z", -1, halfD - 10], ["z", 1, this.avenueZ(0) - 12]]) {
      const street = { x: { 1: "Gündoğusu Caddesi", "-1": "Günbatısı Caddesi" }, z: { "-1": "Çınar Caddesi", 1: "Liman Caddesi" } }[axis][sign];
      for (const side of [-1, 1]) fronts.push({ axis, sign, side, cursor: R + 12, end, street, no: side < 0 ? 1 : 2 });
    }
    CENTER_ORDER.forEach(([kind, index]) => {
      const style = STYLES[kind];
      const front = fronts.filter((f) => f.cursor + style.w <= f.end).sort((a, b) => a.cursor - b.cursor)[0];
      const t = front.cursor + style.w / 2;
      front.cursor += style.w + 3;
      const off = av / 2 + 1.5 + style.d / 2;
      let x, z, rot, door, street;
      // Kapı noktası cephenin hemen içinde: insanlar kapıdan girip kaybolur, kapıdan çıkıp görünür.
      const inDoor = av / 2 + 1.5 + 0.35;
      if (front.axis === "x") {
        x = front.sign * t; z = front.side * off;
        rot = front.side < 0 ? 0 : Math.PI;
        door = [x, front.side * inDoor];
        street = [x, 0];
      } else {
        z = front.sign * t; x = front.side * off;
        rot = front.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        door = [front.side * inDoor, z];
        street = [0, z];
      }
      const b = this.addBuilding({
        kind, x, z, rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof,
        address: `${front.street} No ${(front.no += 2) - 2}, Çarşı`,
        wall: style.wall, roof: style.roofColor, style, workplace: true,
      });
      const path = [street, HUB];
      if (kind === "kahvehane") {
        this.places.kahvehane = { anchors: [door], spread: 3, path, building: b };
        const outside = front.axis === "x" ? [door[0], front.side * (av / 2 + 1)] : [front.side * (av / 2 + 1), door[1]];
        this.addTables(outside[0], outside[1], 3, front.axis, -front.side, "kahvehane");
      } else {
        this._addWorkplace(kind, index, { door, path, anchor: door, spread: 2, building: b });
        const outside = front.axis === "x" ? [door[0], front.side * (av / 2 + 1)] : [front.side * (av / 2 + 1), door[1]];
        if (kind === "kafe" || kind === "firin") this.addTables(outside[0], outside[1], kind === "kafe" ? 3 : 2, front.axis, -front.side, "kafe");
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
          address: `${front.street} No ${(front.no += 2) - 2}, Çarşı`,
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
    this.plazas.push({ x0: 90, z0: -120, x1: 200, z1: -48, kind: "saha" });
    // Futbol: tribünler (iki uzun kenar), kaleler, ışık direkleri; seyirci oturakları.
    this.pitch = { x0: 90, z0: -120, x1: 200, z1: -48, cx: 145, cz: -84 };
    for (const side of [-1, 1]) {
      const edge = side < 0 ? -120 : -48;
      this.features.push({ type: "tribun", x0: 100, x1: 190, z: edge, side });
      for (let r = 0; r < 4; r++) {
        for (let x = 101; x < 190; x += 0.62) {
          if ((x - 100) % 15 < 1.3) continue; // merdivenli koridorlar
          const z = edge + side * (1.2 + r * 0.8);
          this.seats.push({ x, z, heading: side < 0 ? 0 : Math.PI, h: 0.45 + r * 0.4, place: "tribun", absolute: true });
        }
      }
    }
    // Kaleler kale çizgisinde (saha dokusunda çizgiler kenardan 4,3 m içeride).
    for (const gx of [90 + 4.3, 200 - 4.3]) this.features.push({ type: "kale", x: gx, z: -84, dir: gx < 145 ? 1 : -1 });
    for (const [mx, mz] of [[87, -125], [203, -125], [87, -43], [203, -43]]) {
      this.features.push({ type: "projektor", x: mx, z: mz });
      this.lamps.push({ x: mx, z: mz, dir: Math.atan2(145 - mx, -84 - mz), r: 48, flood: true });
    }
    this.addRoad([[145, -CELL_D / 2], [145, -124.5]], "patika");
    this.places.saha = { anchors: [[145, -84]], spread: 20, path: [[145, -CELL_D / 2]] };
    this.block(88, -127, 202, -41, 0); // saha, tribünler ve arka duvarları (ağaç dikilmez)
    this.features.push({ type: "havuz", x: 140, z: 85, w: 25, d: 12 });
    this.block(140 - 12.5 - 10, 85 - 6 - 10, 140 + 12.5 + 10, 85 + 6 + 10, 0); // havuz, güvertesi ve ağaç taçları için pay
    // Otoparklar: çevre yolunun iç kenarında, çarşının iki yanında; girişleri çevre yolundan.
    this.parkingLots = [];
    for (const side of [-1, 1]) {
      const lot = side < 0 ? { x0: -halfW + 14, x1: -halfW + 56, z0: 34, z1: 112 } : { x0: halfW - 56, x1: halfW - 14, z0: 34, z1: 112 };
      // Giriş, çevre yoluna bakan kenarda; kısa bir bağlantı yoluyla çevre yoluna çıkar.
      const mid = (lot.z0 + lot.z1) / 2;
      const edgeX = side < 0 ? lot.x0 : lot.x1;
      lot.gateSide = side;
      lot.gateX = edgeX - side * 2;
      lot.gate = [lot.gateX, mid];
      this.addRoad([[edgeX, mid], [side * halfW, mid]], "giris");
      this.parkingLots.push(lot);
      this.plazas.push({ ...lot, kind: "otopark" });
      this.block(lot.x0, lot.z0, lot.x1, lot.z1, 1);
    }
    // Hastane: kuzeydoğu köşede, çevre yoluna bakar; önünde ambulans alanı ve giriş yolu.
    {
      const hx = halfW - 30, hz = -95;
      const b = this.addBuilding({ kind: "saglik", x: hx - 10, z: hz, rot: Math.PI / 2, w: 38, d: 20, floors: 4, roofType: "flat", wall: "#f4f6f8", roof: "#c9c4bb", workplace: true, style: STYLES.saglik, address: "Şifa Caddesi No 1, Çarşı" });
      this.plazas.push({ x0: hx, z0: hz - 14, x1: halfW - 8, z1: hz + 14, kind: "avlu" });
      this.addRoad([[hx + 4, hz], [halfW, hz]], "giris");
      const door = [hx + 0.35, hz];
      this._addWorkplace("saglik", 0, { door, path: [door, [halfW, hz], [halfW, 0], HUB], anchor: door, spread: 2, building: b });
      this.hospital = { building: b, bay: [hx + 5, hz], door };
      this.features.push({ type: "tabela_h", x: hx + 4, z: hz - 9 });
      this.features.push({ type: "hastane_on", x: hx, z: hz, roofY: 4 * FLOOR_H, bx: hx - 10 });
    }
    const market = { x0: -190, z0: 50, x1: -90, z1: 100 };
    this.plazas.push({ ...market, kind: "pazar" });
    this.block(market.x0, market.z0, market.x1, market.z1, 0);
    // Semt pazarı: iki koridor boyunca karşılıklı tezgâh sıraları (pazarcı arkada, müşteri koridorda);
    // her altı tezgâhta bir ara geçit.
    const aisles = [market.z0 + 13, market.z0 + 37];
    let n = 0;
    for (const az of aisles) {
      for (const dir of [1, -1]) {
        let k = 0;
        for (let x = market.x0 + 12; x <= market.x1 - 12; x += 3.6, k++) {
          if (k % 6 === 5) continue;
          this.features.push({ type: "tezgah", x, z: az - dir * 2.4, dir, c: n++ % 10 });
        }
      }
    }
    const aisleAnchors = aisles.flatMap((az) => [-30, 0, 30].map((dx) => [(market.x0 + market.x1) / 2 + dx, az]));
    this.places.pazar = { anchors: aisleAnchors, spread: 6, path: [[market.x1, 0], HUB], aisles: aisles.map((az) => [market.x0 + 10, market.x1 - 10, az]) };
    this.labels.push({ text: "Çarşı", x: 0, z: 0, h: 45 });
  }

  /** Sahil bulvarının z'si: kıyıdan 36 m içeride; geniş pencerede iki kez yumuşatılmış, eğimi sınırlı. */
  avenueZ(x) {
    if (!this._avProfile) {
      const xs = [];
      for (let x = -CELL_W; x <= CELL_W; x += 10) xs.push(x);
      let zs = xs.map((x) => this.coastPoint(x, 60, 0, 1)[1] - 36);
      for (let pass = 0; pass < 3; pass++) {
        zs = zs.map((_, i) => {
          let sum = 0, n = 0;
          for (let k = -5; k <= 5; k++) { const j = i + k; if (j >= 0 && j < zs.length) { sum += zs[j]; n++; } }
          return sum / n;
        });
      }
      for (let i = 1; i < zs.length; i++) zs[i] = Math.max(zs[i - 1] - 3, Math.min(zs[i - 1] + 3, zs[i]));
      // Kıyıya hiçbir yerde 26 m'den fazla yaklaşmasın.
      zs = zs.map((z, i) => Math.min(z, this.coastPoint(xs[i], 60, 0, 1)[1] - 26));
      this._avProfile = { x0: xs[0], zs };
    }
    const { x0, zs } = this._avProfile;
    const f = (x - x0) / 10, i = Math.max(0, Math.min(zs.length - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
    return zs[i] + (zs[i + 1] - zs[i]) * u;
  }

  /** Sahil bulvarı boyunca x0'dan x1'e giden noktalar. */
  avenuePath(x0, x1) {
    const pts = [];
    const step = x1 > x0 ? 10 : -10;
    for (let x = Math.round(x0 / 10) * 10; step > 0 ? x <= x1 : x >= x1; x += step) pts.push([x, this.avenueZ(x)]);
    return pts;
  }

  /** Çevre yolu: kuzeyde hücre sınırı, doğu ve batıda hücre kenarları, güneyde kıyıyı izleyen sahil bulvarı. */
  _layoutRing() {
    const halfW = CELL_W / 2, halfD = CELL_D / 2, r = 26;
    const zW = this.avenueZ(-halfW + r), zE = this.avenueZ(halfW - r);
    const pts = [[-halfW, -halfD], [-halfW, zW - r]];
    // Batı köşesi: batıdan güneye dönen çeyrek yay.
    for (let k = 1; k < 8; k++) { const a = Math.PI - (k / 8) * (Math.PI / 2); pts.push([-halfW + r + Math.cos(a) * r, zW - r + Math.sin(a) * r]); }
    pts.push([-halfW + r, zW]);
    for (let x = -halfW + r + 12; x <= halfW - r - 12; x += 12) pts.push([x, this.avenueZ(x)]);
    pts.push([halfW - r, zE]);
    // Doğu köşesi: güneyden doğuya, sonra yukarı.
    for (let k = 1; k < 8; k++) { const a = Math.PI / 2 - (k / 8) * (Math.PI / 2); pts.push([halfW - r + Math.cos(a) * r, zE - r + Math.sin(a) * r]); }
    pts.push([halfW, zE - r], [halfW, -halfD]);
    this.addRoad(pts, "cadde");
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    (this.workplaces[kind] ??= [])[index] = { name: names[index % names.length], outdoor: OUTDOOR_KINDS.has(kind), ...entry };
  }

  /**
   * Yük limanı: vapur iskelesinin doğusunda beton rıhtım. Kıyı şeridini ve denize uzanan önlüğü kaplayan
   * tek parça platform; yanaşmış konteyner gemisi, rıhtım vinci, istif sahası, ambar, tır ve forklift.
   * Çitle çevrili, kapısı bulvara açılır. Liman işçilerinin görev yerleri (posts) burada tanımlanır;
   * araçların ve vincin hareketi port.js'teki zaman işlevlerinden gelir.
   */
  _layoutPort(toHub) {
    const x0 = 40, x1 = 150, z0 = 176, z1 = 246, top = FLAT_Y + 0.3;
    const gateX = 95;
    const P = {
      x0, x1, z0, z1, top, gateX,
      ship: { x: 95, z: z1 + 7.1, len: 84, beam: 13, depth: 6.6 },
      crane: { x: 95, legX: [86, 104], landZ: 226, seaZ: 242 },
      transfer: [95, 234],
      stack: { x0: 108, x1: 147, z0: 201, z1: 223 },
      warehouse: { x: 61, z: 186, w: 38, d: 15 },
      truck: { x: 52, z: 207, heading: 0 },
      booth: [gateX + 6.5, z0 + 3.2],
      benches: [[86, 196.5, Math.PI], [90, 196.5, Math.PI]],
      masts: [[x0 + 3, z1 - 6], [x1 - 3, z1 - 6], [x1 - 3, z0 + 6], [x0 + 46, z0 + 26]],
    };
    // Gece rıhtımı aydınlatan direkler (ışık haritası için beyaz, geniş).
    for (const [mx, mz] of P.masts) this.lamps.push({ x: mx, z: mz, dir: Math.atan2(95 - mx, 215 - mz), r: 40, flood: true });
    this.port = P;
    this.piers.push({ x0, x1, z0, z1, top });
    this.block(x0, z0 - 2, x1, z1, 2);
    // Ambar: rıhtımın kara tarafında, kapıları denize (güneye) bakar.
    const wh = P.warehouse;
    this.addBuilding({ kind: "ambar", x: wh.x, z: wh.z, rot: 0, w: wh.w, d: wh.d, floors: 2, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", industrial: true, style: { door: "#d9822b", sign: "#1f3b5a" }, address: "Liman Ambarı, Yük Limanı" });
    // Kapı: bulvardan kısa bir giriş yolu; işçiler de buradan girer.
    this.addRoad([[gateX, this.avenueZ(gateX)], [gateX, z0 + 1]], "giris");
    const door = [gateX - 4.5, z0 + 1.5];
    // Görev yerleri: her işçi vardiyasında bunlardan birine düşer; kalanlar ambarın içinde çalışır.
    const posts = [];
    const post = (type, x, z, heading = 0, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    post("vinc", P.crane.x, P.crane.landZ);
    post("isaretci", 101.5, 236.5, Math.PI * 1.2);
    post("istif", 0, 0, 0, { k: 0 });
    post("forklift", 0, 0, 0, { k: 0 });
    for (let k = 0; k < 4; k++) post("bagci", 64 + k * 17, 0, 0, { k });
    for (const bx of [52, 136, 70]) post("palamar", bx, z1 - 2.2, 0);
    for (let k = 0; k < 3; k++) post("kontrol", 0, 0, 0, { k });
    post("bekci", P.booth[0], P.booth[1], Math.PI);
    for (let k = 0; k < 3; k++) post("ambar", 0, 0, 0, { k });
    post("sofor", P.truck.x + 2.2, P.truck.z + 7.5, -Math.PI / 2);
    for (const [bx, bz, h] of P.benches) for (const dx of [-0.5, 0.5]) post("mola", bx + dx, bz, h);
    P.posts = posts;
    // Görev yeri olmayanlar ambarın personel kapısından içeri girer.
    const innerDoor = [wh.x + wh.w / 2 - 1.6, wh.z + wh.d / 2 + 0.6];
    this._addWorkplace("liman", 0, { door, innerDoor, path: [door, [gateX, this.avenueZ(gateX)], ...toHub(gateX)], anchor: [95, 215], spread: 20 });
    this.labels.push({ text: "Yük Limanı", x: 98, z: 215, h: 24 });
  }

  // --- güney kıyısı: liman, iskele, tersane, balıkçı koyu, sahil yolu ---

  _layoutCoast() {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);

    // Sahil yolu: bulvarla deniz arasında, kıyıyı izleyen taş gezinti yolu.
    const promenade = [];
    // Doğuda yük limanının çitine kadar (x = 30).
    for (let x = -170; x <= 30; x += 10) promenade.push([x, coast(x)[1] - 8]);
    this.addRoad(promenade, "sahil");
    const promAt = (x) => promenade[Math.max(0, Math.min(promenade.length - 1, Math.round((x + 170) / 10)))];
    const avZ0 = this.avenueZ(0);
    const toHub = (x) => [...this.avenuePath(x, 0), [0, avZ0], HUB];

    // Liman: meydandan inen yaya caddesi bulvarı geçip 80 m'lik iskeleye ulaşır; vapur yanaşmış.
    const [, lz] = coast(0);
    this.addRoad([[0, MEYDAN_R], [0, avZ0]], "yaya");
    this.addRoad([[0, avZ0], [0, lz - 3]], "yaya");
    this.features.push({ type: "iskele", x: 0, z: lz - 4, len: 80, w: 10 });
    this.piers.push({ x0: -5, x1: 5, z0: lz - 4, z1: lz + 76, top: 1.53 });
    this.features.push({ type: "vapur", x: 13, z: lz + 40 });
    this.addBuilding({ kind: "liman", x: -24, z: lz - 21, rot: 0, w: 16, d: 9, floors: 2, roofType: "hip", wall: "#f6f1e9", roof: "#8c4b3a", address: "Vapur İskelesi, Liman" });
    // Anakarada çalışan ve okuyanlar: vapur iskelesinin ucunda vapura biner (gün boyu adada görünmez).
    const ferryDoor = [3.5, lz + 36];
    this._addWorkplace("anakara", 0, { door: ferryDoor, path: [ferryDoor, [0, lz - 6], [0, avZ0], HUB], anchor: ferryDoor, spread: 2, queue: { x0: -4, x1: 4, z: lz + 34.5 } });
    // Evden çalışanlar ve emekliler: iş yerleri evleridir (adreste mahalle görünür).
    this._addWorkplace("ev", 0, { door: null, path: [HUB], anchor: HUB, spread: 0, home: true });
    this.labels.push({ text: "Vapur İskelesi", x: 0, z: lz + 20, h: 22 });
    this._layoutPort(toHub);

    // Balık tutma iskelesi.
    const [ix, iz] = coast(-90);
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 36, w: 3 });
    this.piers.push({ x0: ix - 1.5, x1: ix + 1.5, z0: iz - 3, z1: iz + 33, top: 1.53 });
    const pi = promAt(ix);
    const promTo0 = (from) => promenade.filter(([x]) => (from < 0 ? x >= from && x <= 0 : x <= from && x >= 0)).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0])).reverse();
    const fishing = [];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      fishing.push({ x: ix + side * 1.05, z: iz + 12 + k * 3.4, heading: side * Math.PI / 2 });
    }
    this.places.iskele = { anchors: fishing.map((f) => [f.x, f.z]), spots: fishing, spread: 0, path: [[ix, iz - 3], pi, ...promTo0(ix), [0, avZ0], HUB] };

    // Tersane: gezinti yolunun bittiği doğu kıyısında, deniz tarafında.
    const [tx, tz] = coast(198);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 13, rot: 0, w: 30, d: 18, floors: 3, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", workplace: true, industrial: true, style: { door: "#2f5d8a", sign: "#2f5d8a" }, address: "Tersane Yolu No 1, Doğu Kıyısı" });
    // Kızak: atölyenin önünden denize inen beton rampa; düz kısmında beşik üstünde yapımdaki tekne,
    // çevresinde iki katlı iskele, üstünde portal vinç. Yanında suda bağlı bitmiş bir tekne.
    const top = FLAT_Y + 0.25;
    const S = {
      x: tx, x0: tx - 6, x1: tx + 6, z0: tz - 3.5, zFlat: tz + 16, z1: tz + 40, top,
      boat: { x: tx, z: tz + 6.5, len: 16 },
      timber: [tx - 11, tz - 1],
    };
    this.tersane = S;
    this.piers.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.zFlat, top });
    this.block(S.x0 - 6, S.z0, S.x1 + 6, S.z1, 1);
    this.features.push({ type: "tekne", x: tx + 15, z: tz + 22, rot: 0.1, len: 12 });
    const posts = [];
    const post = (type, x, z, heading, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    const half = S.boat.len / 2;
    for (const side of [-1, 1]) {
      post("iskele2", S.x + side * 3.6, S.boat.z - 3.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele2", S.x + side * 3.6, S.boat.z + 3, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele1", S.x + side * 3.6, S.boat.z, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 1 });
      post("boya", S.x + side * 2.2, S.boat.z + side * 4.5, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    post("kaynak", S.x + 0.9, S.boat.z - half + 2.5, -Math.PI / 2);
    post("kaynak", S.x - 0.9, S.boat.z + half - 3, Math.PI / 2);
    post("tasima", 0, 0, 0, { k: 0 });
    post("tasima", 0, 0, 0, { k: 1 });
    post("vinc", S.x1 + 0.8, S.boat.z - 6, -Math.PI / 2);
    post("kontrol", S.x - 2.5, S.boat.z + half + 1.8, Math.PI);
    S.posts = posts;
    const tDoor = [tx, tz - 23];
    this._addWorkplace("tersane", 0, { door: tDoor, innerDoor: [tx + 15 - 1.6, tz - 13 + 9 + 0.6], path: [tDoor, [tx, this.avenueZ(tx)], ...toHub(tx)], anchor: [tx, S.boat.z], spread: 5 });

    // Balıkçı koyu: gezinti yolunun batısında kulübeler ve tekneler.
    const [bx, bz] = coast(-218);
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 14 + i * 12, z: bz - 9, rot: 0, w: 8, d: 6, floors: 1, roofType: "gable", wall: ["#e9edf0", "#dbe7ee", "#f3e3c8"][i], roof: "#7a8a9a", address: `Balıkçı Koyu No ${i + 1}` });
    }
    // Ahşap balıkçı iskelesi; tekneler iki yanına palamarlı, sandal şamandırada. Kumsalda ağ serenleri,
    // ters çevrilmiş sandal, balık kasaları, çay masası. Balıkçıların görev yerleri (fazlası denizde).
    const jx = bx + 2, jz = bz - 2, jlen = 24;
    this.features.push({ type: "iskele", x: jx, z: jz, len: jlen, w: 2.6 });
    this.piers.push({ x0: jx - 1.3, x1: jx + 1.3, z0: jz, z1: jz + jlen, top: 1.53 });
    this.features.push({ type: "tekne", x: jx + 3.0, z: jz + 10, rot: 0, len: 8 });
    this.features.push({ type: "tekne", x: jx - 3.0, z: jz + 17, rot: 0, len: 8 });
    this.features.push({ type: "tekne", x: bx - 12, z: bz + 10, rot: 0.5, len: 5.5 });
    const K = {
      jetty: { x: jx, z0: jz, z1: jz + jlen },
      racks: [[bx - 14, bz - 0.5], [bx + 13, bz - 0.5]],
      upturned: [bx - 25, bz - 1.5, 0.3],
      crates: [jx, jz - 1.8],
      table: [bx - 3.5, bz - 3.4],
      buoys: [[bx - 12, bz + 13], [bx + 9, bz + 20], [bx - 2, bz + 26]],
    };
    const kposts = [];
    const kpost = (type, x, z, heading, extra = {}) => kposts.push({ post: type, x, z, heading, ...extra });
    for (const [rx, rz] of K.racks) for (const dx of [-1.4, 1.4]) kpost("ag", rx + dx, rz + 1.3, Math.PI);
    kpost("kasa", 0, 0, 0, { k: 0 });
    kpost("kasa", 0, 0, 0, { k: 1 });
    kpost("iskele", jx + 0.6, jz + 9, Math.PI / 2);
    kpost("iskele", jx - 0.6, jz + 16.5, -Math.PI / 2);
    kpost("boya", K.upturned[0] + 2.2, K.upturned[1], -Math.PI / 2);
    kpost("cay", K.table[0] - 0.75, K.table[1], Math.PI / 2);
    kpost("cay", K.table[0] + 0.75, K.table[1], -Math.PI / 2);
    K.posts = kposts;
    this.koy = K;
    const bDoor = [bx, bz - 15];
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: bDoor, innerDoor: [jx, jz + jlen - 1], path: [bDoor, [bx, this.avenueZ(bx)], ...toHub(bx)], anchor: [bx, bz + 1], spread: 7,
    }));

    const mid = promAt(0);
    this.places.sahil_yolu = { anchors: promenade.filter((_, i) => i % 4 === 0), spread: 1.5, path: [mid, [0, avZ0], HUB] };
    this.promenade = promenade;
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
    // Seyir noktaları: fenerin çevresinde, karada, denize (tepeden uzağa) bakan yerler.
    const views = [];
    for (const rr of [8.5, 11.5, 14.5, 17.5]) {
      const n = Math.round((2 * Math.PI * rr) / 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr;
        const vx = fx + Math.cos(a) * rr, vz = fz + Math.sin(a) * rr;
        if (this.rawHeight(vx, vz) < 0.8) continue;
        // Denize bakan yarı: tepeden uzağa.
        if ((vx - fx) * (fx - hx) + (vz - fz) * (fz - hz) < -2) continue;
        views.push({ x: vx, z: vz, heading: Math.atan2(vx - hx, vz - hz) });
      }
    }
    this.places.fener = { anchors: views.map((v) => [v.x, v.z]), spots: views, spread: 0, path: fenerPath };
    this.fener = { x: fx, z: fz, door: [fx - Math.cos(Math.atan2(fz - hz, fx - hx)) * 4.8, fz - Math.sin(Math.atan2(fz - hz, fx - hx)) * 4.8] };
    // Bekçi evi: fenerin kara tarafında, kapısı fenere bakar.
    {
      const a = Math.atan2(fz - hz, fx - hx);
      const ex = fx - Math.cos(a) * 14 + Math.sin(a) * 6, ez = fz - Math.sin(a) * 14 - Math.cos(a) * 6;
      this.addBuilding({ kind: "kulube", x: ex, z: ez, rot: Math.atan2(fx - ex, fz - ez), w: 8, d: 6, floors: 1, roofType: "gable", wall: "#f2efe8", roof: "#b8412f", address: "Fener Bekçisi Evi, Fener" });
    }
    this.labels.push({ text: "Fener", x: fx, z: fz, h: 34 });

    // Batı: köy yolu, iki çiftlik ve plaj.
    const kx = -CELL_W;
    // İtfaiye istasyonu ve belediye garajı (çöp kamyonu): köy yolunun kuzeyinde, çevre yolunun hemen batısında.
    {
      const fx = -halfW - 56, gx = -halfW - 26;
      const fs = this.addBuilding({ kind: "itfaiye", x: fx, z: -20, rot: 0, w: 24, d: 14, floors: 2, roofType: "flat", wall: "#e9e2d6", roof: "#c9c4bb", style: { garage: "#b8231f", tower: false }, address: "İtfaiye Yolu No 1" });
      this.plazas.push({ x0: fx - 12, z0: -13, x1: fx + 12, z1: -3.5, kind: "avlu" });
      this.addRoad([[fx, -9.5], [fx, 0]], "giris");
      this.fireStation = { building: fs, bay: [fx, -8] };
      const dp = this.addBuilding({ kind: "garaj", x: gx, z: -20, rot: 0, w: 18, d: 14, floors: 1, roofType: "gable", wall: "#d9dde2", roof: "#6f7f92", style: { garage: "#4f8a3e" }, address: "Garaj Sokağı No 2" });
      this.plazas.push({ x0: gx - 9, z0: -13, x1: gx + 9, z1: -3.5, kind: "avlu" });
      this.addRoad([[gx, -9.5], [gx, 0]], "giris");
      this.depot = { building: dp, bay: [gx, -8] };
    }
    this.addRoad([[-halfW, 0], [kx - 120, 0]], "koy");
    cat().isyerleri.tarla.forEach((name, i) => {
      const x0 = kx - 200 + i * 190, z0 = -125;
      for (let f = 0; f < 4; f++) {
        const fx0 = x0 + (f % 2) * 88, fz0 = z0 + Math.floor(f / 2) * 54;
        this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 82, z1: fz0 + 48, kind: "tarla", crop: (f + i) % 3 });
        this.block(fx0, fz0, fx0 + 82, fz0 + 48, 0);
      }
      const barn = this.addBuilding({ kind: "ahir", x: x0 + 85, z: -14, rot: 0, w: 18, d: 12, floors: 2, roofType: "gable", wall: "#b5563f", roof: "#6d6a66", workplace: true, industrial: true, style: { door: "#7a3a2a" }, address: `${name}, Köy Yolu` });
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

  /** Mahallenin karakteri (tohumdan): sokak kavisi, ön bahçe derinliği, cumba sıklığı, yan şeritteki yerler. */
  mahalleStyle(m) {
    this._styles ??= new Map();
    if (!this._styles.has(m)) {
      const h = (salt) => hash2(m, salt, 77);
      const curves = [0, 0, 2.5, 4, -3.5, 4.5];
      this._styles.set(m, {
        amp: curves[Math.floor(h(1) * curves.length)],
        period: 280 + Math.floor(h(2) * 3) * 90,
        phase: h(3) * Math.PI * 2,
        yard: 2.5 + h(4) * 1.5,
        cumba: 0.15 + h(5) * 0.5,
        // Cami hep mahallenin batı şeridinde: komşu mahallenin camisiyle sınır caddesinin iki yanında
        // karşı karşıya gelmesin.
        mosqueWest: true,
      });
    }
    return this._styles.get(m);
  }

  /**
   * Sokak sırası r'nin x'teki z'si (mahallenin kavis çizgisi) ve eğimi. Kavis mahalle sınırına doğru
   * sönümlenir: komşu mahallelerin aynı sıradaki sokakları sınır caddesinde aynı noktada buluşur
   * (birkaç metre arayla iki ayrı kavşak, çift ışık ve üst üste yüzey olmaz).
   */
  rowZ(cell, r, x) {
    const st = this.mahalleStyle(cell.mahalle);
    const [ox, oz] = this.cellCenter(cell);
    const k = (2 * Math.PI) / st.period;
    const u = Math.PI * ((x - ox) / CELL_W + 0.5);
    const env = Math.sin(Math.max(0, Math.min(Math.PI, u))), denv = (Math.PI / CELL_W) * Math.cos(u);
    const s = Math.sin(k * (x - ox) + st.phase), ds = k * Math.cos(k * (x - ox) + st.phase);
    return {
      z: oz + ROW_Z0 + r * ROW_PITCH + st.amp * s * env,
      slope: st.amp * (ds * env + s * denv),
    };
  }

  _layoutMahalle(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfD = CELL_D / 2, halfW = CELL_W / 2;
    const entryZ = this._entryZ(cell);
    const style = this.mahalleStyle(cell.mahalle);
    this.addRoad([[ox, oz - halfD], [ox, oz + halfD]], "cadde");
    // Mahalle girişinden merkeze: hücre sınırındaki doğu-batı caddesi, oradan x = 0 hattındaki
    // mahalle caddeleriyle çevre yoluna (bu hücreler her zaman daha önce kurulur).
    if (ox !== 0) this.addRow(entryZ, ox, 0);
    // Çevre caddeleri: mahallenin dört kenarı; sokaklar bunlara bağlanır, komşu mahalleler paylaşır.
    this.addRow(oz - halfD, ox - halfW, ox + halfW);
    this.addRow(oz + halfD, ox - halfW, ox + halfW);
    this.addCol(ox - halfW, oz - halfD, oz + halfD);
    this.addCol(ox + halfW, oz - halfD, oz + halfD);

    const rows = cap("sokak_per_mahalle") / SOKAK_COLS.length;
    for (let r = 0; r < rows; r++) {
      const pts = [];
      for (let x = ox - halfW; x <= ox + halfW + 0.1; x += 20) pts.push([x, this.rowZ(cell, r, x).z]);
      this.addRoad(pts, "sokak");
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
          kind: "konut", x: home.bx, z: home.bz, rot: home.rot,
          w: perFloor * 4.6 + 2.4, d: BINA_D, floors, perFloor, yard: style.yard, pathSeed: key,
          roofType: hash2(key, 2, 5) < 0.75 ? "hip" : "flat",
          wall: HOUSE_WALLS[Math.floor(hash2(key, 3, 5) * HOUSE_WALLS.length)],
          roof: HOUSE_ROOFS[Math.floor(hash2(key, 4, 5) * HOUSE_ROOFS.length)],
          balconies: hash2(key, 6, 5) < 0.7,
          cumba: hash2(key, 7, 5) < style.cumba,
          slot0, daireler: perBina,
          address: `${sokakName(home.parts.mahalle, home.parts.sokak)} No ${home.parts.bina * 2 + 1}, ${mahalleName(home.parts.mahalle)}`,
        });
        this.buildingBySlot0.set(slot0, this.buildings[this.buildings.length - 1]);
      }
    }
    this._layoutAmenities(cell);
    this.labels.push({ text: mahalleName(cell.mahalle), x: ox, z: oz, h: 45 });
  }

  /**
   * Mahallenin iki yanındaki şeritlerde, sokak araları: cami (avlu ve şadırvanla), çay bahçesi,
   * çocuk parkı, basketbol sahası, küçük park. Akşam dışarı çıkan sakinlerin yarısı buraya gelir.
   */
  _layoutAmenities(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfW = CELL_W / 2;
    const m = cell.mahalle;
    const style = this.mahalleStyle(m);
    const place = "mahalle:" + m;
    const anchors = [];
    const stripX = (side) => ox + side * (halfW - 7 - 13.5);
    // Sokak araları: r ile r+1 arası (r = 0..3).
    const gap = (r, x) => {
      const a = this.rowZ(cell, r, x).z + ROADS.sokak.width / 2 + 1, b = this.rowZ(cell, r + 1, x).z - ROADS.sokak.width / 2 - 1;
      return { z: (a + b) / 2, h: b - a };
    };
    const plan = style.mosqueWest
      ? { "-1": ["cami", "park", "cay", "oyun"], "1": ["cay", "basket", "park", "oyun"] }
      : { "-1": ["oyun", "cay", "park", "basket"], "1": ["park", "cami", "cay", "oyun"] };
    // Mahalle okulu: doğu şeridinde, bahçeli (okul sayısı kadar mahallede).
    if (m < cat().isyerleri.okul.length) plan["1"][2] = "okul";
    for (const side of [-1, 1]) {
      const x = stripX(side);
      plan[String(side)].forEach((kind, r) => {
        const g = gap(r, x);
        const cz = g.z;
        this.block(x - 13, cz - g.h / 2, x + 13, cz + g.h / 2, 0);
        switch (kind) {
          case "cami": {
            // Cami: arka tarafa çekilir; önde son cemaat yeri ve avlu (şadırvan). Minare ön köşeye bitişik.
            const rot = side < 0 ? Math.PI / 2 : -Math.PI / 2, bxm = x + side * 3, bzm = cz + 2;
            const cw = 14, cd = 14;
            this.addBuilding({ kind: "cami", x: bxm, z: bzm, rot, w: cw, d: cd, floors: 2, roofType: "dome", wall: "#ece4d6", roof: "#7d8e9c", workplace: true, style: { dome: true }, address: `${mahalleName(m).replace(" Mahallesi", "")} Camii, ${mahalleName(m)}` });
            const toWorld = (lx, lz) => [bxm + lx * Math.cos(rot) + lz * Math.sin(rot), bzm - lx * Math.sin(rot) + lz * Math.cos(rot)];
            const [mx, mz] = toWorld(-cw / 2 - 1.15, cd / 2 - 1.2);
            this.features.push({ type: "minare", x: mx, z: mz });
            const [sx2, sz2] = toWorld(cw / 2 + 4.5, cd / 2 + 1.5); // avluda, son cemaat yerinin yanında
            this.features.push({ type: "sadirvan", x: sx2, z: sz2 });
            this.plazas.push({ x0: x - 12.5, z0: cz - g.h / 2 + 0.5, x1: x + 12.5, z1: cz + g.h / 2 - 0.5, kind: "avlu" });
            break;
          }
          case "okul": {
            // Bina şeridin kuzeyinde, cephesi güneydeki bahçeye bakar; bahçe duvarlı, kapısı güneydeki sokağa.
            const bz = cz - g.h / 2 + 6.5;
            const b = this.addBuilding({ kind: "okul", x, z: bz, rot: 0, w: 24, d: 11, floors: 3, roofType: "hip", wall: "#f2d9a6", roof: "#b5563f", workplace: true, style: STYLES.okul, address: `${cat().isyerleri.okul[m]}, ${mahalleName(m)}` });
            const yard = { x0: x - 12.5, x1: x + 12.5, z0: bz + 5.5 + 0.5, z1: cz + g.h / 2 - 0.5 };
            this.plazas.push({ ...yard, kind: "avlu" });
            this.features.push({ type: "okul_bahce", x, ...yard, gateX: x });
            const door = [x, bz + 5.5 - 0.35];
            const gate = [x, yard.z1 + 1];
            this._addWorkplace("okul", m, { door, path: [door, gate, HUB], anchor: door, spread: 2, building: b });
            (this.schools ??= []).push({ ...yard, x, building: b });
            break;
          }
          case "cay": {
            this.plazas.push({ x0: x - 12, z0: cz - g.h / 2 + 1, x1: x + 12, z1: cz + g.h / 2 - 1, kind: "avlu" });
            this.addBuilding({ kind: "bufe", x: x + side * 8, z: cz - g.h / 2 + 5, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f6e3d8", roof: "#c9c4bb", style: { shop: true, awning: "#3e8a86" }, address: `Çay Bahçesi Büfesi, ${mahalleName(m)}` });
            for (let t = 0; t < 6; t++) {
              const tx = x - 6 + (t % 2) * 9 - side * 2, tz = cz - 6 + Math.floor(t / 2) * 7;
              this.features.push({ type: "masa1", x: tx, z: tz });
              this.features.push({ type: "semsiye", x: tx, z: tz, c: (m + t) % 4, town: true });
              for (const dz of [-0.7, 0.7]) {
                const heading = Math.atan2(0, -dz);
                this.features.push({ type: "sandalye", x: tx, z: tz + dz, rot: heading });
                this.seats.push({ x: tx, z: tz + dz, heading, h: 0.475, place, table: [tx, tz] });
              }
            }
            anchors.push([x, cz]);
            break;
          }
          case "oyun": {
            const seedP = m * 7 + r * 3 + (side > 0 ? 1 : 0);
            this.plazas.push({ x0: x - 11, z0: cz - g.h / 2 + 2, x1: x + 11, z1: cz + g.h / 2 - 2, kind: "oyun", color: ["#4f8a57", "#b8523f", "#4f78a8", "#7a8f3f", "#3e8a86"][seedP % 5] });
            this.features.push({ type: "oyun", x, z: cz, seed: seedP, w: 20, d: g.h - 6 });
            for (const dz of [-1, 1]) this.addBench(x + side * -10, cz + dz * 6, side < 0 ? Math.PI / 2 : -Math.PI / 2, place);
            anchors.push([x + side * -8, cz]);
            break;
          }
          case "basket": {
            this.plazas.push({ x0: x - 8, z0: cz - 14, x1: x + 8, z1: cz + 14, kind: "basket" });
            this.features.push({ type: "pota", x, z: cz - 13 });
            this.features.push({ type: "pota", x, z: cz + 13, rot: Math.PI });
            break;
          }
          default: {
            // Küçük park: ağaçlar (blok kaldırılır) ve banklar.
            for (let gx = Math.floor((x - 13) / 4); gx <= Math.floor((x + 13) / 4); gx++) {
              for (let gz = Math.floor((cz - g.h / 2) / 4); gz <= Math.floor((cz + g.h / 2) / 4); gz++) this.blocked.delete(gx * 100003 + gz);
            }
            this.parks.push({ x0: x - 12, z0: cz - g.h / 2, x1: x + 12, z1: cz + g.h / 2 });
            this.addBench(x, cz, 0, place);
            anchors.push([x, cz + 3]);
          }
        }
      });
    }
    const pathPoint = [stripX(-1), this.rowZ(cell, 2, stripX(-1)).z];
    this.places[place] = { anchors, spread: 4, path: [pathPoint], mahalle: m };
  }

  /** Bir sakinin evi: bina konumu ve yönü, kapı ve meydana giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const cell = this.cells.find((c) => c.mahalle === p.mahalle) ?? (() => {
      const [cx, cz] = MAHALLE_CELLS[p.mahalle % MAHALLE_CELLS.length];
      return { cx, cz, mahalle: p.mahalle };
    })();
    const style = this.mahalleStyle(p.mahalle);
    const [ox, oz] = this.cellCenter(cell);
    const half = cap("bina_per_sokak") / 2;
    const r = Math.floor(p.sokak / SOKAK_COLS.length), c = p.sokak % SOKAK_COLS.length;
    const north = p.bina < half;
    const bx0 = ox + SOKAK_COLS[c][0] + LOT / 2 + (p.bina % half) * LOT;
    const { z: streetZ, slope } = this.rowZ(cell, r, bx0);
    // Sokağın kuzey normali (eğimli sokakta binalar sokağa dik durur).
    const n = Math.hypot(1, slope);
    const nx = slope / n, nz = -1 / n;
    const sgn = north ? 1 : -1;
    const facade = ROADS.sokak.width / 2 + style.yard;
    const bx = bx0 + sgn * nx * (facade + BINA_D / 2), bz = streetZ + sgn * nz * (facade + BINA_D / 2);
    const rot = north ? -Math.atan(slope) : Math.PI - Math.atan(slope);
    const door = [bx0 + sgn * nx * (facade + 0.35), streetZ + sgn * nz * (facade + 0.35)];
    const entryZ = this._entryZ(cell);
    // Sokak boyunca (kavisi izleyerek) mahalle caddesine, oradan meydana.
    const along = [];
    const step = bx0 < ox ? 20 : -20;
    for (let x = bx0; step > 0 ? x < ox : x > ox; x += step) along.push([x, this.rowZ(cell, r, x).z]);
    const path = [...along, [ox, this.rowZ(cell, r, ox).z], [ox, entryZ], [0, entryZ], [0, -CELL_D / 2], HUB];
    return { bx, bz, rot, door, path, north, parts: p, building: this.buildingBySlot0.get(slot - p.daire) };
  }

  workplaceOf(wp) {
    const list = this.workplaces[wp.kind];
    return list[wp.index] ?? list.find(Boolean);
  }

  placeOf(name) {
    return this.places[name] ?? this.places.meydan;
  }
}

/** Oyun parkındaki aletler: tohuma göre seçilir ve yerleştirilir (her park farklı). */
export function playgroundItems(f) {
  const h = (n) => ((Math.imul((f.seed + 1) * 2654435761 + n * 40503, 2246822519) >>> 0) % 10000) / 10000;
  const pool = ["kule", "salincak", "tahterevalli", "yayli", "kum", "kubbe", "atlikarinca", "tirmanma"];
  // Karıştır; alanın büyüklüğüne göre (iki sütun × 7 m'lik sıralar) en çok 8 alet yerleştir.
  const order = pool.map((k, i) => [h(i + 1), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const SIZES = { kule: [5, 4], salincak: [4.5, 2.6], tahterevalli: [3.6, 1.2], yayli: [3, 1.4], kum: [3.4, 3.4], kubbe: [3.6, 3.6], atlikarinca: [3.2, 3.2], tirmanma: [4.4, 1.6] };
  const depth = f.d ?? 12, width = f.w ?? 18;
  const rows = Math.max(2, Math.floor((depth - 2) / 7));
  const colX = width >= 16 ? [-width / 4 - 0.5, width / 4 + 0.5] : [-3, 3];
  const cells = [];
  for (let r = 0; r < rows; r++) for (const cx of colX) cells.push([cx, -((rows - 1) * 7) / 2 + r * 7]);
  const n = Math.min(order.length, cells.length);
  const flip = h(21) < 0.5 ? -1 : 1;
  return order.slice(0, n).map((kind, i) => {
    const [cx, cz] = cells[i];
    const [w, d] = SIZES[kind];
    const rot = Math.floor(h(30 + i) * 4) * (Math.PI / 2) + (h(40 + i) - 0.5) * 0.3;
    return { kind, x: f.x + cx * flip + (h(50 + i) - 0.5) * 1.2, z: f.z + cz + (h(60 + i) - 0.5) * 0.8, w, d, rot, c: Math.floor(h(70 + i) * 5) };
  });
}

/**
 * Apartman katının planı: ortada merdiven ve asansör çekirdeği (2,4 m), iki yanında daireler.
 * Katta ikiden fazla daire varsa arkada ortak koridor bulunur. Hem dış cephe hem iç mekân bunu kullanır.
 */
export function unitLayout(b) {
  const core = 2.4;
  const n = b.perFloor;
  const L = Math.ceil(n / 2);
  const u = (b.w - core) / n;
  const units = [];
  for (let c = 0; c < n; c++) {
    const x0 = c < L ? -b.w / 2 + c * u : core / 2 + (c - L) * u;
    units.push({ col: c, x0, x1: x0 + u, cx: x0 + u / 2, side: c < L ? -1 : 1, adjacent: c === L - 1 || c === L });
  }
  return { core: [-core / 2, core / 2], units, corridor: n > 2, corridorDepth: 1.5 };
}
