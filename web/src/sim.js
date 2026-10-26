// Mercanada simülasyonu: bir sakinin hayatı tohumdan (seed) ve günden hesaplanır; sunucuda kimsenin
// hayatı tutulmaz. server/mercanada_sim/sim.py ile bit bit aynı sonucu vermeli; kural değişirse ikisi
// birlikte değişir ve parite testi çalıştırılır (cd server && python3 -m unittest -v).
//
// Sakin nesnesi: {handle, seed, slot, arrived_day, overrides?}. overrides yorumdan gelen isteklerdir
// (ör. {meslek: "balikci", evcil: "Kedi"}).

let catalog = null;

/** Katalog dışarıdan verilir: tarayıcı JSON'u paketler, Node testi dosyadan okur. */
export function setCatalog(data) {
  catalog = data;
}

export function cat() {
  return catalog;
}

export function cap(key) {
  return catalog.kapasite[key];
}

// --- hash ---

export function mul32(a, b) {
  return Math.imul(a, b) >>> 0;
}

const encoder = new TextEncoder();
const fnvCache = new Map();

export function fnv1a(text) {
  let h = fnvCache.get(text);
  if (h !== undefined) return h;
  h = 0x811c9dc5;
  for (const byte of encoder.encode(text)) h = mul32((h ^ byte) >>> 0, 0x01000193);
  if (fnvCache.size < 4096) fnvCache.set(text, h);
  return h;
}

/** lowbias32 karıştırıcı (Chris Wellons). */
export function mix(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = mul32(x, 0x7feb352d);
  x = (x ^ (x >>> 15)) >>> 0;
  x = mul32(x, 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function combine(a, b) {
  return mix((a ^ mul32(b >>> 0, 0x9e3779b1)) >>> 0);
}

/** Bir sakinin belirli bir konudaki (tag) ve isteğe bağlı gündeki (n) zar atışı. */
export function roll(seed, tag, n = 0) {
  return combine(combine(seed, fnv1a(tag)), n);
}

export function normalizeHandle(handle) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function seedOf(handle) {
  return fnv1a(normalizeHandle(handle));
}

// --- saat: şehir Türkiye saatiyle yaşar (UTC+3, yaz saati yok) ---

export const TZ_OFFSET = 3 * 3600;

export function dayOf(unix) {
  return Math.floor((unix + TZ_OFFSET) / 86400);
}

export function minuteOf(unix) {
  const s = (unix + TZ_OFFSET) % 86400;
  return (s < 0 ? s + 86400 : s) / 60;
}

/** 0 = Pazartesi ... 6 = Pazar (1 Ocak 1970 Perşembe). */
export function weekday(day) {
  return (day + 3) % 7;
}

export function formatMinute(minute) {
  const m = Math.floor(minute);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// --- adres: sıra numarasından (slot) ada → mahalle → sokak → bina → daire ---

export function addressParts(slot) {
  const perBina = cap("daire_per_bina");
  const perSokak = perBina * cap("bina_per_sokak");
  const perMahalle = perSokak * cap("sokak_per_mahalle");
  const mahalle = Math.floor(slot / perMahalle);
  const inMahalle = slot % perMahalle;
  return {
    ada: Math.floor(mahalle / cap("mahalle_per_ada")),
    mahalle,
    sokak: Math.floor(inMahalle / perSokak),
    bina: Math.floor((inMahalle % perSokak) / perBina),
    daire: inMahalle % perBina,
  };
}

export function adaName(ada) {
  const names = catalog.adalar;
  const name = names[ada % names.length];
  return ada < names.length ? name : `${name} ${Math.floor(ada / names.length) + 1}`;
}

export function mahalleName(mahalle) {
  const names = catalog.mahalleler;
  let name = names[mahalle % names.length];
  if (mahalle >= names.length) name += ` ${Math.floor(mahalle / names.length) + 1}`;
  return name + " Mahallesi";
}

export function sokakName(mahalle, sokak) {
  const names = catalog.sokaklar;
  return names[(sokak + mahalle * 7) % names.length] + " Sokağı";
}

export function addressText(slot) {
  const p = addressParts(slot);
  return `${sokakName(p.mahalle, p.sokak)} No ${p.bina * 2 + 1}, Daire ${p.daire + 1}, ` +
    `${mahalleName(p.mahalle)}, ${adaName(p.ada)}`;
}

// --- sakin ---

export const PLACE_HOME = "ev";
export const PLACE_WORK = "is";
const OUTING_LATEST_HOBBY = 1200; // 20:00
const OUTING_LATEST_MEYDAN = 1290; // 21:30

function pickWeighted(items, r) {
  const total = items.reduce((sum, item) => sum + item.agirlik, 0);
  let x = r % total;
  for (let i = 0; i < items.length; i++) {
    x -= items[i].agirlik;
    if (x < 0) return i;
  }
  return items.length - 1;
}

function find(items, id) {
  return items.findIndex((item) => item.id === id);
}

function override(r, key) {
  return String(r.overrides?.[key] ?? "");
}

export function job(r) {
  const jobs = catalog.meslekler;
  let i = find(jobs, override(r, "meslek"));
  if (i < 0) i = pickWeighted(jobs, roll(r.seed, "meslek"));
  return jobs[i];
}

export function workplace(r) {
  const kind = job(r).yer;
  const names = catalog.isyerleri[kind];
  const index = roll(r.seed, "isyeri") % names.length;
  return { kind, index, name: names[index] };
}

export function tenure(r, day) {
  return Math.max(0, day - r.arrived_day);
}

/** Terfiler kıdemle gelir; herkes aynı gün terfi almasın diye 0-6 gün kaydırılır. */
export function rank(r, day) {
  const shift = roll(r.seed, "terfi") % 7;
  const t = tenure(r, day);
  return catalog.terfi_gunleri.filter((threshold) => t >= threshold + shift).length;
}

export function title(r, day) {
  const ladder = job(r).kademeler;
  return ladder[Math.min(rank(r, day), ladder.length - 1)];
}

export function hobby(r) {
  const hobbies = catalog.hobiler;
  let i = find(hobbies, override(r, "hobi"));
  if (i < 0) i = roll(r.seed, "hobi") % hobbies.length;
  return hobbies[i];
}

/** Evcil hayvan yoksa "" döner. Sahiplenme gelişten 5-29 gün sonra olur. */
export function pet(r, day) {
  const requested = override(r, "evcil");
  if (requested !== "") return requested;
  if (roll(r.seed, "evcil") % 100 >= catalog.evcil_orani) return "";
  if (tenure(r, day) < 5 + (roll(r.seed, "evcil_gun") % 25)) return "";
  const pets = catalog.evcil_hayvanlar;
  return pets[roll(r.seed, "evcil_tur") % pets.length];
}

/** Görünüş cinsiyetten bağımsız; her parça katalogdaki seçenek sayısı içinde bir indeks. */
export function look(r) {
  const result = {};
  for (const [key, n] of Object.entries(catalog.gorunus)) result[key] = roll(r.seed, "gorunus_" + key) % n;
  result.boy = 92 + (roll(r.seed, "boy") % 17);
  return result;
}

export function worksOn(r, day) {
  const wd = weekday(day);
  if (!job(r).hafta_sonu) return wd < 5;
  // Hafta sonu da açık iş yerlerinde çalışanların haftada iki izin günü var.
  const off = roll(r.seed, "izin") % 7;
  return wd !== off && wd !== (off + 3) % 7;
}

function end(plan) {
  return plan.length === 0 ? 0 : plan[plan.length - 1].son;
}

function add(plan, until, ne, yer) {
  const start = end(plan);
  if (until > start) plan.push({ bas: start, son: until, ne, yer });
}

function travel(plan, commute, from, to) {
  const start = end(plan);
  plan.push({ bas: start, son: start + commute, ne: "yol", nereden: from, nereye: to });
}

/** İş çıkışı: %40 hobi, %25 meydan, gerisi doğrudan ev (""). */
function eveningPlace(s, day, hobbyPlace) {
  const x = roll(s, "aksam", day) % 100;
  if (x < 25) return hobbyPlace;
  if (x < 55) return "meydan";
  return "";
}

function activityOf(place) {
  return place.startsWith("hobi:") ? "hobi" : place;
}

/** Akşam yemeğinden sonra bir kısmı yeniden çıkar (çarşı ya da mahalle çay bahçesi). */
function nightOut(plan, s, day, commute, sleep) {
  if (roll(s, "gece", day) % 100 >= 35) return;
  const start = Math.max(end(plan) + 45, 1230 + (roll(s, "gece_saat", day) % 60));
  const duration = 60 + (roll(s, "gece_sure", day) % 60);
  if (start + duration + commute > sleep - 10) return;
  add(plan, start - commute, "ev", PLACE_HOME);
  travel(plan, commute, PLACE_HOME, "meydan");
  add(plan, end(plan) + duration, "meydan", "meydan");
  travel(plan, commute, "meydan", PLACE_HOME);
}

/** Günün planı: dakika aralıklarından oluşan kesintisiz liste (0-1440). */
export function dayPlan(r, day) {
  const s = r.seed;
  const commute = 15 + (roll(s, "yol") % 20);
  const hobbyPlace = "hobi:" + hobby(r).yer;
  const plan = [];

  let sleep = 1350 + (roll(s, "uyku", day) % 80);
  if (worksOn(r, day)) {
    const j = job(r);
    const shift = catalog.vardiyalar[j.vardiya];
    if (j.vardiya === "erken") sleep = 1290 + (roll(s, "uyku", day) % 60);
    const wake = shift.bas - commute - 45 - (roll(s, "uyan", day) % 30);
    add(plan, wake, "uyku", PLACE_HOME);
    add(plan, shift.bas - commute, "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, PLACE_WORK);
    add(plan, shift.son, "is", PLACE_WORK);
    const outing = eveningPlace(s, day, hobbyPlace);
    const duration = 60 + (roll(s, "sure", day) % 120);
    // Hobiler 20:00'den, meydan buluşmaları 21:30'dan önce başlar.
    const latest = outing.startsWith("hobi:") ? OUTING_LATEST_HOBBY : OUTING_LATEST_MEYDAN;
    if (outing !== "" && shift.son + commute <= latest && shift.son + 3 * commute + duration <= sleep - 10) {
      travel(plan, commute, PLACE_WORK, outing);
      add(plan, end(plan) + duration, activityOf(outing), outing);
      travel(plan, commute, outing, PLACE_HOME);
    } else {
      travel(plan, commute, PLACE_WORK, PLACE_HOME);
    }
    nightOut(plan, s, day, commute, sleep);
  } else {
    const wake = 450 + (roll(s, "uyan", day) % 120);
    add(plan, wake, "uyku", PLACE_HOME);
    add(plan, Math.max(wake + 60, 600) + (roll(s, "cikis", day) % 60), "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, hobbyPlace);
    add(plan, end(plan) + 90 + (roll(s, "sure", day) % 90), "hobi", hobbyPlace);
    travel(plan, commute, hobbyPlace, PLACE_HOME);
    const evening = 1140 + (roll(s, "aksam_saat", day) % 90);
    if (roll(s, "aksam", day) % 100 < 55 && evening + 90 + commute <= sleep - 10) {
      add(plan, evening - commute, "ev", PLACE_HOME);
      travel(plan, commute, PLACE_HOME, "meydan");
      add(plan, Math.min(end(plan) + 90 + (roll(s, "meydan_sure", day) % 90), sleep - 10 - commute), "meydan", "meydan");
      travel(plan, commute, "meydan", PLACE_HOME);
    }
  }
  add(plan, Math.max(sleep, end(plan)), "ev", PLACE_HOME);
  add(plan, 1440, "uyku", PLACE_HOME);
  return plan;
}

/** Verilen dakikadaki parça; yolculukta t ilerleme oranıdır (0-1). */
export function activityAt(plan, minute) {
  for (const seg of plan) {
    if (minute < seg.son) {
      if (seg.ne === "yol") {
        const t = Math.min(1, Math.max(0, (minute - seg.bas) / (seg.son - seg.bas)));
        return { ...seg, t };
      }
      return seg;
    }
  }
  return plan[plan.length - 1];
}
