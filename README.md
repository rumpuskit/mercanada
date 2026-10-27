# Mercanada

TikTok takipçilerinin sakin olarak yaşadığı, takipçi geldikçe büyüyen bir ada: https://mercanada.rumpuskit.com

## Temel ilke

Takip etmenin dışında hiçbir özellik kullanıcıdan işlem istemez. Sakinlerin hayatı (meslek, terfi, evcil hayvan, günlük plan) kullanıcı adından türetilen tohum değer ve günden **deterministik** olarak hesaplanır. Bu yüzden sunucu kimsenin hayatını saklamaz, sadece kimliği, sırayı (adres buradan hesaplanır) ve istekleri tutar. Bu yapı 10 milyon sakine kadar ölçeklenir.

## Sakinler nereden gelir?

TikTok takipçi listesini resmî arayüzünden vermez; tek resmî yol hesabın "Verilerini indir" dosyasıdır (hazırlanması saatler-günler sürer). Akış:

1. TikTok uygulamasında Ayarlar → Hesap → Verilerini indir → yalnız "Takipçi listesi", JSON. Dosya gelince indirilir, hemen yenisi istenir.
2. Dosya sunucuda `import_followers.py` ile işlenir: yeni gelenler takip sırasına göre önce boş evlere yerleşir, takibi bırakanlar ayrılır (evi 7 gün tutulur, sonra kaydı silinir), adadan çıkmak isteyenler bir daha taşınmaz.
3. Betik güncel listeyi Cloudflare Worker'ına (`sayac/`) yollar; site listeyi oradan okur. Ziyaretçi trafiği sunucuya gelmez.
4. Aradaki günlerde TikTok API'sinden yalnız takipçi **sayısı** alınır (saatlik); henüz taşınmamış olanlar vapur iskelesinde valizleriyle bekler.

## Ada nasıl büyür?

Ada boş başlar: vapur iskelesi, toprak patikalar, çeşmeli meydan ve bayrak direği, tepe, fener ve kumsal. Her şeyin yeri baştan bellidir ama yalnızca açılmış olanlar kurulur:

- **Evler** sakinlerle gelir: bir apartman, ilk dairesine biri taşınınca dikilir. Mahalle girişe en yakın sokaktan dışa doğru dolar; sokaklar evlerin önüne kadar uzanır.
- **Yerler** `data/catalog.json` içindeki `gelisim` tablosuna göre açılır: 5. sakinde meydan bankları, 10'da kahvehane, 20'de market, 30'da fırın... 230'da çevre yolu ile arabalar ve otobüs, 600'de yük limanı, 2.650'de son kafe. Sonraki mahallelerin camisi, çay bahçesi ve okulu, mahalle dolmaya başladıktan sonra aynı aralıklarla gelir; çarşı dükkânları 240. sakinden başlayarak tek tek açılır.
- Gelişim düzeyi adanın **ulaştığı en yüksek nüfustur** (`zirve`); takibi bırakanlar yüzünden açılmış bir yer kapanmaz.
- İş yeri henüz açılmamış bir mesleğin sahibi o yer açılana kadar **anakarada çalışır** (vapurla gider gelir); kartında "Mercan Fırını açılınca fırın çırağı olacak (30. sakinde)" yazar. Açılınca asıl işine geçer.
- Sitede "Sıradaki: … · N sakin daha" satırı ve haritada sıradaki yapının şantiye çitli hayalet taslağı görünür. Aktarım çıktısındaki `acilan` listesi Taşınma Günü videosunun malzemesidir.

## Yapı

```
data/catalog.json          meslekler, iş yerleri, hobiler, isim listeleri (web ve sunucu ortak)
web/                       tarayıcı istemcisi (Three.js + Vite), telefonda ve TikTok uygulama içi tarayıcısında açılır
  src/sim.js               deterministik simülasyon: hash, saat, adres, sakinin günü
  src/world/layout.js      adanın yerleşimi: nüfustan hücreler, mahalleler, çarşı, kıyı, yollar
  src/world/roads.js       asfalt, Arnavut kaldırımı, kaldırım, yaya geçidi, sokak lambaları
  src/world/city.js        apartmanlar, dükkânlar, kent eşyası (InstancedMesh)
  src/world/human.js       eklemli insan figürü, eşyalar, köpekler
  src/world/people.js      sokaktaki hayat: yürüyüş, oturma, sohbet, hobiler, iş
  src/world/life.js        evdeki hayat: uyku, yemek, televizyon...
  src/world/interior.js    ev içi (bebek evi) görünümü: seçilen kat kesilir, daireler eşyalı
  src/world/*.js           arazi, ağaçlar, gökyüzü, levhalar, dokular
  src/ui.js                saat, hız, "Kendini bul" araması ve sakin kartı
  tests/parity_vectors.mjs parite testi için JS çıktısı
server/
  mercanada_sim/sim.py     simülasyonun Python karşılığı (web ile bit bit aynı)
  schema.sql               Postgres şeması (sakinler, aktarimlar, istekler)
  import_followers.py      TikTok (ya da Instagram) takipçi dışa aktarımını şehre işler, listeyi yayınlar
  cikar.py                 adadan çıkmak / adını gizlemek isteyenler (DM ile)
  tiktok_api.py            TikTok takipçi sayısı (iskelede bekleyenler için), OAuth kurulumu
  ortak.py                 psql, listenin yayını (public/sakinler.json + Worker)
  systemd/                 mercanada kullanıcısının kendi servisleri (saatlik takipçi sayısı)
sayac/                     Cloudflare Worker: çevrimiçi sayacı, /sakinler.json, mercanada.rumpuskit.com yönlendirmesi
  tests/test_parity.py     JS ve Python aynı sonucu veriyor mu?
```

## Komutlar

```sh
# Geliştirme sunucusu (http://localhost:5173)
cd web && npm install && npm run dev

# Adres çubuğu seçenekleri: ?nufus=12000 (gerçek liste yerine örnek nüfus), ?gelisim=500 (adayı o gelişim
# düzeyinde göster), ?bekleyen=40 (iskelede bekleyen),
# ?test (60×/600× düğmeleri), ?saat=21:30 (sabit saat, test/hiz ile), ?hiz=60 (zaman hızı),
# ?bul=sakin_0042 (sakini bulup göster), ?bak=x,z,uzaklık (kamera)

# Parite ve plan testleri (Node gerekir)
cd server && python3 -m unittest -v

# Sunucuya yükle ($SUNUCU: ssh takma adı; sadece /opt/mercanada)
rsync -a --delete --exclude __pycache__ --relative server/ data/catalog.json $SUNUCU:/opt/mercanada/app/
ssh $SUNUCU 'chown -R mercanada:mercanada /opt/mercanada/app'

# Takipçi dışa aktarımını işle (sunucuda; önce --dry-run ile bak)
cd /opt/mercanada/app/server
sudo -u mercanada python3 import_followers.py tiktok-export.zip --dry-run
sudo -u mercanada python3 import_followers.py tiktok-export.zip

# Adadan çıkma / adı gizleme isteği (DM)
sudo -u mercanada python3 cikar.py kullaniciadi
sudo -u mercanada python3 cikar.py --gizle kullaniciadi

# Worker (sayaç + liste + yönlendirme)
cd sayac && npx wrangler@4 deploy
```

## Sunucu kuralları

Sunucuda başka servisler de çalışıyor. Mercanada sadece `mercanada` Linux kullanıcısı, `/opt/mercanada` klasörü ve `mercanada` Postgres veritabanını kullanır. nginx, Redis ve diğer servislere dokunulmaz.

## Yayın

`main` dalına her push'ta GitHub Actions parite testlerini çalıştırır, web istemcisini derler ve GitHub Pages'a yayınlar: https://ada.rumpuskit.com (Cloudflare üzerinden).

## Simülasyon kuralı değişirse

`web/src/sim.js` ile `server/mercanada_sim/sim.py` birlikte değişir ve parite testi çalıştırılır. Kural değişikliği bütün sakinlerin hayatını geriye dönük olarak değiştirir. Yayından sonra bunu bilinçli bir "şehir olayı" olarak yap.
