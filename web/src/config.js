// Yayın ayarları: hesap adı, veri adresi, taşınma saatleri, deneme bayrağı.
// Sakinlerin geldiği TikTok hesabı (kullanıcı adı, @ olmadan; null: takip bağlantısı gösterilmez).
// Değişirse burası, public/gizlilik.html ve Mac'teki takip aracının config.toml'u ([mercanada] hesap)
// birlikte güncellenir.
export const TIKTOK = "livemercanada";
export const TIKTOK_URL = TIKTOK ? `https://www.tiktok.com/@${TIKTOK}` : null;
export const VERI_URL = "https://sayac.rumpuskit.com/sakinler.json";
// Taşınmalar (Türkiye saati): Mac'teki takip aracı bu saatlerde tam listeyi sunucuya yollar
// (config.toml tasinma_saatleri ile aynı olmalı). Mac uyuyorsa taşınma uyanınca yapılır.
export const TASINMA_SAATLERI = [9, 15, 21];
// Açılış: TikTok hesabı açılınca (30 Ekim 2026). O ana kadar deneme süreci: 60×/600× düğmeleri herkese
// görünür; sonra yalnız ?test ile.
export const LAUNCH = Date.parse("2026-10-28T12:30:00+03:00");
export const TEST_PHASE = !TIKTOK || Date.now() < LAUNCH;

// Sıradaki taşınmanın saati ("15:00" ya da "yarın 09:00"). Türkiye'de yaz saati yok: UTC+3.
export function nextMove(now = Date.now()) {
  const h = ((now / 3600000 + 3) % 24 + 24) % 24;
  const next = TASINMA_SAATLERI.find((s) => s > h);
  const pad = (s) => String(s).padStart(2, "0") + ":00";
  return next != null ? pad(next) : "yarın " + pad(TASINMA_SAATLERI[0]);
}
