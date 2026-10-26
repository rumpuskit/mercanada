// Trafik ışıkları: her ışıklı kavşakta iki grup (doğu-batı ve kuzey-güney kolları) sırayla yeşil yanar.
// 60 saniyelik döngü: 25 sn yeşil, 3 sn sarı, 2 sn tümü kırmızı; sonra öbür grup. Kavşakların döngüleri
// birbirinden kaydırılmıştır. Durum yalnızca saate bağlıdır: aynı anda bakan herkes aynı ışığı görür.
export const CYCLE = 60;
const GREEN = 25, YELLOW = 3;

/** Grubun döngü içindeki yeri (0 = yeşilin başı). */
function local(node, group, tSec) {
  const base = group === 0 ? 0 : CYCLE / 2;
  return ((((tSec + node.offset - base) % CYCLE) + CYCLE) % CYCLE);
}

/** Araçlar için ışık: "g" yeşil, "y" sarı, "r" kırmızı. */
export function signalState(node, group, tSec) {
  const u = local(node, group, tSec);
  return u < GREEN ? "g" : u < GREEN + YELLOW ? "y" : "r";
}

/** Kırmızının bitmesine kalan süre (sn); yeşil/sarıdaysa 0. */
export function redRemaining(node, group, tSec) {
  const u = local(node, group, tSec);
  return u >= GREEN + YELLOW ? CYCLE - u : 0;
}

/**
 * Bir kolu karşıdan karşıya geçecek yaya kaç saniye bekler? Yaya, o kolun araçları kırmızıdayken ve
 * kırmızının bitmesine geçiş süresinden fazla zaman varken geçer.
 */
export function pedWait(node, group, tSec, crossT) {
  const u = local(node, group, tSec);
  const redStart = GREEN + YELLOW;
  if (u >= redStart && CYCLE - u >= crossT + 1) return 0;
  return u >= redStart ? CYCLE - u + redStart : redStart - u;
}
