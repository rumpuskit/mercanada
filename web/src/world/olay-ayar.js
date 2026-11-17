// Mercanada'nın olay ayarları (olay-plan.js okur; Driftwood'da kendi dosyası).
// Saatler (16 Kasım, kullanıcı: "yarınki üretimle … 12:30 videosu bunlarla çıkmalı"): olay öğle videosunun üretimi
// (11:30 Berlin = 13:30 TR) başlamadan BİTER; öğle videosu günün olayını anlatır. En geç bitiş ~12:50 TR.
export const ADA_TURLERI = ["yangin", "firtina", "yunus", "kaza", "sis"];
/** Başlangıç pencereleri [en erken, en geç] (TR dakikası); verilmeyen tür olay-plan.js varsayılanını kullanır. */
export const PENCERE = {};
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
  pencere: { firtina: [840, 930], yangin: [870, 1020], kaza: [870, 1050], yunus: [840, 960] },
  son: 1130,
  yazSon: 1070,
};
/** Olay modüllerinin dili ve adları (olay-zeplin.js). */
export const DIL = "tr";
export const ZEPLIN = {
  kendi: { ad: "Mercan Zeplini", in: "Mercan Zeplini'nin" },
  ziyaretci: { ad: "bir reklam zeplini", in: "bir reklam zeplininin" },
  saha: { ad: "Mercanspor Sahası", e: "Mercanspor Sahası'na", ustune: "Mercanspor Sahası'nın üstüne" },
  yedekSaha: { ad: "çayır", e: "çayıra", ustune: "çayırın üstüne" },
};
