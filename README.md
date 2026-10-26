# Mercanada

Instagram takipçilerinin sakin olarak yaşadığı, takipçi geldikçe büyüyen bir ada.

## Temel ilke

Takip etmenin dışında hiçbir özellik kullanıcıdan işlem istemez. Sakinlerin hayatı (meslek, terfi, evcil hayvan, günlük plan) kullanıcı adından türetilen tohum değer ve günden **deterministik** olarak hesaplanır. Bu yüzden sunucu kimsenin hayatını saklamaz, sadece kimliği, sırayı (adres buradan hesaplanır) ve istekleri tutar. Bu yapı 10 milyon sakine kadar ölçeklenir.

## Yapı

```
data/catalog.json          meslekler, iş yerleri, hobiler, isim listeleri (web ve sunucu ortak)
web/                       tarayıcı istemcisi (Three.js + Vite), telefonda ve Instagram içinde açılır
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
  import_followers.py      Instagram takipçi dışa aktarımını şehre işler
  tests/test_parity.py     JS ve Python aynı sonucu veriyor mu?
```

## Komutlar

```sh
# Geliştirme sunucusu (http://localhost:5173)
cd web && npm install && npm run dev

# Adres çubuğu seçenekleri: ?nufus=12000 (örnek nüfus), ?saat=21:30 (sabit saat, hiz ile),
# ?hiz=60 (zaman hızı), ?bul=sakin_0042 (sakini bulup göster), ?bak=x,z,uzaklık (kamera)

# Parite ve plan testleri (Node gerekir)
cd server && python3 -m unittest -v

# Sunucuya yükle ($SUNUCU: ssh takma adı; sadece /opt/mercanada)
rsync -a --delete --exclude __pycache__ --relative server/ data/catalog.json $SUNUCU:/opt/mercanada/app/
ssh $SUNUCU 'chown -R mercanada:mercanada /opt/mercanada/app'

# Takipçi dışa aktarımını işle (sunucuda)
sudo -u mercanada python3 /opt/mercanada/app/server/import_followers.py export.zip [--dry-run]
```

## Sunucu kuralları

Sunucuda başka servisler de çalışıyor. Mercanada sadece `mercanada` Linux kullanıcısı, `/opt/mercanada` klasörü ve `mercanada` Postgres veritabanını kullanır. nginx, Redis ve diğer servislere dokunulmaz.

## Yayın

`main` dalına her push'ta GitHub Actions parite testlerini çalıştırır, web istemcisini derler ve GitHub Pages'a yayınlar: https://ada.rumpuskit.com (Cloudflare üzerinden).

## Simülasyon kuralı değişirse

`web/src/sim.js` ile `server/mercanada_sim/sim.py` birlikte değişir ve parite testi çalıştırılır. Kural değişikliği bütün sakinlerin hayatını geriye dönük olarak değiştirir. Yayından sonra bunu bilinçli bir "şehir olayı" olarak yap.
