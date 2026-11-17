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
