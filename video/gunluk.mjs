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
// "tasinCekim": "Takip eden adaya taşınıyor" karesi (varsayılan "iskele"), "acilis": videonun İLK cümlesinin çekimi
// (varsayılan "bayrak": meydan gönderinde dalgalanan bayrak, kart yok; null = açılış çekimi yok)}. "ilk" bir dizi de
// olabilir (imza cümleleri sırayla bu çekimlere bölünür, bilgi kartı yalnız ilkinde). İmza ve kapanış yine standarttan gelir. --ac: üretim bitince klasörü Finder'da açar.
// Çekim tanımı (cekim/ilk/onsozCekim/soruCekim/tasinCekim öğeleri): "iskele" (kütüphane adı) | {"sakin": "ad", "yon"?: 1|-1 (kameranın dönüş yönü; varsayılan sırayla)} |
//   kadraj ayarı {"yer": "iskele", "aci": rad (hedef çevresinde döndür, + saat yönünün tersi), "uzak": çarpan,
//   "yuk": yükseklik çarpanı, "varyant": n (kütüphanedeki n. açı)} | ham kamera {"kamera": [[kx,ky,kz, bx,by,bz] başta,
//   [..] sonda], "vapur": true (iskelede vapur dakikası)}. Ayarlı/ham çekim otomatik döndürülmez (yalnız itme/çekme);
//   2,6 sn'yi geçip bölünürse sonraki parçalar ondan yarım ölçüde sapar, ya da "parcalar": [{aci, uzak, yuk}] ile
//   parça başına kadraj (kamera için {"kamera": ..} de olur).
// Özel gün alanları (10 Kasım 2026 anması için eklendi; başka günlerde de kullanılabilir):
//   çekim nesnesinde "saat": "HH:MM[:SS]" (bugünün o anı; YALNIZ o gün gerçekten olmuş bir olayı geri göstermek için,
//   ör. 09:05 saygı duruşu) ve "hiz" (benzetim hızı, varsayılan 4), "efekt": "siren" | "vapur" (çekimin başında
//   başlayan ses efekti, efekt.mjs) ya da {"ad", "sure", "ses": dB}; hikâyede "imza": false | [cümleler] (kilit sayacı
//   yerine), "kapanis": [cümleler] (soru + "takip eden taşınıyor" kapanışı yerine) + "kapanisCekim": [çekimler] +
//   "sonYazi": {"metin", "alt"} (son karede yazı), "muzik": null (müziksiz) | dosya, "aciklama": TikTok açıklamasının
//   tamamı, "etiketsiz": true (sakinlerin ad etiketleri hiç görünmez), "sonBekle": sn (son cümleden sonra kalan süre).
//   Cümlede "ara": sn (öncesine sessizlik; vuruştan uzun durak, ör. sirenin duyulduğu an) ve "{nufus}" (adadaki
//   sakin sayısı; seste yazıyla, altyazıda rakamla). Deneme için --tarih YYYY-AA-GG sitenin tarihini değiştirir.
// Hareket dili (16 Kasım 2026; ayrıntı video/cikti/VIDEO-REHBERI.md §8): her çekime otomatik bir kamera hareketi atanır;
//   art arda iki çekim aynı aileden olmaz, ~25 sn'lik video ≥4 farklı hareket kullanır. Çekim nesnesinde (ör. {"yer":
//   "meydan", ...}) isteğe bağlı: "hareket": itme | yorunge | vinc | yanKay | alcak | tele | el | whip | vertigo | drone |
//   takip | yanTakip (zorlar; bölünen çekimde yalnız ilk parça), "yon": ±1 (yan kayma/dönüş/whip yönü; vertigo -1 =
//   içeri), "sarsinti": 0–1 (el kamerası), "fov": derece (varsayılan 40; tele 16), "gecis": kesme | solma | kaydir |
//   flas | yakinlas (bu çekime GİRİŞ; varsayılan çoğunlukla kesme, whip'e kaydir, çarpma/gök efektine flas).
//   Yalnız "yer" verilirse (aci/uzak/yuk/varyant yok) kadraj elle sayılmaz, hareket serbest seçilir; elle kadraj korunur
//   (yalnız itme/yorunge, el, whip).
// Olay çekimleri (günün olayı, web/src/world/olay-plan.js): "olay" (geniş), "olay-yakin" (sokak düzeyi, el kamerası),
//   "olay-kalabalik" (seyircilerin yüzleri), "olay-arac:<itfaiye|polis|cekici|ambulans>" (aracı izler; saat sayfadan:
//   yoldayken, çekici yüklerken), "olay-tele" (uzaktan dar açı, haber görüntüsü), "olay-hava" (fırtına/sis: deniz ve
//   gökyüzü). Saat verilmezse olaya uygun an (OLAY_ANI). "saat": "olay+12" (başından dk, kesirli/eksi) | "olay:<evre>"
//   (evre ortası) | "olay:<evre>+N" (evre başından N dk). Bugün olay yoksa olay çekimleri meydan/uçuşa düşer (UYARI).
//   Çekim listesi her üretimde hareketi, çözülen saati ve geçişi yazar. Deneme: --olay kaza --olaysaat 08:33 (olayı
//   zorlar), --ad test-x (ayrı çıktı klasörü). Efektler: siren, vapur, siren-arac, carpisma, gok, yagmur, korna, su,
//   kalabalik (efekt.mjs; "efekt": ad | {ad, sure, ses dB, bas sn} | dizi | false; araç çekiminde siren, fırtınada
//   yağmur kendiliğinden).
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
import { efekt, EFEKT_SES, EFEKTLER } from "./efekt.mjs";
import { olayGunu, olayEvre } from "../web/src/world/olay-plan.js";
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
// Günün olayı (16 Kasım; web/src/world/olay-plan.js, site aynı planı hesaplar). --olay/--olaysaat yalnız deneme: olayı
// zorlar ve çekim adreslerine aynı parametreleri ekler (sayfa da zorlanır).
const olayZorla = opt("--olay"), olaySaatZorla = opt("--olaysaat");
const olayGun = opt("--tarih") ? Date.parse(opt("--tarih") + "T00:00:00Z") / 86400000 : today;
const olay = olayGunu(olayGun, sim.isOpen, { zorla: olayZorla, saat: olaySaatZorla ? dakika(olaySaatZorla) : undefined });
const olayAdres = olayZorla ? `&olay=${olayZorla}${olaySaatZorla ? "&olaysaat=" + olaySaatZorla : ""}` : "";
if (olay) console.log(`günün olayı: ${olay.ad} (${olay.tur}) ${saatYaz(olay.bas)}–${saatYaz(olay.son)}${olayZorla ? " [zorlandı]" : ""}`);
const stages = catalog.gelisim;
// Sıradaki adım sitedeki kartla aynı (layout.js nextStage): ana adımlar + çarşının yeni dükkânları (carsi:n, gelisim_dukkan);
// 16 Kasım provası: video "Kumsal Kahvecisi için 18 kişi" derken site "Çarşıda yeni dükkân · 8 sakin daha" diyordu.
const dukkan = catalog.gelisim_dukkan ? Array.from({ length: 400 }, (_, n) => ({ nufus: catalog.gelisim_dukkan.ilk + n * catalog.gelisim_dukkan.aralik, ad: "Çarşıda yeni dükkân" })) : [];
const next = [...stages, ...dukkan].filter((s) => s.nufus > level).sort((a, b) => a.nufus - b.nufus || (b.acar ? 1 : 0) - (a.acar ? 1 : 0))[0];
// Kaç kişi daha: eşik gelişim düzeyine göre (sitedeki kartla aynı, ui.js): ayrılanların sırası yeniden verilmez.
const need = next ? Math.max(1, next.nufus - level) : 0;

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

let tur, govde = [], soru, cekim = [], etiketler = [], saat = "16:40", konuId = null, ozelKanca = null, imza2 = null, ilkCekim = "ucus", ornek = "balıkçı", soruCekim = null, onsoz = [], onsozCekim = null, tasinCekim = "iskele", acilis = "bayrak";
let imzaOzel = null, kapanisOzel = null, kapanisCekim = null, sonYazi = null, muzik = "cikti/muzik/ada-1.mp3", ozelAciklama = null, etiketsiz = false, sonBekle = 1.2;
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
  // "{nufus}": seste yazıyla (say), altyazıda rakamla (fmt). "ara": cümleden önce sessizlik (sn).
  const yerlestir = (t, f) => t?.replaceAll("{nufus}", f(N));
  const cc = (x) => {
    const yazi = x.yazi ? yerlestir(x.yazi, fmt) : x.ses.includes("{nufus}") ? yerlestir(x.ses, fmt) : null;
    return { ...c(yerlestir(x.ses, say), yazi, !!x.vurus), ...(x.ara ? { ara: x.ara } : {}) };
  };
  tur = h.tur ?? "ozel"; govde = h.govde.map(cc); soru = h.soru ? cc(h.soru) : null; cekim = h.cekim; etiketler = h.etiketler ?? [];
  if (h.imza !== undefined) imzaOzel = h.imza === false ? [] : h.imza.map(cc);
  if (h.kapanis) { kapanisOzel = h.kapanis.map(cc); kapanisCekim = h.kapanisCekim ?? null; sonYazi = h.sonYazi ?? null; }
  if (h.muzik !== undefined) muzik = h.muzik;
  ozelAciklama = h.aciklama ?? null; etiketsiz = !!h.etiketsiz; sonBekle = h.sonBekle ?? sonBekle;
  saat = h.saat ?? saat; ozelKanca = h.kanca ?? null;
  imza2 = h.imza2 ? cc(h.imza2) : null;
  // Elle yazılan imza2 sitedeki karttan farklı sayı söylemesin (17 Kasım QC: dün gece yazılan "sekiz kişi" sabah kartta "1").
  if (imza2 && next && !String(imza2.yazi ?? imza2.ses).includes(fmt(need)) && !String(imza2.ses).includes(say(need)))
    console.log(`UYARI: imza2 elle verilmiş ama sitedeki kart "${next.ad} · ${fmt(need)} sakin daha" diyor: imza2'yi sil (otomatik cümle kartla aynı)`);
  ilkCekim = h.ilk ?? ilkCekim; ornek = h.ornek ?? ornek; soruCekim = h.soruCekim ?? null;
  tasinCekim = h.tasinCekim ?? tasinCekim;
  onsoz = (h.onsoz ?? []).map(cc); onsozCekim = h.onsozCekim ?? null;
  if (h.acilis !== undefined) acilis = h.acilis;
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
function dakika(t) { const [h, m, sn = 0] = t.split(":").map(Number); return h * 60 + m + sn / 60; }
function saatYaz(m) { return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m) % 60).padStart(2, "0")}`; }
const vapurSaati = ferryOut(dakika(saat)) === 0 && ferryOut(dakika(saat) + 1) === 0 ? saat : saatYaz(nextArrival(dakika(saat)) + 1);
if (vapurSaati !== saat) console.log(`vapur ${saat}'te iskelede değil: iskele çekimleri ${vapurSaati}`);

// İmza (kilit sayacı) ve kapanış (soru + takip + istek kalıbı). "onsoz" (isteğe bağlı) imzadan önce, ilk çekimde
// söylenen vurucu açılış (izleyici ilk 1–2 sn'de kaydırıyor): gerçek bir çelişki, ör. "Adada beş zeplin pilotu var."
const imza = [...onsoz, ...(imzaOzel ?? (N === 0
  ? [c("Bu adada kimse yaşamıyor."), c(`${next.ad} için ${say(need)} kişi lazım.`, `${next.ad} için ${fmt(need)} kişi lazım.`)]
  : [c(`Bu adada ${say(N)} kişi yaşıyor.`, `Bu adada ${fmt(N)} kişi yaşıyor.`), ...(imza2 ? [imza2] : next ? [c(`${next.ad} için ${say(need)} kişi daha lazım.`, `${next.ad} için ${fmt(need)} kişi daha lazım.`)] : [])]))];
const kapanis = kapanisOzel ?? [soru, c("Takip eden adaya taşınıyor."), c("Mesleğini sen seç."), c(`Yorumuna yaz: meslek, ${ornek}.`, `Yorumuna yaz:\nmeslek: ${ornek}`)];
const cumleler = [...imza, ...govde, ...kapanis];
// "onsozCekim" verilirse önsöz kendi çekimlerinde (bilgi kartı yok, ilk kare temiz), imza ardından ilk çekimde.
// Açılış (7 Kasım, kullanıcı: "bayrakla başlayan videolar daha çok izlendi, varsayılan olsun ama kurgu bayrak etrafında
// dönmesin"): videonun İLK cümlesi kendi çekiminde, varsayılan "bayrak" (kart yok, bölünmez). Bayrak yalnız burada;
// önsözün kalan cümleleri onsozCekim'e, imza "ilk"e sırayla dağılır.
const A = acilis ? 1 : 0;
const onGrup = onsoz.length && onsozCekim ? onsoz.length : 0;
const imzaBas = Math.max(onGrup, A);
const ilkler = Array.isArray(ilkCekim) ? ilkCekim : [ilkCekim];
const gruplar = [
  ...(A ? [{ cekim: acilis, acilis: true, ilk: 0, son: 0 }] : []),
  ...(onGrup > A ? splitGovde(onGrup - A, onsozCekim).map(([a, b, ck]) => ({ cekim: ck, ilk: A + a, son: A + b })) : []),
  ...(imza.length > imzaBas ? splitGovde(imza.length - imzaBas, ilkler).map(([a, b, ck], i) => ({ cekim: ck, ...(i === 0 ? { arayuz: true } : {}), ilk: imzaBas + a, son: imzaBas + b })) : []),
  ...splitGovde(govde.length, cekim).map(([a, b, ck]) => ({ cekim: ck, ilk: imza.length + a, son: imza.length + b })),
  // Kapanış üç çekim: soru (konunun son açısı), "takip eden adaya taşınıyor" (iskele), istek kalıbı (yazılı son kare).
  // Özel kapanışta ("kapanis"): cümleler kapanisCekim'e bölünür, son karede sonYazi.
  ...(kapanisOzel
    ? splitGovde(kapanis.length, kapanisCekim ?? [cekim.at(-1)]).map(([a, b, ck], i, arr) => ({ cekim: ck, ilk: imza.length + govde.length + a, son: imza.length + govde.length + b, ...(i === arr.length - 1 ? { sonYazi: true } : {}) }))
    : [
      { cekim: soruCekim ?? (sakinMi(cekim.at(-1)) ? "meydan" : cekim.at(-1)), varyantEk: 1, ilk: imza.length + govde.length, son: imza.length + govde.length },
      { cekim: tasinCekim, tasin: true, ilk: imza.length + govde.length + 1, son: imza.length + govde.length + 1 },
      { cekim: "kapanis", ilk: imza.length + govde.length + 2, son: cumleler.length - 1 },
    ]),
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

const ad = opt("--ad") ? `gunluk/${opt("--ad")}` : `gunluk/${tarih}-${yuva}`; // --ad: yalnız deneme (ayrı çıktı klasörü)
const out = resolve("cikti", ad);
mkdirSync(out, { recursive: true });
const aralar = Object.fromEntries(cumleler.map((x, k) => [k, x.ara ?? (x.vurus ? 0.35 : 0)]).filter(([, d]) => d));
const S0 = { ad, seslendirme: cumleler.map(({ ses, yazi }) => ({ ses, ...(yazi ? { yazi } : {}) })), aralar };

console.log(`${tarih} ${yuva} · ${tur}${konuId ? ` (${konuId})` : ""} · nüfus ${N}, takipçi ${takipci}`);
for (const x of cumleler) console.log("   " + x.ses + (x.vurus ? "   [vuruş]" : ""));

// --- açıklama (etkileşim: kanca + soru + istek kalıbı + etiketler) ---
const kanca = ozelKanca ?? { acilis: `Bugün adada yeni bir yer açıldı 🏗️`, yeniler: `Bugün ${fmt(yeniler.length)} kişi Mercanada'ya taşındı 🧳`, istek: "Yorumlardan gelen istek işlendi ✍️", sakin: "Bir sakinin günü 👀", bos: "Bu adada henüz kimse yaşamıyor 🏝️" }[tur];
const aciklama = ozelAciklama ?? [
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
const X = 0.12, bitis = son(cumleler.length - 1) + sonBekle, PARCA = 2.6;
const kesitler = [];
gruplar.forEach((g, gi) => {
  const t0 = gi === 0 ? 0 : bas(g.ilk) - 0.15;
  const t1 = gi === gruplar.length - 1 ? bitis : bas(gruplar[gi + 1].ilk) - 0.15;
  const sakin = sakinMi(g.cekim);
  // Bölme eşiğinde %12 pay: grup 2,6 sn'ye çok yakınken ses yenilenince kendiliğinden ikiye bölünüp AYNI/BENZER
  // veriyordu (7 Kasım kod notu). Açılış çekimi hiç bölünmez.
  // Özel kapanışın son karesi (yazılı) bölünmez.
  const parca = g.cekim === "kapanis" || g.acilis || g.sonYazi ? 1 : Math.max(1, Math.ceil((t1 - t0) / (sakin ? 4.2 : PARCA) - 0.12));
  for (let k = 0; k < parca; k++) kesitler.push({ ...g, parca: k, g0: t0, cekim: sakin && k > 0 ? "meydan" : g.cekim, t0: t0 + ((t1 - t0) * k) / parca, t1: t0 + ((t1 - t0) * (k + 1)) / parca });
});
/** Yer başına hareket seçenekleri (ilk sıradaki doğal olanı: itme = kütüphane anahtar kareleri, yorunge = dönen kamera).
 *  bayrak (alçaktan yükselen açılış) ve zeplin2 sabit; anma çekimleri yalnız itme. */
const SECENEK = {
  ucus: ["itme", "drone", "vertigo"], // yanKay yok: meydana kayıp adanın ölçeği kayboluyordu (17 Kasım QC; Driftwood'la aynı)
  iskele: ["itme", "yanKay", "tele", "vinc", "alcak"],
  iskele2: ["itme", "yanKay", "whip", "el"],
  meydan: ["itme", "vinc", "alcak", "whip", "drone", "yanKay", "el"],
  meydan2: ["itme", "vinc", "alcak", "whip", "yanKay", "el"],
  fener: ["itme", "tele", "vinc", "drone"],
  fener2: ["itme", "whip", "yanKay"],
  siradaki: ["yorunge", "vinc", "drone"],
  yakamoz: ["yorunge", "drone", "tele"],
  zeplin: ["yorunge", "tele"],
  isyeri: ["yorunge", "alcak", "yanKay", "whip", "vinc", "el"],
};
/** Dönüştürmede anahtar kare yerine kullanılacak temel kadraj (meydanın varyantları bayrak tepesine bakıyor; uçuş 400 m'de). */
const TEMEL = {
  meydan: { hedef: "meydan", a: 0.46, D: 55, H: 18 },
  meydan2: { hedef: "meydan", a: 0.46, D: 55, H: 18 },
  ucus: { hedef: "meydan", a: -0.33, D: 120, H: 60 },
};
/** Olay çekimleri: temel kadraj ve hareket seçenekleri. */
const OLAY_CEKIM = {
  olay: { D: 45, H: 22, secenek: ["vinc", "yorunge", "drone", "yanKay"] },
  "olay-yakin": { D: 32, H: 3, goz: 2.4, secenek: ["el", "alcak", "whip"], sarsinti: 0.5 },
  "olay-kalabalik": { D: 14, H: 3, secenek: ["yanKay", "el"], sarsinti: 0.3 },
  "olay-tele": { D: 45, H: 20, secenek: ["tele", "yanKay"], sarsinti: 0.2 }, // tek seçenek art arda/sınır üstü tele veriyordu (17 Kasım QC)
  "olay-hava": { D: 120, H: 6, secenek: ["yanKay", "tele"] },
  "olay-arac": { D: 10, H: 3, secenek: ["takip", "yanTakip"] },
};
/** Aynı uyarı bölünen çekimin her parçasında tekrarlanmasın. */
const uyarilan = new Set();
const birKez = (m) => { if (!uyarilan.has(m)) { uyarilan.add(m); console.log(m); } };
/** Olay türüne göre sahnedeki araçlar (olay.js: kazada polis/ambulans/çekici, yangında itfaiye). */
const OLAY_ARACLARI = { kaza: ["polis", "ambulans", "cekici"], yangin: ["itfaiye"] };
/** Saat verilmeyen olay çekiminin anı (olay türü → çekim → saat; araç: o aracın yolda olduğu evre). */
const OLAY_ANI = {
  kaza: { olay: "olay:polis", "olay-yakin": "olay+1.5", "olay-kalabalik": "olay:polis", "olay-tele": "olay:polis", "olay-hava": "olay:polis", arac: { polis: "olay+5.2", ambulans: "olay+7.4", itfaiye: "olay+5.2", cekici: "olay:cekici+3" } },
  yangin: { olay: "olay:sondurme", "olay-yakin": "olay:sondurme", "olay-kalabalik": "olay:sondurme", "olay-tele": "olay:sondurme", "olay-hava": "olay:sondurme", arac: { itfaiye: "olay:alarm", polis: "olay:alarm", ambulans: "olay:alarm" } },
  firtina: { olay: "olay:yagmur", "olay-yakin": "olay:yagmur", "olay-kalabalik": "olay:yagmur", "olay-tele": "olay:yaklasma", "olay-hava": "olay:yaklasma" },
  sis: { olay: "olay:yogun", "olay-tele": "olay:gelis" },
  yunus: { olay: "olay:oyun" },
  balina: { olay: "olay:oyun" },
};
const kullanim = {};
const efektler = [];
// Hareket dili (16 Kasım 2026, kullanıcı: "sürekli bir yerlere yaklaşan çekimler yerine daha karışık ve dikkat çekici"):
// her çekime bir hareket türü atanır (HAREKETLER; kamera kaydet.mjs HAREKET'te). Seçim (yonet): hikâye "hareket" verdiyse
// o; yoksa yerin seçenekleri (SECENEK) içinden, bir önceki çekimle AYNI AİLEDEN OLMAYAN ve videoda en az kullanılmış
// olan (eşitlikte yerin kullanım sırasına göre döner; vertigo en çok 1, drone/tele 2). Elle kadraj (ayarli: aci/uzak/yuk,
// ham kamera) kadrajını korur: yalnız itme/yorunge, el, whip ya da küçük yanKay (kamera o kadrajda kalır). Sabit: bayrak (alçaktan
// yükselen açılış), zeplin2, sakin, kapanış. Ardından geçişler (gecisSec) ve son süreler (önceki çekim sonraki geçiş
// kadar uzun; kaydet.mjs aynı süreyi bindirir).
const HAREKETLER = ["itme", "yorunge", "vinc", "yanKay", "alcak", "tele", "el", "whip", "vertigo", "drone", "takip", "yanTakip"];
const AILE = (t) => (t === "yanTakip" ? "takip" : t);
// Drone ve vertigo yalnız hikâye zorlarsa ("hareket"): kendiliğinden seçildiklerinde çatı sıyıran/rastgele açılış veriyordu
// (16 Kasım deneme videosu). Otomatik seçimde 0.
const SINIR = { vertigo: 0, drone: 0, tele: 2, whip: 2, vinc: 3, el: 3 };
const GECIS = { kesme: 0.1, solma: 0.25, kaydir: 0.2, flas: 0.3, yakinlas: 0.22 };
const hs = { onceki: null, sayac: {}, grup: 0 };
const ham = kesitler.map((k, i) => {
  const sure = +(k.t1 - k.t0 + X).toFixed(3); // geçici; geçişler seçilince düzeltilir
  const anahtar = ckAnahtar(k.cekim);
  const v = (kullanim[anahtar] = (kullanim[anahtar] ?? -1) + 1);
  // "Taşın" karesi iskelenin geniş açısı (v çift): yakın açıda vapurun önüne ev giriyordu (4–5 Kasım raporları).
  if (k.tasin && k.cekim === "iskele") {
    const shot = CEKIM("iskele", 0, sure, false);
    shot.secenek = ["itme", "yanKay"];
    return yonet(shot, k, 0, i);
  }
  // Bölünen ayarlı çekimde parça başına kadraj (7 Kasım kod notu: 2. parçanın sabit 0,3 rad sapması temiz kadrajı
  // bozuyordu): {"yer": .., "aci": .., "parcalar": [{aci, uzak, yuk}, ...]} → k. parça (k ≥ 1) parcalar[k − 1] ile.
  const pk = k.parca > 0 && k.cekim && typeof k.cekim === "object" ? k.cekim.parcalar?.[k.parca - 1] : null;
  if (pk) return yonet(parcaSaati(Object.assign(CEKIM({ ...k.cekim, ...pk, parcalar: undefined, hareket: undefined }, v, sure, k.arayuz), { parcaKadraj: true }), k), k, 0, i);
  return yonet(parcaSaati(CEKIM(k.cekim, v, sure, k.arayuz), k), k, v, i);
});
/** Bölünen olay çekiminde k. parça olayın akışını sürdürür (17 Kasım QC: her parça aynı anı baştan oynatıyordu: polis
 *  aracı aynı yolu iki kez gidiyordu). Parçanın saati, grubun başından geçen süre × sayfa hızı kadar ileri alınır. */
function parcaSaati(shot, k) {
  if (!(k.parca > 0) || !(shot.olayEvreAd || shot.aracAni)) return shot;
  const hiz = Number(/hiz=([\d.]+)/.exec(shot.adres)?.[1] ?? 1) || 1, ofs = ((k.t0 - k.g0) * hiz) / 60; // dakika
  if (shot.aracAni?.oto) { shot.aracAni.ofs = ofs; return shot; } // kaydet.mjs aracın saatini sayfadan bulur, ofs ekler
  const q = /saat=(\d+):(\d+)(?::(\d+))?/.exec(shot.adres);
  if (!q) return shot;
  const sn = Math.min(86399, Math.round((+q[1] * 60 + +q[2] + (+q[3] || 0) / 60 + ofs) * 60));
  shot.adres = shot.adres.replace(/saat=[^&]*/, `saat=${String(Math.floor(sn / 3600) % 24).padStart(2, "0")}:${String(Math.floor(sn / 60) % 60).padStart(2, "0")}:${String(sn % 60).padStart(2, "0")}`);
  return shot;
}
/** Çekimin hareketini seçer ve uygular (bkz. yukarı). */
function yonet(shot, k, v, i) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  shot.sure = +(k.t1 - k.t0 + X).toFixed(3);
  const bitir = (aile, ad) => { hs.onceki = aile; shot.hareketAd = ad; if (ad) hs.sayac[ad] = (hs.sayac[ad] ?? 0) + 1; return shot; };
  if (k.cekim === "kapanis") return bitir("kapanis", "itme");
  if (shot.serbest) return bitir("sakin", "sakin");
  if (shot.sabit) { canlandir(shot, shot.ayarli ? k.parca : v); return bitir(shot.sabit, shot.sabit === "alcak" ? "alcak" : "sabit"); }
  let zorla = k.parca === 0 ? ck?.hareket : null;
  if (zorla && !HAREKETLER.includes(zorla)) { console.log(`UYARI: bilinmeyen hareket "${zorla}" (${HAREKETLER.join(", ")}): yok sayıldı`); zorla = null; }
  const dogal = shot.hareket ? null : shot.kamera ? "itme" : "yorunge";
  // Açılış çekimi (hikâyede ham kamera ile bayrak benzeri): doğal hareketiyle, alçak açı ailesinden sayılır.
  if (k.acilis && !zorla && !shot.hareket) { canlandir(shot, 0); return bitir("alcak", dogal); }
  const zeplinMi = typeof shot.yorunge?.hedef === "string" && shot.yorunge.hedef.startsWith("zeplin");
  const secenek = zorla ? [zorla] : zeplinMi ? ["yorunge", "tele"] : shot.ayarli && !shot.hareket ? [dogal, "el", "whip", "yanKay"] : shot.secenek ?? [dogal ?? "yorunge"];
  // Drone ve vertigo zaman ister: 2 sn'den kısa çekimde (soru karesi vb.) seçilmez (drone hedefe varmadan kesiliyordu).
  const kisa = shot.sure < 2 && !zorla ? secenek.filter((t) => t !== "drone" && t !== "vertigo") : secenek;
  const tur = sec(kisa.length ? kisa : secenek, v);
  if (shot.hareket) shot.hareket.tur = tur;
  else if (tur === dogal) canlandir(shot, shot.parcaKadraj ? 0 : shot.ayarli ? k.parca : v);
  else {
    // Kütüphane kadrajından temel geometri: hedef, açı, uzaklık, yükseklik (kamera: ilk anahtar kare; yörünge: yay ortası).
    let t = shot.ayarli ? null : shot.temel; // elle kadrajda temel, verilen kadrajın kendisi
    if (!t && shot.kamera) {
      const [, kx, ky, kz, bx, by, bz] = shot.kamera[0];
      t = { hedef: [bx, by, bz], a: +Math.atan2(kx - bx, kz - bz).toFixed(3), D: +Math.hypot(kx - bx, kz - bz).toFixed(2), Hb: +(ky - by).toFixed(2) };
    } else if (!t) {
      const y = shot.yorunge;
      t = { hedef: y.hedef, a: +((y.a0 + y.a1) / 2).toFixed(3), D: y.r, H: y.h, bak: y.bak };
    }
    shot.hareket = { tur, ...t, ...(shot.ayarli ? { aciSabit: true } : {}) };
    delete shot.kamera; delete shot.yorunge;
  }
  if (shot.hareket) {
    shot.hareket.yon = ck?.yon ?? (i % 2 ? -1 : 1);
    if (ck?.fov) shot.hareket.fov = ck.fov;
  } else if (ck?.fov) shot.fov = ck.fov;
  if (ck?.sarsinti != null) shot.sarsinti = ck.sarsinti;
  if (tur === "el") shot.sarsinti = Math.max(shot.sarsinti ?? 0, 0.6);
  return bitir(AILE(tur), tur);
}
function sec(secenek, v) {
  if (secenek.length === 1) return secenek[0];
  const n = secenek.length;
  const sira = secenek.map((t, j) => [t, (hs.sayac[t] ?? 0) + (t === "itme" || t === "yorunge" ? 0.6 : 0), (((j - v) % n) + n) % n]);
  const farkli = sira.filter(([t]) => AILE(t) !== hs.onceki);
  const uygun = farkli.filter(([t]) => (hs.sayac[t] ?? 0) < (SINIR[t] ?? 9));
  const izinli = (l) => l.filter(([t]) => (SINIR[t] ?? 9) > 0);
  // Yedek sırası: sınırın altındaki (aile tekrar etse de) → izinli farklı aile → izinli → hepsi (17 Kasım QC: sınır üstü seçiliyordu).
  const altinda = sira.filter(([t]) => (hs.sayac[t] ?? 0) < (SINIR[t] ?? 9));
  const L = (uygun.length ? uygun : altinda.length ? altinda : izinli(farkli).length ? izinli(farkli) : izinli(sira).length ? izinli(sira) : sira).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return L[0][0];
}
/** Çekime GİRİŞ geçişi. Hikâye "gecis" verirse o (ilk parçada); whip'e kaydırma, çarpma/gök efektine flaş, kapanışa
 *  solma, drone'a yakınlaşma; grup içi parçalar kesme; grup sınırlarında çoğunlukla kesme, her üçüncüsü solma. */
function gecisSec(k, shot) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  if (k.parca === 0 && ck?.gecis) {
    if (GECIS[ck.gecis]) return ck.gecis;
    console.log(`UYARI: bilinmeyen geçiş "${ck.gecis}" (${Object.keys(GECIS).join(", ")}): otomatik`);
  }
  const efs = k.parca === 0 ? [ck?.efekt].flat().map((e) => (typeof e === "string" ? e : e?.ad)) : [];
  if (shot.hareketAd === "whip") return "kaydir";
  if (efs.includes("carpisma") || efs.includes("gok")) return "flas";
  if (k.cekim === "kapanis") return "solma";
  if (k.parca > 0) return "kesme";
  if (shot.hareketAd === "drone") return "yakinlas";
  return ++hs.grup % 3 === 0 ? "solma" : "kesme";
}
const gecisler = ham.map((shot, i) => (i ? gecisSec(kesitler[i], shot) : null));
const cekimler = ham.map((shot, i) => {
  const k = kesitler[i], sure = +(k.t1 - k.t0 + (i < ham.length - 1 ? GECIS[gecisler[i + 1]] : 0)).toFixed(3);
  // Anahtar karelerin zamanı yeni süreye ölçeklenir.
  if (shot.kamera) shot.kamera = shot.kamera.map(([t, ...r]) => [+((t * sure) / shot.sure).toFixed(3), ...r]);
  shot.sure = sure;
  if (i) shot.gecis = { tur: gecisler[i], sure: GECIS[gecisler[i]] };
  return ozellik(k, i, shot);
});
// Fırtına çekimlerinde tek yağmur yatağı: art arda olay çekimleri boyunca (çekim başına ayrı başlayınca dalgalanıyordu).
for (let i = 0; i < cekimler.length; i++) {
  if (!cekimler[i].yagmur) continue;
  let j = i;
  while (j + 1 < cekimler.length && cekimler[j + 1].yagmur) j++;
  const t0 = kesitler[i].t0, t1 = kesitler[j].t1 + 0.4;
  efektler.push({ dosya: efekt("yagmur", resolve("cikti/efekt"), +(t1 - t0).toFixed(1)), bas: +t0.toFixed(3), ses: EFEKT_SES.yagmur, ad: "yagmur" });
  i = j;
}
/** Çekime hikâyeden gelen ekler: ses efekti (çekimin başında + "bas" sn; dizi olabilir; bölünmüş çekimde yalnız ilk
 *  parçada; olay araçlarında otomatik siren, "efekt": false kapatır), ad etiketsiz, son yazı. */
function ozellik(k, i, shot) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  const kapali = ck && (ck.efekt === false || ck.efekt === null);
  const efs = k.parca === 0 && ck?.efekt ? [ck.efekt].flat() : k.parca === 0 && !kapali ? shot.otoEfekt ?? [] : [];
  for (const e0 of efs) {
    const e = typeof e0 === "string" ? { ad: e0 } : e0;
    if (!e?.ad) continue;
    // Bilinmeyen efekt üretimi durdurmaz (17 Kasım QC: efekt.mjs hata fırlatıp bütün koşuyu bitiriyordu).
    if (!EFEKTLER.includes(e.ad)) { birKez(`UYARI: bilinmeyen efekt "${e.ad}" (${EFEKTLER.join(", ")}): atlandı`); continue; }
    efektler.push({ dosya: efekt(e.ad, resolve("cikti/efekt"), e.sure), bas: +(k.t0 + (e.bas ?? 0)).toFixed(3), ses: e.ses ?? EFEKT_SES[e.ad] ?? null, ad: e.ad });
  }
  if (kapali) delete shot.yagmur;
  delete shot.otoEfekt;
  if (etiketsiz) shot.etiketsiz = true;
  // Son yazı anlatım bitince belirir (altyazıyla çakışmaz); varsayılan alt kısımda, koyu "yas" biçiminde.
  if (k.sonYazi && sonYazi) shot.yazilar = [{ metin: sonYazi.metin, ...(sonYazi.alt ? { alt: sonYazi.alt } : {}), bas: Math.max(0.25, son(cumleler.length - 1) + 0.3 - k.t0), son: shot.sure + 1, yer: sonYazi.yer ?? "alt", stil: sonYazi.stil ?? "yas" }];
  return shot;
}
// Art arda iki çekim aynı kalmasın (aynı adres + kamera): olursa ikincisi döndürülür (güvenlik ağı).
for (let i = 1; i < cekimler.length; i++) {
  const ayni = (a, b) => a.adres === b.adres && JSON.stringify(a.kamera ?? a.yorunge ?? a.hareket ?? null) === JSON.stringify(b.kamera ?? b.yorunge ?? b.hareket ?? null);
  if (ayni(cekimler[i - 1], cekimler[i]) && !cekimler[i].serbest) {
    if (cekimler[i].hareket) { cekimler[i].hareket.yon = -(cekimler[i].hareket.yon ?? 1); cekimler[i].hareket.a = (cekimler[i].hareket.a ?? 0) + 0.6; }
    else canlandir(cekimler[i], 3);
  }
}
// Çekim listesi (her üretimde): yer, hareket, süre, ada saati (olay çekiminde çözülmüş saat), giriş geçişi, cümleler.
kesitler.forEach((k, i) => {
  const c = cekimler[i], sa = /saat=([^&]*)/.exec(c.adres)?.[1];
  console.log(`  çekim ${i + 1}: ${JSON.stringify(k.cekim)} · ${c.hareketAd ?? "-"}${c.sarsinti ? ` (sarsıntı ${c.sarsinti})` : ""} · ${c.sure} sn · saat ${sa}${c.olayBek ? ` [olay ${c.olayEvreAd ?? ""}]` : ""} · giriş ${c.gecis?.tur ?? "-"} · ${cumleler.slice(k.ilk, k.son + 1).map((x) => x.ses).join(" / ")}`);
});
const turSay = new Set(cekimler.map((c) => c.hareketAd).filter((t) => t && t !== "sakin" && t !== "sabit"));
console.log(`  hareketler: ${turSay.size} tür (${[...turSay].join(", ")})`);

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
  // Yalnız "yer" (+ hareket/saat/efekt…) verilirse kadraj elle sayılmaz: hareket seçimi serbest kalır.
  if (ad && typeof ad === "object" && ad.yer) {
    const shot = CEKIM(ad.yer, ad.varyant ?? v, sure, arayuz);
    return zaman(ad.aci != null || ad.uzak != null || ad.yuk != null || ad.varyant != null ? kadraj(shot, ad) : shot, ad);
  }
  return zaman(CEKIM0(ad, v, sure, arayuz), ad);
}
/** Çekimin saati/hızı hikâyeden (özel gün: o gün olmuş anı geri göstermek); --tarih ile deneme günü. */
// Olay saati (16 Kasım): "saat": "olay+12" (olay başından 12 dk sonra; kesirli ve eksi olur: "olay-0.2"),
// "olay:<evre>" (o evrenin ortası), "olay:<evre>+N" (evre başından N dk sonra). Olay çekimleri saat verilmezse
// OLAY_ANI'ndaki ana göre (ör. itfaiye aracı yoldayken). Bugün olay yoksa saat değişmez (UYARI).
function zaman(shot, ad) {
  const o = ad && typeof ad === "object" ? ad : {};
  const spec = o.saat ?? shot.olayAni;
  if (o.saat && shot.aracAni) shot.aracAni.oto = false;
  if (spec) {
    const hm = String(spec).startsWith("olay") ? olaySaati(spec, shot) : spec;
    if (hm) shot.adres = shot.adres.replace(/saat=[^&]*/, "saat=" + hm);
  }
  const hiz = o.hiz ?? shot.olayHiz;
  if (hiz) shot.adres = shot.adres.replace(/hiz=[^&]*/, "hiz=" + hiz);
  if (opt("--tarih") && !shot.adres.includes("tarih=")) shot.adres += "&tarih=" + opt("--tarih");
  if (olayAdres && !shot.adres.includes("&olay=")) shot.adres += olayAdres;
  return shot;
}
/** Olay evrelerinin [baş, son] dakikaları (olayEvre taranır; "sonra" en çok 12 sa). */
function olayEvreleri() {
  const E = {};
  for (let m = olay.bas; m <= olay.son + 720; m += 0.05) {
    const e = olayEvre(olay, m);
    if (!e) { if (m > olay.son) break; continue; }
    (E[e.ad] ??= [m, m])[1] = m;
  }
  return E;
}
function olaySaati(spec, shot) {
  const m = /^olay(?::([a-z]+))?([+-]\d+(?:[.,]\d+)?)?$/.exec(String(spec).trim());
  if (!m) { console.log(`UYARI: saat "${spec}" anlaşılmadı (olay+12 | olay:evre | olay:evre+3)`); return null; }
  if (!olay) { console.log(`UYARI: saat "${spec}": bugün olay yok, ada saati değişmedi`); return null; }
  const N = m[2] != null ? Number(m[2].replace(",", ".")) : null;
  let dk;
  if (m[1]) {
    const E = olayEvreleri(), e = E[m[1]];
    if (!e) { console.log(`UYARI: "${olay.tur}" olayında "${m[1]}" evresi yok (${Object.keys(E).join(", ")}): olay başı`); dk = olay.bas + (N ?? 0); }
    else dk = N != null ? e[0] + N : m[1] === "sonra" ? e[0] + Math.min(10, (e[1] - e[0]) / 2) : (e[0] + e[1]) / 2;
  } else dk = olay.bas + (N ?? 0);
  dk = Math.max(0, Math.min(24 * 60 - 0.02, dk));
  const sn = Math.round(dk * 60), hm = `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor(sn / 60) % 60).padStart(2, "0")}:${String(sn % 60).padStart(2, "0")}`;
  shot.olayEvreAd = olayEvre(olay, dk)?.ad ?? "olay dışı";
  if (!olayZorla && !opt("--saat") && dk > dakika(saat) + 0.5) console.log(`UYARI: ${spec} = ${hm} henüz gelmedi (ada saati ${saat}): olay o an sitede yok`);
  return hm;
}
function CEKIM0(ad, v, sure, arayuz) {
  const vapurlu = typeof ad === "string" ? ad.startsWith("iskele") : !!ad?.vapur;
  // Bilgi kartlı (arayuz) çekim kartta saati gösterir: gerçek saatte kalır (iskele bile olsa).
  const a = `saat=${!arayuz && vapurlu ? vapurSaati : saat}&hiz=4`;
  if (ad && typeof ad === "object" && ad.kamera) {
    const [p0, p1 = p0] = ad.kamera;
    return { adres: a, kamera: [[0, ...p0], [sure, ...p1]], ayarli: true, ...(arayuz ? { arayuz: true } : {}) };
  }
  // Sakin: site onu bulup izler (evdeyse evinin içi açılır); dışarıdaysa kamera onun çevresinde döner (sakinYorunge).
  // Kart gizli: telefon düzeninde altyazının üstüne biner. Üstte ayrıca "@ad" yazısı YOK (6 Kasım): sitenin pembe ad
  // etiketi sakinin başında zaten görünüyor, ikisi üst üste binip ad iki kez okunuyordu.
  if (sakinMi(ad)) return { adres: `${a}&bul=${encodeURIComponent(ad.sakin)}`, serbest: true, isinma: 60, sakinYorunge: { yon: ad.yon ?? (v % 2 ? -1 : 1) } };
  const yor = (hedef, r, h, a0, a1, bak = 2) => ({ adres: a, yorunge: { hedef, r, h, a0, a1, bak } });
  const L = {
    // Açılış: meydan gönderi (0, -25.5; bayrak ~12 m, doğuya uzanır, geniş yüzü güneye) alttan, gökyüzü önünde; kamera
    // yavaşça yükselip yaklaşır. Alçak açı (yer 2,2 m) şantiye kutusunu ve binaları kadraja almaz (7 Kasım: 4,5 m'lik
    // eski bayrak kamerası sıradaki yerin şantiye kutusunu gösterdi). İkinci kullanım (nadir) karşı çapraz.
    // 10 Kasım 09:08'den sonra bayrak yarıda (anma.js): kamera bayrağın indiği yüksekliğe bakar (boş direk tepesi değil).
    bayrak: () => yarida(ad, a) ? { adres: a, kamera: v % 2 ? [[0, 6, 1.8, -14, 1.5, 7.2, -25], [sure, 4.5, 2.0, -16.5, 1.5, 7.4, -25]] : [[0, -5, 1.9, -15, 2.5, 7.2, -25], [sure, -3.5, 1.8, -17.5, 1.5, 7.5, -25]] }
      : { adres: a, kamera: v % 2 ? [[0, 6, 2, -13, 1.5, 12.5, -25], [sure, 4.5, 2.6, -16, 1.5, 12.8, -25]] : [[0, -5, 2.2, -14, 2.5, 12.5, -25], [sure, -3.5, 2, -17, 1.5, 13, -25]] },
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
    // 10 Kasım anma köşesi (web/src/world/anma.js: portre −6,2/−27,6, kürsünün önü z −26,3, çelenk sehpası −25,55;
    // gönder 0/−25,5). anma: portre önden, yavaşça yaklaşır · anma2: kürsünün yanından kalabalığın yüzü · anma3: alttan
    // gönder ve yarıya inen bayrak, portre solda · anma4: yukarıdan tören (kalabalık, kürsü, gönder) · celenk: konan
    // çelenk yakın · karanfil: kürsünün önündeki karanfiller, alçaktan.
    anma: () => ({ adres: a, kamera: v % 2 ? [[0, -3.6, 4.4, -14.5, -6.2, 4.0, -27.6], [sure, -4.6, 4.2, -16.2, -6.2, 4.1, -27.6]] : [[0, -6.2, 4.2, -13.5, -6.2, 4.0, -27.6], [sure, -6.2, 4.0, -15.6, -6.2, 4.1, -27.6]] }),
    anma2: () => ({ adres: a, kamera: [[0, -7.5, 4.2, -25.0, -1.0, 1.4, -15.0], [sure, -7.2, 4.0, -24.4, 0.6, 1.4, -15.0]] }),
    anma3: () => ({ adres: a, kamera: v % 2 ? [[0, 4.2, 4.6, -12.5, 0.8, 7.6, -26.0], [sure, 3.6, 4.4, -13.8, 0.8, 7.6, -26.0]] : [[0, -2.0, 5.5, -3.5, -2.3, 7.0, -26.0], [sure, -2.0, 5.2, -5.5, -2.3, 7.0, -26.0]] }),
    anma4: () => ({ adres: a, kamera: v % 2 ? [[0, -26, 20, -2, -4, 1, -19], [sure, -21, 17, -5, -4, 1, -20]] : [[0, 16, 24, 8, -4, 1, -19], [sure, 11, 20, 3, -4, 1, -20]] }),
    celenk: () => ({ adres: a, kamera: [[0, 0.6, 3.0, -23.0, -6.2, 1.7, -25.3], [sure, 0.0, 2.9, -23.5, -6.2, 1.7, -25.3]] }),
    karanfil: () => ({ adres: a, kamera: [[0, -3.8, 4.4, -23.2, -6.0, 1.5, -26.7], [sure, -4.4, 4.0, -23.6, -6.0, 1.5, -26.7]] }),
  };
  // "isyeri:firin:0": o iş yerinin kapısı çevresinde, binanın önünden dönen kamera (açı kaydet.mjs'de bina yönüne göre).
  // Açık alan iş yerleri uzaktan ve yüksekten (6 Kasım: Balıkçı Koyu 26 m'den kulübe çatısını gösteriyordu; 62/20'de
  // koy, tekneler ve iskele kadrajda).
  // Belediye (7 Kasım kod notu): varsayılan açı (a0 −0,3) ilk karede komşu çatıyı öne alıyordu, a0 ~0,5'te kamera ağaçta
  // başlıyordu; temiz bant a0 ≈ 0,15, alçak (h ~3,5), r ~25: levha, kule ve meydan.
  // Belediyenin iki yanı kapalı (solda komşu bina, sağda ağaçlar; kaydet.mjs bina engelinde kamerayı kapıya kadar
  // çekiyor): ±0,6 otomatik döndürme yok (ayarli), çeşitlilik bant içinde alçak/yüksek iki açıyla.
  const ISYERI_UZAK = { balikci_koyu: [62, 20], belediye: (v) => (v % 2 ? [30, 14] : [25, 3.5]) };
  const ISYERI_ACI = { belediye: [0.15, 0.3] };
  if (typeof ad === "string" && ad.startsWith("isyeri:")) L[ad] = () => {
    const tur = ad.split(":")[1], u = ISYERI_UZAK[tur], [r, h] = typeof u === "function" ? u(v) : u ?? [26, 11], aa = ISYERI_ACI[tur];
    const a0 = aa ? aa[v % 2] : -0.3 + 0.5 * (v % 2);
    return { ...yor(ad, r, h, a0, a0 + 0.5, 3), ...(aa ? { ayarli: true } : {}) };
  };
  if (typeof ad === "string" && ad.startsWith("olay")) return Object.assign(olayCekimi(ad, a, L), arayuz ? { arayuz: true } : {});
  const shot = (L[ad] ?? L.ucus)();
  // Hareket seçenekleri ve dönüştürmede temel kadraj (bkz. yonet).
  const anah = typeof ad === "string" ? (ad.startsWith("isyeri:") ? "isyeri" : ad) : null;
  if (anah && SECENEK[anah]) shot.secenek = SECENEK[anah];
  if (anah && TEMEL[anah]) shot.temel = TEMEL[anah];
  if (anah === "bayrak") shot.sabit = "alcak";
  if (anah === "zeplin2") shot.sabit = "sabit";
  // Zeplin henüz açılmadıysa çekimde önizleme olarak gösterilir (?zeplin); metin bunu söylemeli ("150. sakinde").
  if (typeof ad === "string" && ad.startsWith("zeplin") && !sim.isOpen("zeplin")) shot.adres += "&zeplin";
  if (arayuz) shot.arayuz = true;
  return shot;
}

function olayCekimi(ad0, a, L, arayuz) {
  // Hava çekimi yalnız hava/deniz olayında anlamlı; kaza ve yangında geniş olay çekimi (yangında duman gökyüzünde).
  const ad = ad0 === "olay-hava" && olay?.tur === "kaza" ? "olay" : ad0;
  const tur = ad.startsWith("olay-arac:") ? "olay-arac" : ad, b = OLAY_CEKIM[tur];
  if (!b) { console.log(`UYARI: bilinmeyen olay çekimi "${ad}" (${Object.keys(OLAY_CEKIM).join(", ")}): meydan`); return L.meydan(); }
  if (!olay) {
    const yedek = ad === "olay-hava" || ad === "olay-tele" ? "ucus" : "meydan";
    console.log(`UYARI: bugün olay yok: "${ad}" yerine ${yedek}`);
    const shot = L[yedek]();
    shot.secenek = SECENEK[yedek]; if (TEMEL[yedek]) shot.temel = TEMEL[yedek];
    return shot;
  }
  const arac = tur === "olay-arac" ? ad.slice(10) : null, ani = OLAY_ANI[olay.tur] ?? {};
  // Olayda olmayan araç (17 Kasım QC: kazada itfaiye, fırtınada polis istenince siren sesi boş çekime ekleniyordu).
  if (arac && !(OLAY_ARACLARI[olay.tur] ?? []).includes(arac)) {
    birKez(`UYARI: "${olay.tur}" olayında "${arac}" aracı yok (${(OLAY_ARACLARI[olay.tur] ?? []).join(", ") || "araçsız olay"}): geniş olay çekimi`);
    return olayCekimi("olay", a, L, arayuz);
  }
  // Çekici yüklerken park hâlinde: izleme yerine çevresinde yörünge/vinç/alçak açı (yandan izlemede direk önüne giriyordu).
  const cek = arac === "cekici";
  const shot = { adres: a, hareket: { tur: null, hedef: ad, D: cek ? 20 : b.D, H: cek ? 7 : b.H, ...(b.goz ? { goz: b.goz } : {}) }, secenek: cek ? ["yorunge", "vinc", "alcak"] : b.secenek, olayBek: olay.tur,
    olayAni: arac ? ani.arac?.[arac] ?? ani.olay ?? "olay+5" : ani[ad] ?? ani.olay ?? "olay+5",
    ...(b.sarsinti ? { sarsinti: b.sarsinti } : {}),
    // Hız: araç takibi 1,5; çekici yüklemesi 10 (3 dk'lık iş birkaç saniyede); deniz olayında sıçramalar gerçek zamanlı
    // (yunus ~1,5 sn, balina ~3,5 sn) → 1,5; yakın çekim 2; diğerleri 4.
    olayHiz: arac === "cekici" ? 10 : arac ? 1.5 : olay.tur === "yunus" || olay.tur === "balina" ? 1.5 : ad === "olay-yakin" ? 2 : null };
  if (arac && arac !== "cekici") shot.otoEfekt = [{ ad: "siren-arac", sure: 6 }];
  // Araç saati sayfadan düzeltilir (kaydet.mjs: aracın yolda olduğu aralık); hikâyede "saat" verilirse yalnız denetlenir.
  if (arac) shot.aracAni = { ad: arac, oto: true };
  if (olay.tur === "firtina") shot.yagmur = true;
  return shot;
}

/** 10 Kasım (ada tarihi ya da --tarih) ve çekim saati 09:08'den sonraysa bayraklar yarıda. */
function yarida(ad, adres) {
  const gun = opt("--tarih") ?? tarih;
  if (!gun.endsWith("-11-10")) return false;
  const m = /saat=(\d{1,2}):(\d{2})/.exec(adres);
  return !!m && Number(m[1]) * 60 + Number(m[2]) >= 548;
}

/** {aci, uzak, yuk}: kamera hedef çevresinde aci kadar döner, yatay uzaklık ×uzak, hedefe göre yükseklik ×yuk. */
function kadraj(shot, { aci = 0, uzak = 1, yuk = 1 }) {
  if (shot.hareket) {
    // Olay çekimi: kadraj ayarı temel geometriyi değiştirir (hareket yine seçilir).
    const h = shot.hareket;
    h.a = (h.a ?? 0) + aci; h.D = +(h.D * uzak).toFixed(2); h.H = +(h.H * yuk).toFixed(2);
    return shot;
  }
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

const S = { ...S0, olcek: 2, gecis: X, ...(muzik ? { muzik } : {}), ...(efektler.length ? { efektler } : {}), fps: 30, w: 1080, h: 1920, cekimler, aciklama };
writeFileSync(`${out}/senaryo.json`, JSON.stringify(S, null, 2));

if (dene) {
  // Çekim listesi (numara → yer, cümleler): kadrajı düzeltilecek çekimi seçmek için.
  if (!cekimler[Number(dene) - 1]) { console.error(`çekim ${dene} yok (1–${cekimler.length})`); process.exit(1); }
}
// --- çizim: site derlenir, yerel önizleme sunucusu açılır, kaydet.mjs çalışır ---
const PORT = Number(process.env.ONIZLEME_PORT) || 4179;
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
