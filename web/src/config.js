// Yayın ayarları: hesap adı, veri adresi, deneme bayrağı.
export const TIKTOK = "mercanada"; // sakinlerin geldiği TikTok hesabı (kullanıcı adı, @ olmadan)
export const TIKTOK_URL = `https://www.tiktok.com/@${TIKTOK}`;
export const VERI_URL = "https://sayac.rumpuskit.com/sakinler.json";
// Açılış: 28 Ekim 2026 12:30 (Türkiye). O ana kadar deneme süreci: 60×/600× düğmeleri herkese görünür;
// açılıştan sonra yalnız ?test ile.
export const LAUNCH = Date.parse("2026-10-28T12:30:00+03:00");
export const TEST_PHASE = Date.now() < LAUNCH;
