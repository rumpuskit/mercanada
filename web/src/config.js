// Yayın ayarları: hesap adı, veri adresi, taşınma saatleri.
// Sakinlerin geldiği TikTok hesabı (kullanıcı adı, @ olmadan).
// Değişirse burası, public/gizlilik.html ve Mac'teki takip aracının config.toml'u ([mercanada] hesap)
// birlikte güncellenir.
export const TIKTOK = "livemercanada";
export const TIKTOK_URL = `https://www.tiktok.com/@${TIKTOK}`;
export const VERI_URL = "https://sayac.rumpuskit.com/sakinler.json";
// Taşınmalar (Türkiye saati): Mac'teki takip aracı bu saatlerde tam listeyi sunucuya yollar
// (config.toml tasinma_saatleri ile aynı olmalı). Mac uyuyorsa taşınma uyanınca yapılır.
export const TASINMA_SAATLERI = [9, 15, 21];

// Sıradaki taşınmanın saati ("15:00" ya da "yarın 09:00"). Türkiye'de yaz saati yok: UTC+3.
export function nextMove(now = Date.now()) {
  const h = ((now / 3600000 + 3) % 24 + 24) % 24;
  const next = TASINMA_SAATLERI.find((s) => s > h);
  const pad = (s) => String(s).padStart(2, "0") + ":00";
  return next != null ? pad(next) : "yarın " + pad(TASINMA_SAATLERI[0]);
}
