// Mercanada'nın olay ayarları (olay-plan.js okur; Driftwood'da kendi dosyası).
// Saatler (16 Kasım, kullanıcı: "yarınki üretimle … 12:30 videosu bunlarla çıkmalı"): olay öğle videosunun üretimi
// (11:30 Berlin = 13:30 TR) başlamadan BİTER; öğle videosu günün olayını anlatır. En geç bitiş ~12:50 TR.
export const ADA_TURLERI = ["yangin", "firtina", "yunus", "kaza", "sis"];
/** Başlangıç pencereleri [en erken, en geç] (TR dakikası); verilmeyen tür olay-plan.js varsayılanını kullanır. */
export const PENCERE = { zeplin: [570, 690], balon: [480, 690], ucurtma: [600, 700], kus: [540, 710],
  // --- ajan C (17 Kasım akşamı): sabah pencereleri, SABAH_SON (12:50) öncesi biter ---
  dugun: [585, 720], film: [570, 710], yaris: [570, 720], marti: [570, 740] };
// --- ajan B --- liman/tekne olayları, sabah pencereleri (SABAH_SON 12:50'den önce biter).
Object.assign(PENCERE, { gemi: [570, 685], vapur: [560, 737], balik: [560, 720] });
/** Sabah olayının en geç bitişi (TR dk): öğle üretimi 13:30 TR (kış) başlar; 12:50. */
export const SABAH_SON = 770;
/** Avrupa yaz saatinde en geç bitiş (TR dakikası): üretim 11:30 CEST = 12:30 TR; fırtınanın 20 dk gökkuşağı dahil 12:25. */
export const YAZ_SON = 725;
/** Özel günler (olay yok): 29 Ekim (fişek), 10 Kasım (anma). Gün sayısı UTC gün başı (sim.dayOf). */
export function ozelGun(day) {
  const d = new Date(day * 86400000), m = d.getUTCMonth() + 1, g = d.getUTCDate();
  return (m === 10 && g === 29) || (m === 11 && g === 10);
}
/** Öğleden sonra olayı (17 Kasım akşamı, kullanıcı: "ikinci videolar da olay videosu olacak"): akşam videosu (18:30 Berlin,
 *  üretim 17:30 = 19:30 TR kışın, 18:30 TR yazın) anlatır. Sis yok (öğleden sonra sis gerçekçi değil); tür sabahkinden
 *  farklı. Pencereler TR dakikası: deniz olayı gün ışığında (kışın gün batımı ~17:40), kaza/yangın alacakaranlığa kayabilir.
 *  son: en geç bitiş (18:50 TR, fırtınanın 20 dk gökkuşağı dahil üretimden ≥20 dk önce); yazSon: yaz saatinde 17:50 TR. */
export const IKINCI = {
  turler: ["yangin", "firtina", "yunus", "kaza"],
  pencere: { firtina: [840, 930], yangin: [870, 1020], kaza: [870, 1050], yunus: [840, 960], zeplin: [840, 990], balon: [840, 960], ucurtma: [840, 990], kus: [840, 960],
    // --- ajan C: gün ışığında biter (en geç ~17:15 TR) ---
    dugun: [840, 990], film: [840, 960], yaris: [840, 980], marti: [840, 1010] },
  varsayilan: [840, 960], // penceresi yazılmamış tür (gün ışığında başlar)
  son: 1130,
  yazSon: 1070,
};
// --- ajan B --- öğleden sonra pencereleri (gün ışığında biter; gemi yalnız sabah önerilir: ayrılışı olaydan 150 dk sonra).
Object.assign(IKINCI.pencere, { vapur: [840, 1000], balik: [840, 960] });
/** Olay modüllerinin dili ve adları (olay-zeplin.js). */
export const DIL = "tr";
export const ZEPLIN = {
  kendi: { ad: "Mercan Zeplini", in: "Mercan Zeplini'nin" },
  ziyaretci: { ad: "bir reklam zeplini", in: "bir reklam zeplininin" },
  saha: { ad: "Mercanspor Sahası", e: "Mercanspor Sahası'na", ustune: "Mercanspor Sahası'nın üstüne" },
  yedekSaha: { ad: "çayır", e: "çayıra", ustune: "çayırın üstüne" },
};
/** Tür listesi sürümleri (olay-plan.js): yeni türler yalnız sürümün gününden itibaren takvime girer; önceki günler değişmez. */
export const TUR_SURUMLERI = [
  // 19 Kasım: zeplin acil inişi (olay-zeplin.js; 17 Kasım akşamı denendi).
  { gun: "2026-11-19", sabah: [...ADA_TURLERI, "zeplin"], ikinci: [...IKINCI.turler, "zeplin"] },
];
// --- ajan E ---
/** Gün batımı (TR dakikası; sky.js sunTimes ile aynı formül, three'siz: olay-plan.js elektrik kesintisinin penceresini
 *  bununla kurar, video betiği de aynı planı hesaplar). Enlem 40,87° K, boylam 29,1° D, UTC+3. */
export function gunBatimi(day) {
  const rad = Math.PI / 180, LAT = 40.87 * rad, LON = 29.1, TZ = 3, h = -0.833 * rad;
  const el = (m) => {
    const n = day + 2440587.5 + (m / 60 - TZ) / 24 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) * rad;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ha = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * rad + LON * rad - ra;
    return Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(ha));
  };
  let prev = el(720);
  for (let m = 722; m <= 1440; m += 2) { const e = el(m); if (prev >= h && e < h) return m; prev = e; }
  return 1440;
}
// --- ajan D --- (olay-balon.js, olay-ucurtma.js, olay-kus.js)
/** Adaya özgü olay adları (olay-plan.js OLAYLAR: [ad, en]). */
export const ADLAR = { kus: ["Leylek göçü", "Stork migration"],
  // --- ajan C ---
  yaris: ["Ada turu bisiklet yarışı", "Island bike race"], marti: ["Martı simit kaptı", "Seagull steals a simit"] };
/** Kuş olayı (olay-kus.js): Mercanada'da leylek göçü (yüzlerce leylek termikte daire çizip güneye gider). */
export const KUS = { tur: "leylek" };
/** Uçurtma şenliği (olay-ucurtma.js): yer (tepe | cimen) ve adı. */
export const UCURTMA = { yer: "tepe", ad: "Tepe", de: "Tepe'de", ye: "Tepe'ye" };
// --- ajan D sonu ---
