// Günlük video: sitenin herkese açık sakin listesinden ve simülasyondan günün hikâyesini seçer, anlatım
// standardına (video/cikti/ANLATIM-STANDARDI.md) uygun seslendirme ve çekim planını kurar; istenirse sesi ve
// videoyu üretir, açıklamayı panoya kopyalar ve bildirim gönderir.
//
//   node gunluk.mjs [--yuva aksam|ogle|sabah] [--uret] [--onizleme] [--bildir] [--zorla] [--ac] [--taslaksiz] [--hikaye h.json]
//
// --hikaye: günün hikâyesi elle (gerçek olaylardan, sitede doğrulanmış): {"tur", "kanca", "govde": [{ses, yazi?,
// vurus?}], "soru": {ses, yazi?}, "cekim": ["fener", {"sakin": "ad"}, ...], "etiketler": [...], ("saat" artık yok sayılır: ada saati üretim anı),
// "onsoz": [{ses, yazi?, vurus?}] (imzadan önce vurucu açılış; ilk çekimde ya da "onsozCekim": [çekimler] ile kendi çekimlerinde), "imza2": {ses, yazi?} (kilit sayacının ikinci cümlesi: sıradaki yer yerine başka bir hedef, ör. zeplin),
// "ilk": imza çekimi (varsayılan "ucus"), "ornek": kapanıştaki örnek meslek (varsayılan "balıkçı"; katalogda, kadrosuz), "soruCekim": soru karesinin çekimi,
// "tasinCekim": "Takip eden adaya taşınıyor" karesi (varsayılan "iskele")}. İmza ve kapanış yine standarttan gelir. --ac: üretim bitince klasörü Finder'da açar.
// Çekim tanımı (cekim/ilk/onsozCekim/soruCekim/tasinCekim öğeleri): "iskele" (kütüphane adı) | {"sakin": "ad"} |
//   kadraj ayarı {"yer": "iskele", "aci": rad (hedef çevresinde döndür, + saat yönünün tersi), "uzak": çarpan,
//   "yuk": yükseklik çarpanı, "varyant": n (kütüphanedeki n. açı)} | ham kamera {"kamera": [[kx,ky,kz, bx,by,bz] başta,
//   [..] sonda], "vapur": true (iskelede vapur dakikası)}. Ayarlı/ham çekim otomatik döndürülmez (yalnız itme/çekme).
// --cekim-dene N: önizleme ölçeğinde yalnız N. çekimi çizer (sesi önbellekten), cekimN-kareler.jpg (baş/orta/son) yazar;
//   kadrajı tek tek düzeltmek için (tam önizlemeden ~10 kat hızlı). Durum yazılmaz.
//
// Yuva: akşam (21:00 taşınmasından sonra, günün özeti), öğle (bir sakinin hikâyesi ya da istek), sabah
// (09:00 taşınma haberi). Kaç yuvanın üretileceği takipçi sayısına bağlı (SIKLIK); gerekmeyen yuva sessizce
// atlanır (--zorla ile yine üretilir). Uydurma olay yok: her cümle simülasyondan ya da listeden gelir ve sitede
// doğrulanır. Kullanıcı adları seste okunmaz; ekranda ve açıklamada yazılır.
// Çıktı: cikti/gunluk/<tarih>-<yuva>/ (senaryo.json, ses, video, ACIKLAMA.txt); durum: cikti/gunluk/durum.json.
// TikTok bağlıysa (tiktok.mjs) video ayrıca hesabın gelen kutusuna taslak olarak gönderilir.
// Seslendirme için ELEVENLABS_API_KEY gerekir (gunluk.sh verir).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sim from "../web/src/sim.js";
import { VERI_URL, TIKTOK, ZEPLIN_REKLAM } from "../web/src/config.js";
import { ferryOut, nextArrival } from "../web/src/world/ferry.js";
import { seslendir } from "./seslendir.mjs";
import { yukle } from "./tiktok.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
process.chdir(HERE);
const catalog = JSON.parse(readFileSync(resolve(HERE, "../data/catalog.json"), "utf8"));
sim.setCatalog(catalog);

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const yuva = opt("--yuva", "aksam");
// Önerilen paylaşma saati: kullanıcı Almanya'da (TR = Almanya + 2 saat, kış saati).
const SAAT = { sabah: "09:30 (TR 11:30)", ogle: "12:30 (TR 14:30)", aksam: "18:30 (TR 20:30)" };
// Takipçi sayısına göre günde kaç video (önce akşam, sonra öğle, sonra sabah).
const SIKLIK = [[0, ["aksam"]], [100, ["ogle", "aksam"]], [1000, ["sabah", "ogle", "aksam"]]];

// --- yardımcılar ---
const BIR = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const ON = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
/** Sayının okunuşu (seslendirme için): 1250 → "bin iki yüz elli". */
export function say(n) {
  if (n === 0) return "sıfır";
  const parts = [];
  const grup = (k) => [k >= 100 ? (Math.floor(k / 100) === 1 ? "yüz" : BIR[Math.floor(k / 100)] + " yüz") : "", ON[Math.floor(k / 10) % 10], BIR[k % 10]].filter(Boolean).join(" ");
  const mil = Math.floor(n / 1e6), bin = Math.floor(n / 1000) % 1000, kalan = n % 1000;
  if (mil) parts.push(grup(mil) + " milyon");
  if (bin) parts.push(bin === 1 ? "bin" : grup(bin) + " bin");
  if (kalan) parts.push(grup(kalan));
  return parts.join(" ");
}
const fmt = (n) => n.toLocaleString("tr-TR");
const kucuk = (t) => t.toLocaleLowerCase("tr");
const HOBI_FIIL = { balik: "balık tutuyor", kitap: "kitap okuyor", satranc: "satranç oynuyor", resim: "resim yapıyor", bisiklet: "bisiklete biniyor", yuzme: "yüzüyor", ucurtma: "uçurtma uçuruyor", gitar: "gitar çalıyor", fotograf: "fotoğraf çekiyor", kosu: "koşuyor", tavla: "tavla oynuyor", yoga: "yoga yapıyor" };
const EVCIL_I = { Kedi: "kedisi", Köpek: "köpeği", Papağan: "papağanı", Kaplumbağa: "kaplumbağası" };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Cümle: ses (okunan) ve yazi (altyazı; yoksa aynısı). vurus: öncesine 0,35 sn sessizlik. Büyük harfle başlar. */
const buyuk = (t) => (t ? t[0].toLocaleUpperCase("tr") + t.slice(1) : t);
const c = (ses, yazi = null, vurus = false) => ({ ses: buyuk(ses), ...(yazi ? { yazi: buyuk(yazi) } : {}), ...(vurus ? { vurus } : {}) });

// --- veri --- (--veri dosya.json: deneme için sitedeki biçimde bir liste; --durum: ayrı durum dosyası)
let data;
if (opt("--veri")) data = JSON.parse(readFileSync(opt("--veri"), "utf8"));
else {
  const res = await fetch(VERI_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`sakin listesi alınamadı: HTTP ${res.status}`);
  data = await res.json();
}
const residents = data.sakinler.map(([handle, seed, slot, arrived_day, overrides]) => ({
  handle, seed, slot, arrived_day, ...(overrides ? { overrides } : {}),
}));
const N = residents.length;
const takipci = data.takipci ?? 0;
const now = Date.now() / 1000;
const today = sim.dayOf(now);
const tarih = new Date((now + sim.TZ_OFFSET) * 1000).toISOString().slice(0, 10);

const yuvalar = SIKLIK.filter(([n]) => takipci >= n).at(-1)[1];
if (!yuvalar.includes(yuva) && !args.includes("--zorla")) {
  console.log(`${yuva}: bugün gerekmiyor (takipçi ${takipci}; yuvalar: ${yuvalar.join(", ")})`);
  process.exit(0);
}

const durumYolu = resolve(opt("--durum", "cikti/gunluk/durum.json"));
const durum = { zirve: 0, istekler: {}, konular: [], sakinler: [], ...(existsSync(durumYolu) ? JSON.parse(readFileSync(durumYolu, "utf8")) : {}) };
// --bekle: o yuvanın taşınması (09:00 / 21:00) henüz işlenmediyse çık; zamanlayıcı bir saat sonra yeniden dener.
const TASINMA = { sabah: 9, aksam: 21 };
if (args.includes("--bekle") && TASINMA[yuva] != null && (data.son_aktarim ?? 0) < today * 86400 - sim.TZ_OFFSET + TASINMA[yuva] * 3600 && N > 0) {
  console.log(`${yuva}: ${TASINMA[yuva]}:00 taşınması henüz işlenmedi, sonra yeniden denenecek`);
  process.exit(0);
}
if (args.includes("--uret") && !args.includes("--onizleme") && !args.includes("--zorla") && durum.son?.tarih === tarih && durum.son?.yuva === yuva) {
  console.log(`${tarih} ${yuva}: zaten üretildi (${durum.son.video})`);
  process.exit(0);
}
const level = Math.max(data.zirve ?? 0, residents.reduce((m, r) => Math.max(m, r.slot + 1), 0));
sim.setTown(level);
const stages = catalog.gelisim;
const next = stages.find((s) => s.nufus > level);
const need = next ? Math.max(1, next.nufus - N) : 0;

// --- hikâye seçimi ---
const named = (r) => r.handle != null; // adını gizleyenler adlarıyla anılmaz
const yeniler = residents.filter((r) => r.arrived_day === today).sort((a, b) => a.slot - b.slot);
// Bugün açılanlar: dünkü düzeyden (bugünden önce gelenler) bugünkü düzeye geçerken açılan adımlar.
const dunku = residents.filter((r) => r.arrived_day < today).reduce((m, r) => Math.max(m, r.slot + 1), 0);
const acilan = stages.filter((s) => s.nufus > dunku && s.nufus <= level);
const istekDegisen = residents.filter((r) => named(r) && r.overrides && JSON.stringify(r.overrides) !== JSON.stringify(durum.istekler?.[r.handle] ?? null));

/** Sakinin işi: "ozne bir X." ve ardından durumu. Asıl mesleğinin yeri açık değilse anakarada çalışır. */
function isCumleleri(r, ozne) {
  const dream = sim.dreamJob(r), job = sim.job(r);
  const rank = sim.rank(r, today);
  const unvan = kucuk(dream.kademeler[Math.min(rank, dream.kademeler.length - 1)]);
  if (dream.id === "emekli") return [c(`${ozne} emekli.`), c("Bütün gün adada.", null, true)];
  if (dream.id === "uzaktan") return [c(`${ozne} bir ${unvan}.`), c("Evden çalışıyor.", null, true)];
  if (dream.id === "ogrenci") return [c(`${ozne} bir ${unvan}.`), c("Anakarada okuyor."), c("Her sabah vapura biniyor.", null, true)];
  if (dream.id === "anakara") return [c(`${ozne} anakarada ${unvan}.`), c("Her sabah vapura biniyor.", null, true)];
  if (job.id !== dream.id) {
    const yer = catalog.isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0][1];
    return [c(`${ozne} bir ${unvan}.`), c(`${yer} henüz yok.`), c("Şimdilik vapurla anakaraya gidiyor.", null, true)];
  }
  return [c(`${ozne} bir ${unvan}.`), c(`İş yeri ${sim.workplace(r).name}.`)];
}

/** Boş ada konuları (sırayla, tekrar etmeden). Her biri: gövde, soru, çekimler. */
const BOS = [
  // İmza zaten sıradaki adımı (5'te meydan bankları) söylüyor: yol haritası ondan sonrasını anlatır.
  { id: "yolharitasi", govde: [c("Onuncu sakinle kahvehane açılıyor.", "10. sakinle kahvehane açılıyor."), c("Yirmincide market.", "20.'de market."), c("Otuzuncuda fırın.", "30.'da fırın.", true)], soru: c("Sizce fırına kaç günde ulaşırız?"), cekim: ["siradaki", "meydan"] },
  { id: "fener", govde: [c("Sekizinci gelen fener bekçisi olacak.", "8. gelen\nfener bekçisi olacak."), c("Kendisine sorulmayacak.", null, true), c("Fener şimdilik kendi kendine yanıyor.")], soru: c("Sizce sekizinci kim olacak?"), cekim: ["fener", "fener2"], saat: "19:40" },
  { id: "vapur", govde: [c("Vapur yirmi dakikada bir yanaşıyor.", "Vapur 20 dakikada bir yanaşıyor."), c("Kimse inmiyor.", null, true), c("Kaptan yine de sekiz dakika bekliyor.", "Kaptan yine de 8 dakika bekliyor.")], soru: c("Sizce ilk vapurdan kim inecek?"), cekim: ["iskele", "iskele2"], saat: "08:20" },
  { id: "meslek", govde: [c("Taşınan herkese bir meslek veriliyor."), c("Otuz altı meslek var.", "36 meslek var."), c("İş yeri yoksa vapurla anakaraya gidiyorsun.", null, true)], soru: c("Sen hangi mesleği seçerdin?"), cekim: ["meydan2", "iskele"] },
  { id: "adres", govde: [c("İlk sakinin adresi belli."), c("Kabuk Sokağı, bir numara, daire bir.", "Kabuk Sokağı No 1, Daire 1"), c("Bina ilk sakinle birlikte yapılacak.", null, true)], soru: c("Sizce bu adres kimin olacak?"), cekim: ["yakamoz", "meydan"] },
  { id: "kahvehane", govde: [c("Kahvehane onuncu sakinle açılıyor.", "Kahvehane 10. sakinle açılıyor."), c("Tavla oynayanlar oraya gidecek."), c("Satranççılar meydana.", null, true)], soru: c("Tavla mı, satranç mı?"), cekim: ["meydan", "meydan2"] },
  { id: "gece", govde: [c("Akşam oldu."), c("Fener yandı."), c("Bakan kimse yok.", null, true)], soru: c("Adanın ilk gecesini kim geçirecek?"), cekim: ["fener", "ucus"], saat: "20:10" },
];

let tur, govde = [], soru, cekim = [], etiketler = [], saat = "16:40", konuId = null, ozelKanca = null, imza2 = null, ilkCekim = "ucus", ornek = "balıkçı", soruCekim = null, onsoz = [], onsozCekim = null, tasinCekim = "iskele";
if (acilan.length) {
  tur = "acilis";
  const s = acilan.at(-1);
  if (s.acar.includes("zeplin")) {
    // Zeplin bir yer değil: gelişini anlat, gece ışıklı reklam alanıyla çek.
    govde.push(c("Bugün adaya bir zeplin geldi."), c("Her sabah dokuzda geliyor, gece onda dönüyor.", "Her sabah 09:00'da geliyor, 22:00'de dönüyor."),
      c(ZEPLIN_REKLAM.ad ? `Üstünde ${ZEPLIN_REKLAM.ad} yazıyor.` : "Üstünde adamızın adı yazıyor.", null, true));
    saat = "20:00";
  } else govde.push(c(`Bugün ${s.ad} açıldı.`));
  // Bu açılışla anakaradan adaya dönenler: dünkü düzeyde anakarada, bugün adada çalışanlar.
  sim.setTown(durum.zirve);
  const once = new Map(residents.map((r) => [r.slot, sim.job(r).id]));
  sim.setTown(level);
  const donen = residents.filter((r) => once.get(r.slot) === "anakara" && sim.job(r).id !== "anakara");
  if (s.acar.includes("zeplin")) cekim = ["zeplin", "zeplin2"];
  else if (donen.length) govde.push(c(`${say(donen.length)} kişi artık anakaraya gitmiyor.`, `${fmt(donen.length)} kişi artık anakaraya gitmiyor.`, true));
  else if (s.acar.some((k) => catalog.isyerleri[k.split(":")[0]])) govde.push(c("Henüz çalışanı yok."), c("Kapısı yine de açık.", null, true));
  else govde.push(c("Oturan kimse yok."), c("Henüz.", null, true));
  etiketler = donen.filter(named).slice(0, 5).map((r) => r.handle);
  soru = next ? c(`Sizce ${next.ad} ne zaman açılır?`) : c("Ada tamamlandı. Sırada ne olsun?");
  if (!cekim.length) cekim = ["ucus", "meydan"];
} else if (yeniler.length) {
  tur = "yeniler";
  govde.push(c(`Bugün ${say(yeniler.length)} kişi taşındı.`, `Bugün ${fmt(yeniler.length)} kişi taşındı.`));
  const fener = yeniler.find((r) => sim.dreamJob(r).id === "fener_bekcisi");
  const ilk = fener ?? yeniler.find(named) ?? yeniler[0];
  if (fener) govde.push(c("Sekizinci sakin geldi.", "8. sakin geldi."), c("Artık fener bekçisi."), c("Kendisine sorulmadı.", null, true));
  else govde.push(...isCumleleri(ilk, ilk === yeniler[0] ? "İlk gelen" : "Gelenlerden biri"));
  etiketler = yeniler.filter(named).slice(0, 8).map((r) => r.handle);
  soru = c("Yarın kim gelecek?");
  cekim = named(ilk) ? ["iskele", { sakin: ilk.handle }] : ["iskele", "meydan"];
} else if (istekDegisen.length) {
  tur = "istek";
  const r = istekDegisen[0];
  const o = r.overrides;
  if (o.meslek) {
    const j = catalog.meslekler.find((m) => m.id === o.meslek);
    // "Artık bir X." yerine "İsteği işlendi."; ardından durumu (yeri yoksa anakarada).
    govde.push(c(`Bir sakin ${kucuk(j.kademeler[1])} olmak istedi.`), c("İsteği işlendi."), ...isCumleleri(r, "").slice(1));
  } else if (o.evcil) govde.push(c(`Bir sakin ${kucuk(o.evcil)} istedi.`), c(`Artık bir ${EVCIL_I[o.evcil]} var.`, null, true));
  else if (o.hobi) govde.push(c("Bir sakin yeni bir hobi istedi."), c(`Artık boş vaktinde ${HOBI_FIIL[o.hobi]}.`, null, true));
  else govde.push(c("Bir sakin isteğini yazdı."), c("Sitede işlendi.", null, true));
  etiketler = istekDegisen.slice(0, 5).map((r) => r.handle);
  soru = c("Sıradaki istek senin mi?");
  cekim = [{ sakin: r.handle }, "meydan"];
} else if (N > 0) {
  tur = "sakin";
  // Sırayla, daha önce anlatılmamış ve adı görünen bir sakin.
  const r = residents.filter(named).find((x) => !durum.sakinler.includes(x.handle)) ?? residents.filter(named)[0];
  if (r) {
    const t = sim.tenure(r, today);
    govde.push(c("Bugün bir sakine yakından baktık."), ...isCumleleri(r, "Bu sakin"));
    const h = sim.hobby(r), p = sim.pet(r, today);
    govde.push(c(`Boş vaktinde ${HOBI_FIIL[h.id]}.`));
    if (p) govde.push(c(`Bir de ${EVCIL_I[p]} var.`, null, true));
    else if (t > 0) govde.push(c(`${say(t)} gündür adada.`, `${fmt(t)} gündür adada.`, true));
    etiketler = [r.handle];
    soru = c("Komşusu kim, biliyor musun?");
    cekim = [{ sakin: r.handle }, { sakin: r.handle }];
  }
}
if (opt("--hikaye")) {
  // Elle yazılmış hikâye (seçimin yerine geçer).
  const h = JSON.parse(readFileSync(opt("--hikaye"), "utf8"));
  const cc = (x) => c(x.ses, x.yazi ?? null, !!x.vurus);
  tur = h.tur ?? "ozel"; govde = h.govde.map(cc); soru = cc(h.soru); cekim = h.cekim; etiketler = h.etiketler ?? [];
  saat = h.saat ?? saat; ozelKanca = h.kanca ?? null;
  imza2 = h.imza2 ? cc(h.imza2) : null; ilkCekim = h.ilk ?? ilkCekim; ornek = h.ornek ?? ornek; soruCekim = h.soruCekim ?? null;
  tasinCekim = h.tasinCekim ?? tasinCekim;
  onsoz = (h.onsoz ?? []).map(cc); onsozCekim = h.onsozCekim ?? null;
}
if (!tur || !govde.length) {
  tur = "bos";
  const konu = BOS.find((k) => !durum.konular.includes(k.id)) ?? BOS[durum.konular.length % BOS.length];
  konuId = konu.id;
  govde = konu.govde; soru = konu.soru; cekim = konu.cekim; saat = konu.saat ?? saat;
}

// Ada saati = videonun üretildiği andaki gerçek ada saati (TR). Yayın saatine ya da güzel ışığa göre SEÇİLMEZ
// (kullanıcı kararı, 2 Kasım 2026: öğle videosu 18:40'ta çekilmişti). Hikâyedeki "saat" yok sayılır; yalnız
// kullanıcı açıkça isterse --saat HH:MM.
const istenenSaat = saat;
saat = opt("--saat") ?? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
if (!opt("--saat") && istenenSaat !== saat) console.log(`ada saati ${saat} (TR, şimdi); "${istenenSaat}" kullanılmadı`);
// Vapur iskele çekiminde iskelede olsun (kullanıcı, 3 Kasım: "vapur yokken vapur çekilmeye çalışılıyor"): ada saatinde
// vapur açıktaysa iskele çekimleri bir sonraki yanaşmanın 1 dk sonrasına (en çok ~17 dk ileri) alınır; diğer çekimler şimdi.
const dakika = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const saatYaz = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const vapurSaati = ferryOut(dakika(saat)) === 0 && ferryOut(dakika(saat) + 1) === 0 ? saat : saatYaz(nextArrival(dakika(saat)) + 1);
if (vapurSaati !== saat) console.log(`vapur ${saat}'te iskelede değil: iskele çekimleri ${vapurSaati}`);

// İmza (kilit sayacı) ve kapanış (soru + takip + istek kalıbı). "onsoz" (isteğe bağlı) imzadan önce, ilk çekimde
// söylenen vurucu açılış (izleyici ilk 1–2 sn'de kaydırıyor): gerçek bir çelişki, ör. "Adada beş zeplin pilotu var."
const imza = [...onsoz, ...(N === 0
  ? [c("Bu adada kimse yaşamıyor."), c(`${next.ad} için ${say(need)} kişi lazım.`, `${next.ad} için ${fmt(need)} kişi lazım.`)]
  : [c(`Bu adada ${say(N)} kişi yaşıyor.`, `Bu adada ${fmt(N)} kişi yaşıyor.`), ...(imza2 ? [imza2] : next ? [c(`${next.ad} için ${say(need)} kişi daha lazım.`, `${next.ad} için ${fmt(need)} kişi daha lazım.`)] : [])])];
const kapanis = [soru, c("Takip eden adaya taşınıyor."), c("Mesleğini sen seç."), c(`Yorumuna yaz: meslek, ${ornek}.`, `Yorumuna yaz:\nmeslek: ${ornek}`)];
const cumleler = [...imza, ...govde, ...kapanis];
// "onsozCekim" verilirse önsöz kendi çekimlerinde (bilgi kartı yok, ilk kare temiz), imza ardından ilk çekimde.
const onGrup = onsoz.length && onsozCekim ? onsoz.length : 0;
const gruplar = [
  ...(onGrup ? splitGovde(onGrup, onsozCekim).map(([a, b, ck]) => ({ cekim: ck, ilk: a, son: b })) : []),
  { cekim: ilkCekim, arayuz: true, ilk: onGrup, son: imza.length - 1 },
  ...splitGovde(govde.length, cekim).map(([a, b, ck]) => ({ cekim: ck, ilk: imza.length + a, son: imza.length + b })),
  // Kapanış üç çekim: soru (konunun son açısı), "takip eden adaya taşınıyor" (iskele), istek kalıbı (yazılı son kare).
  { cekim: soruCekim ?? (sakinMi(cekim.at(-1)) ? "meydan" : cekim.at(-1)), varyantEk: 1, ilk: imza.length + govde.length, son: imza.length + govde.length },
  { cekim: tasinCekim, tasin: true, ilk: imza.length + govde.length + 1, son: imza.length + govde.length + 1 },
  { cekim: "kapanis", ilk: imza.length + govde.length + 2, son: cumleler.length - 1 },
];
function sakinMi(ck) { return !!ck && typeof ck === "object" && "sakin" in ck; }
/** Kullanım sayacı anahtarı: aynı yer (ayarlı ya da değil) aynı sayacı paylaşır; ham kamera kendi başına. */
function ckAnahtar(ck) { return typeof ck === "string" ? ck : sakinMi(ck) ? "sakin:" + ck.sakin : ck.yer ?? JSON.stringify(ck.kamera); }
function splitGovde(n, ck) {
  // Gövde cümleleri çekimlere sırayla bölünür (en az bir cümle).
  const k = Math.min(ck.length, n), out = [];
  for (let i = 0; i < k; i++) out.push([Math.floor((i * n) / k), Math.floor(((i + 1) * n) / k) - 1, ck[i]]);
  return out;
}

const ad = `gunluk/${tarih}-${yuva}`;
const out = resolve("cikti", ad);
mkdirSync(out, { recursive: true });
const aralar = Object.fromEntries(cumleler.map((x, k) => [k, x.vurus ? 0.35 : 0]).filter(([, d]) => d));
const S0 = { ad, seslendirme: cumleler.map(({ ses, yazi }) => ({ ses, ...(yazi ? { yazi } : {}) })), aralar };

console.log(`${tarih} ${yuva} · ${tur}${konuId ? ` (${konuId})` : ""} · nüfus ${N}, takipçi ${takipci}`);
for (const x of cumleler) console.log("   " + x.ses + (x.vurus ? "   [vuruş]" : ""));

// --- açıklama (etkileşim: kanca + soru + istek kalıbı + etiketler) ---
const kanca = ozelKanca ?? { acilis: `Bugün adada yeni bir yer açıldı 🏗️`, yeniler: `Bugün ${fmt(yeniler.length)} kişi Mercanada'ya taşındı 🧳`, istek: "Yorumlardan gelen istek işlendi ✍️", sakin: "Bir sakinin günü 👀", bos: "Bu adada henüz kimse yaşamıyor 🏝️" }[tur];
const aciklama = [
  kanca,
  `${soru.yazi ?? soru.ses} 👇`,
  `Mesleğini sen seç: yorumuna "meslek: ${ornek}" gibi yaz.`,
  etiketler.length ? etiketler.map((h) => "@" + h).join(" ") : null,
  "Kendini bul: mercanada.rumpuskit.com",
  "",
  "#mercanada #keşfet #ada #şehirkurma #simülasyon #oyun #fyp",
].filter((x) => x != null).join("\n");
writeFileSync(`${out}/ACIKLAMA.txt`, aciklama + "\n");
writeFileSync(`${out}/malzeme.json`, JSON.stringify({ tarih, yuva, tur, konuId, nufus: N, takipci, level, sıradaki: next?.ad, need, yeniler: yeniler.map((r) => r.handle), etiketler }, null, 2));

const dene = opt("--cekim-dene"); // tek çekim denemesi (önizleme ölçeği, durum yazılmaz)
const onizleme = args.includes("--onizleme") || !!dene;
if (!args.includes("--uret") && !dene) {
  writeFileSync(`${out}/senaryo-taslak.json`, JSON.stringify({ ...S0, gruplar }, null, 2));
  console.log(`taslak: ${out} (üretmek için --uret)`);
  process.exit(0);
}

// --- ses ve çekim süreleri ---
const ses = await seslendir(S0);
const kay = (k) => Object.entries(aralar).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
const bas = (k) => ses.cumleler[k].bas + kay(k), son = (k) => ses.cumleler[k].son + kay(k);
// Kurgu (3 Kasım 2026, kullanıcı: "art arda aynı sahne, heyecan/vuruculuk yok"): geçiş kısa (neredeyse kesme),
// her çekim en çok PARCA sn (uzun grup bölünür), aynı yerin her kullanımı başka açı (yer başına sayaç, bkz. canlandir),
// kamera her çekimde belirgin hareket eder (itme/çekme + yay). Sakin izleme en çok 4,2 sn, kalanı meydan.
const X = 0.12, bitis = son(cumleler.length - 1) + 1.2, PARCA = 2.6;
const kesitler = [];
gruplar.forEach((g, gi) => {
  const t0 = gi === 0 ? 0 : bas(g.ilk) - 0.15;
  const t1 = gi === gruplar.length - 1 ? bitis : bas(gruplar[gi + 1].ilk) - 0.15;
  const sakin = sakinMi(g.cekim);
  const parca = g.cekim === "kapanis" ? 1 : Math.max(1, Math.ceil((t1 - t0) / (sakin ? 4.2 : PARCA)));
  for (let k = 0; k < parca; k++) kesitler.push({ ...g, parca: k, cekim: sakin && k > 0 ? "meydan" : g.cekim, t0: t0 + ((t1 - t0) * k) / parca, t1: t0 + ((t1 - t0) * (k + 1)) / parca });
});
const kullanim = {};
const cekimler = kesitler.map((k, i) => {
  const sure = +(k.t1 - k.t0 + (i < kesitler.length - 1 ? X : 0)).toFixed(3);
  const anahtar = ckAnahtar(k.cekim);
  const v = (kullanim[anahtar] = (kullanim[anahtar] ?? -1) + 1);
  // "Taşın" karesi iskelenin geniş açısı (v çift): yakın açıda vapurun önüne ev giriyordu (4–5 Kasım raporları).
  if (k.tasin && k.cekim === "iskele") return { sure, ...canlandir(CEKIM({ yer: "iskele", varyant: 0 }, 0, sure, false), 0) };
  const shot = CEKIM(k.cekim, v, sure, k.arayuz);
  return { sure, ...(k.cekim === "kapanis" ? shot : canlandir(shot, shot.ayarli ? k.parca : v)) };
});
// Art arda iki çekim aynı kalmasın (aynı adres + kamera): olursa ikincisi döndürülür (güvenlik ağı).
for (let i = 1; i < cekimler.length; i++) {
  const ayni = (a, b) => a.adres === b.adres && JSON.stringify(a.kamera ?? a.yorunge ?? null) === JSON.stringify(b.kamera ?? b.yorunge ?? null);
  if (ayni(cekimler[i - 1], cekimler[i]) && !cekimler[i].serbest) canlandir(cekimler[i], 3);
}

/** Aynı yerin v. kullanımı başka kadraj: DUZEN[v] = [açı (rad, hedef çevresinde), uzaklık çarpanı] (geniş → yakın →
 *  daha geniş …; art arda aynı yer bile belirgin farklı görünür). Çekim içinde de hareket: çift v'de sona doğru içeri
 *  itilir, tekte dışarı çekilir. Yörüngede yay en az 0,5 rad, r1 bitiş uzaklığı (kaydet.mjs uygular). */
function canlandir(shot, v) {
  const DUZEN = [[0, 1], [0.6, 0.55], [-0.6, 1.45], [1.1, 0.75], [-1.1, 1.25], [1.6, 0.6], [-1.6, 1.1]];
  // Ayarlı/ham çekim (hikâyede kadraj elle verildi): v = grubun parça sırası; ilk parça verilen kadraj (yalnız
  // itme), sonrakiler ondan yarım ölçüde sapar (uzun grupta art arda aynı kare olmasın).
  const d = DUZEN[v % DUZEN.length], [aci, olc] = shot.ayarli ? [d[0] * 0.5, 1 + (d[1] - 1) * 0.5] : d, m = v % 2 ? 1.12 : 0.82;
  if (shot.kamera) {
    const [, kx0, ky0, kz0, bx0, by0, bz0] = shot.kamera[0];
    const yakin = Math.hypot(kx0 - bx0, ky0 - by0, kz0 - bz0) < 25; // sokak düzeyi: binaya girmesin
    const th = aci * (yakin ? 0.6 : 1), o = yakin ? Math.min(1.2, Math.max(0.8, olc)) : olc;
    const c = Math.cos(th), s = Math.sin(th), n = shot.kamera.length;
    shot.kamera = shot.kamera.map(([t, kx, ky, kz, bx, by, bz], i) => {
      const k = o * (i === n - 1 ? m : 1), dx = kx - bx, dz = kz - bz;
      return [t, bx + (dx * c - dz * s) * k, by + (ky - by) * k, bz + (dx * s + dz * c) * k, bx, by, bz];
    });
  } else if (shot.yorunge && shot.yorunge.hedef !== "zeplin-yer") {
    const y = shot.yorunge, yay = Math.max(Math.abs(y.a1 - y.a0), 0.5) * (Math.sign(y.a1 - y.a0) || 1);
    const o = y.r < 50 ? Math.max(0.85, olc) : olc; // yakın yörünge daha da yaklaşmaz (çardağa, direğe, bacaya girdi, 3 Kasım)
    y.a0 += aci; y.a1 = y.a0 + yay; y.r = +(y.r * o).toFixed(2); y.h = +(y.h * o).toFixed(2);
    if (y.hedef !== "zeplin") y.r1 = +(y.r * m).toFixed(2);
  }
  return shot;
}


/** Çekim kütüphanesi: gerçek adanın sabit ve dinamik açıları (koordinatlar: senaryolar/acilis.mjs notları). */
function CEKIM(ad, v, sure, arayuz) {
  // Kadraj ayarı: kütüphane çekimi hedefi çevresinde döndürülür/uzaklaştırılır (hikâyeden, kod değişmeden).
  if (ad && typeof ad === "object" && ad.yer) return kadraj(CEKIM(ad.yer, ad.varyant ?? v, sure, arayuz), ad);
  const vapurlu = typeof ad === "string" ? ad.startsWith("iskele") : !!ad?.vapur;
  // Bilgi kartlı (arayuz) çekim kartta saati gösterir: gerçek saatte kalır (iskele bile olsa).
  const a = `saat=${!arayuz && vapurlu ? vapurSaati : saat}&hiz=4`;
  if (ad && typeof ad === "object" && ad.kamera) {
    const [p0, p1 = p0] = ad.kamera;
    return { adres: a, kamera: [[0, ...p0], [sure, ...p1]], ayarli: true, ...(arayuz ? { arayuz: true } : {}) };
  }
  // Sakin: site onu bulup izler (evdeyse evinin içi açılır). Kart gizli: telefon düzeninde altyazının üstüne biner.
  if (sakinMi(ad)) return { adres: `${a}&bul=${encodeURIComponent(ad.sakin)}`, serbest: true, isinma: 60, yazilar: [{ metin: "@" + esc(ad.sakin), bas: 0.15, son: sure, yer: "ust" }] };
  const yor = (hedef, r, h, a0, a1, bak = 2) => ({ adres: a, yorunge: { hedef, r, h, a0, a1, bak } });
  const L = {
    ucus: () => ({ adres: a, kamera: v % 2 ? [[0, 160, 150, 380, 0, 0, -40], [sure, 120, 110, 300, 0, 0, -20]] : [[0, -150, 120, 420, 0, 0, 40], [sure, -95, 80, 300, 0, 0, 15]] }),
    // Vapur dakika 0-7 (mod 20) arasında iskelede: 16:40, 19:40 uygun.
    // Tek v: sudan, vapurun yanından yakın açı. (6 Kasım: eski yakın açı [-11,6.5,236 → -22,4,184] karaya, bir evin
    // cephesine bakıyordu, karede vapur yoktu; eski iskele2 [30,14,250] vapurun çatısının içindeydi.)
    iskele: () => ({ adres: a, kamera: v % 2 ? [[0, -33, 15, 227, 0, 2, 232], [sure, -26.5, 11.5, 229, 1, 2, 235]] : [[0, -40, 24, 186, 0, 2, 232], [sure, -30, 18, 194, 1, 2, 235]] }),
    iskele2: () => ({ adres: a, kamera: [[0, -14, 7, 214, 6, 5, 244], [sure, -12, 6.5, 220, 6, 5, 244]] }),
    meydan: () => ({ adres: a, kamera: v % 2 ? [[0, 9, 1.7, -11, 0, 10.5, -25.5], [sure, 5, 2.2, -14, 0, 11, -25.5]] : [[0, 26, 13, 30, 0, 5, -22], [sure, 19, 10, 23, 0, 6, -24]] }),
    meydan2: () => ({ adres: a, kamera: [[0, 9, 1.7, -11, 0, 10.5, -25.5], [sure, 5, 2.2, -14, 0, 11, -25.5]] }),
    fener: () => ({ adres: a, kamera: [[0, 700, 45, 260, 791, 4, 178], [sure, 715, 40, 250, 791, 4, 178]] }),
    fener2: () => ({ adres: a, kamera: [[0, 812, 22, 205, 791, 18, 178], [sure, 806, 24, 210, 791, 19, 178]] }),
    siradaki: () => yor("siradaki", 48, 30, 0.6 + v, 1.1 + v, 2),
    // Zeplin: yanından, gidişine göre dönen kamera (dikey kadraja sığacak uzaklıkta); ikincisi iskeleden bakış.
    zeplin: () => yor("zeplin", 150, -18, 1.1 + 0.3 * v, 1.6 + 0.3 * v, 0),
    zeplin2: () => yor("zeplin-yer", 0, 0, 0, 0, 0),
    yakamoz: () => yor([0, -270], 160, 110, 0.4 + v, 0.75 + v, 0),
    kapanis: () => ({ adres: a, kamera: [[0, 160, 180, 420, 0, 0, -60], [sure, 200, 250, 500, 0, 0, -80]], yazilar: [{ metin: "Takip et,<br>adaya taşın.", alt: `TikTok'ta<br><small>@${TIKTOK}</small>`, bas: 0.2, son: sure, yer: "ust" }] }),
  };
  // "isyeri:firin:0": o iş yerinin kapısı çevresinde, binanın önünden dönen kamera (açı kaydet.mjs'de bina yönüne göre).
  // Açık alan iş yerleri uzaktan ve yüksekten (6 Kasım: Balıkçı Koyu 26 m'den kulübe çatısını gösteriyordu; 62/20'de
  // koy, tekneler ve iskele kadrajda).
  const ISYERI_UZAK = { balikci_koyu: [62, 20] };
  if (typeof ad === "string" && ad.startsWith("isyeri:")) L[ad] = () => { const a0 = -0.3 + 0.5 * (v % 2), [r, h] = ISYERI_UZAK[ad.split(":")[1]] ?? [26, 11]; return yor(ad, r, h, a0, a0 + 0.5, 3); };
  const shot = (L[ad] ?? L.ucus)();
  // Zeplin henüz açılmadıysa çekimde önizleme olarak gösterilir (?zeplin); metin bunu söylemeli ("150. sakinde").
  if (typeof ad === "string" && ad.startsWith("zeplin") && !sim.isOpen("zeplin")) shot.adres += "&zeplin";
  if (arayuz) shot.arayuz = true;
  return shot;
}

/** {aci, uzak, yuk}: kamera hedef çevresinde aci kadar döner, yatay uzaklık ×uzak, hedefe göre yükseklik ×yuk. */
function kadraj(shot, { aci = 0, uzak = 1, yuk = 1 }) {
  shot.ayarli = true;
  if (shot.kamera) {
    const c = Math.cos(aci), s = Math.sin(aci);
    shot.kamera = shot.kamera.map(([t, kx, ky, kz, bx, by, bz]) => {
      const dx = kx - bx, dz = kz - bz;
      return [t, bx + (dx * c - dz * s) * uzak, by + (ky - by) * yuk, bz + (dx * s + dz * c) * uzak, bx, by, bz];
    });
  } else if (shot.yorunge && shot.yorunge.hedef !== "zeplin-yer") {
    const y = shot.yorunge;
    y.a0 += aci; y.a1 += aci; y.r = +(y.r * uzak).toFixed(2); y.h = +(y.h * yuk).toFixed(2);
  }
  return shot;
}

const S = { ...S0, olcek: 2, gecis: X, muzik: "cikti/muzik/ada-1.mp3", fps: 30, w: 1080, h: 1920, cekimler, aciklama };
writeFileSync(`${out}/senaryo.json`, JSON.stringify(S, null, 2));

if (dene) {
  // Çekim listesi (numara → yer, cümleler): kadrajı düzeltilecek çekimi seçmek için.
  kesitler.forEach((k, i) => console.log(`  çekim ${i + 1}: ${JSON.stringify(k.cekim)} · ${cekimler[i].sure} sn · ${cumleler.slice(k.ilk, k.son + 1).map((x) => x.ses).join(" / ")}`));
  if (!cekimler[Number(dene) - 1]) { console.error(`çekim ${dene} yok (1–${cekimler.length})`); process.exit(1); }
}
// --- çizim: site derlenir, yerel önizleme sunucusu açılır, kaydet.mjs çalışır ---
const PORT = 4179;
execFileSync("npx", ["vite", "build"], { cwd: resolve(HERE, "../web"), stdio: "ignore" });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: resolve(HERE, "../web"), stdio: "ignore", detached: true });
try {
  await new Promise((ok) => setTimeout(ok, 3000));
  execFileSync("node", ["kaydet.mjs", `${out}/senaryo.json`, ...(onizleme ? ["--onizleme"] : []), ...(dene ? ["--cekim", dene] : [])], { stdio: "inherit", env: { ...process.env, SITE: `http://localhost:${PORT}/` } });
} finally {
  try { process.kill(-server.pid); } catch {}
}
if (dene) {
  // Baş/orta/son kare yan yana: kadrajı Read ile kontrol et.
  const n = Number(dene), c = cekimler[n - 1], mp4 = `${out}/cekim${n}.mp4`, jpg = `${out}/cekim${n}-kareler.jpg`;
  const zaman = [0.1, c.sure / 2, Math.max(0.1, c.sure - 0.25)];
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...zaman.flatMap((t) => ["-ss", t.toFixed(2), "-i", mp4]),
    "-filter_complex", "[0:v]scale=360:-2[a];[1:v]scale=360:-2[b];[2:v]scale=360:-2[c];[a][b][c]hstack=3", "-frames:v", "1", "-q:v", "3", jpg]);
  const grup = kesitler[n - 1];
  console.log(`çekim ${n}/${cekimler.length}: ${JSON.stringify(grup.cekim)} · ${c.sure} sn · cümleler: ${cumleler.slice(grup.ilk, grup.son + 1).map((x) => x.ses).join(" / ")}`);
  console.log("kareler:", jpg);
  process.exit(0);
}
const video = `${out}/${ad.split("/").pop()}${onizleme ? "-onizleme" : ""}.mp4`;

// Durum: bir sonraki çalıştırmada "bugün ne değişti" buna göre bulunur.
if (!args.includes("--onizleme")) {
  durum.zirve = level;
  durum.istekler = Object.fromEntries(residents.filter((r) => named(r) && r.overrides).map((r) => [r.handle, r.overrides]));
  if (konuId) durum.konular = [...new Set([...durum.konular, konuId])];
  if (tur === "sakin") durum.sakinler = [...new Set([...durum.sakinler, ...etiketler])].slice(-500);
  durum.son = { tarih, yuva, tur, video };
  writeFileSync(durumYolu, JSON.stringify(durum, null, 2));
}

// TikTok bağlıysa (node tiktok.mjs baglan) video gelen kutusuna taslak olarak gider; olmazsa dosyadan yüklenir.
let taslak = null;
// --taslaksiz: TikTok'a yükleme (Mac'teki otomatik üretim videoyu sosyal sistemin takvimine verir, taslağı o gönderir).
if (!args.includes("--onizleme") && !args.includes("--taslaksiz") && existsSync(resolve(HERE, "../secret/tiktok-dev/token.json"))) {
  try {
    taslak = await yukle(video);
    console.log("TikTok taslağı:", taslak.publish_id);
  } catch (e) {
    console.log("TikTok'a yüklenemedi:", e.message);
  }
}

if (args.includes("--bildir")) {
  // Açıklama panoya; bildirim paylaşma saatini söyler.
  try { execFileSync("pbcopy", { input: aciklama }); } catch {}
  const msg = taslak
    ? `Video TikTok gelen kutunda (taslak). Açıklama panoda. Paylaşım: ${SAAT[yuva]}`
    : `Video hazır (${tur}), dosyadan yükle. Açıklama panoda. Paylaşım: ${SAAT[yuva]}`;
  try { execFileSync("osascript", ["-e", `display notification ${JSON.stringify(msg)} with title "Mercanada" subtitle ${JSON.stringify(video.split("/").pop())}`]); } catch {}
}
console.log("video:", video);
if (args.includes("--ac")) try { execFileSync("open", [out]); } catch {}
