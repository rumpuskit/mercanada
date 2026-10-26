# Mercanada

Instagram takipçilerinin sakin olarak yaşadığı, takipçi geldikçe büyüyen bir ada.

## Temel ilke

Takip etmenin dışında hiçbir özellik kullanıcıdan işlem istemez. Sakinlerin hayatı (meslek, terfi, evcil hayvan, günlük plan) kullanıcı adından türetilen tohum değer ve günden **deterministik** olarak hesaplanır. Bu yüzden sunucu kimsenin hayatını saklamaz, sadece kimliği, sırayı (adres buradan hesaplanır) ve istekleri tutar. Bu yapı 10 milyon sakine kadar ölçeklenir.

## Yapı

```
game/                      Godot 4.7 projesi (web, gl_compatibility)
  export_presets.cfg       web dışa aktarımı (thread'siz, her tarayıcıda çalışır)
  data/catalog.json        meslekler, iş yerleri, hobiler, isim listeleri (oyun ve sunucu ortak)
  scripts/sim/             deterministik simülasyon: mhash, city_clock, address, resident_sim
  scripts/world/           palet ve geçici ada (gerçek ada üretimi gelecek)
  tests/                   parite çıktısı ve ekran görüntüsü scriptleri
server/
  mercanada_sim/sim.py     simülasyonun Python karşılığı (Godot ile bit bit aynı)
  schema.sql               Postgres şeması (sakinler, aktarimlar, istekler)
  import_followers.py      Instagram takipçi dışa aktarımını şehre işler
  tests/test_parity.py     Godot ve Python aynı sonucu veriyor mu?
```

## Komutlar

```sh
# Oyunu aç (1-4 tuşları: zaman hızı)
godot --path game

# Parite ve plan testleri
cd server && python3 -m unittest -v

# Belirli bir saatte ekran görüntüsü
godot --path game -s tests/screenshot.gd -- /tmp/ada.png 18:30

# Sunucuya yükle ($SUNUCU: ssh takma adı; sadece /opt/mercanada)
rsync -a --delete --exclude __pycache__ --relative server/ game/data/catalog.json $SUNUCU:/opt/mercanada/app/
ssh $SUNUCU 'chown -R mercanada:mercanada /opt/mercanada/app'

# Takipçi dışa aktarımını işle (sunucuda)
sudo -u mercanada python3 /opt/mercanada/app/server/import_followers.py export.zip [--dry-run]
```

## Sunucu kuralları

Sunucuda başka servisler de çalışıyor. Mercanada sadece `mercanada` Linux kullanıcısı, `/opt/mercanada` klasörü ve `mercanada` Postgres veritabanını kullanır. nginx, Redis ve diğer servislere dokunulmaz.

## Yayın

`main` dalına her push'ta GitHub Actions parite testlerini çalıştırır, oyunu web için dışa aktarır ve GitHub Pages'a yayınlar: https://ada.rumpuskit.com. Yerelde dışa aktarmak için:

```sh
godot --headless --path game --export-release "Web" export/web/index.html
```

## Simülasyon kuralı değişirse

`game/scripts/sim/*.gd` ile `server/mercanada_sim/sim.py` birlikte değişir ve parite testi çalıştırılır. Kural değişikliği bütün sakinlerin hayatını geriye dönük olarak değiştirir. Yayından sonra bunu bilinçli bir "şehir olayı" olarak yap.
