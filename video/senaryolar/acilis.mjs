// 1. video (açılış, 28 Ekim): bomboş ada → her takipçiyle büyüyen ada (aynı kameradan büyüme montajı)
// → bir sakin yakından → "ilk sakin sen ol". Ada gelişim tablosuna göre açılır (data/catalog.json
// "gelisim"); montajda ?nufus=N o nüfustaki adayı kurar.
// Kamera noktaları: çarşı meydanı (0, 0), vapur iskelesi z 199-279, Yakamoz Mahallesi (0, -270).

// Büyüme montajı: kamera bütün montaj boyunca tek bir yay üstünde süzülür; her çekim yayın bir parçası.
const STEPS = [
  [1, "1. sakin taşındı"],
  [20, "20 sakin: kahvehane, market"],
  [60, "60 sakin: fırın, kafe, cami"],
  [230, "230 sakin: okul, sağlık merkezi,<br>ilk otobüs"],
  [1000, "1.000 sakin: liman, tersane,<br>futbol sahası"],
  [3200, "3.200 sakin"],
];
const STEP = 1.75; // sn (geçişler dahil)
const arc = (u) => {
  const a = 0.62 + 0.32 * u, r = 360 - 50 * u, h = 250 - 40 * u;
  return [Math.sin(a) * r, h, -90 + Math.cos(a) * r, 0, 0, -110];
};
const montage = STEPS.map(([n, text], k) => ({
  sure: STEP,
  adres: `saat=16:20&hiz=4&nufus=${n}`,
  isinma: n > 500 ? 90 : 40,
  kamera: [[0, ...arc(k / STEPS.length)], [STEP, ...arc((k + 1) / STEPS.length)]],
  yazilar: [
    // Üstteki yazı her çekimde aynı: geçişte yerinde durur, yalnız alttaki sayı değişir.
    { metin: "Her takipçiyle<br>ada büyüyor.", bas: k === 0 ? 0.15 : -1, son: k === STEPS.length - 1 ? STEP - 0.1 : STEP + 1, yer: "ust" },
    { metin: text, bas: -1, son: STEP + 1, yer: "alt" },
  ],
}));

export default {
  ad: "01-acilis",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: 0.35,
  aciklama: `Bu ada bomboş: bir iskele, bir çeşme, bir fener. TikTok'ta takip eden herkes Mercanada'ya taşınıyor; kendi evi, mesleği ve kendi günüyle. Her yeni sakinle adada yeni bir yer açılıyor: kahvehane, fırın, okul, liman...
İlk sakin kim olacak? 🏝️

mercanada.rumpuskit.com

#mercanada #keşfet #ada #şehirkurma #simülasyon #oyun #3d`,
  cekimler: [
    {
      // Denizden bomboş adaya alçalan uçuş: patikalar, çeşmeli meydan, iskele.
      sure: 4.6,
      adres: "saat=09:40&hiz=6",
      kamera: [
        [0, -150, 120, 420, 0, 0, 40],
        [4.6, -70, 62, 250, 0, 0, 10],
      ],
      yazilar: [{ metin: "Bu adada henüz<br>kimse yaşamıyor.", bas: 0.2, son: 4.6, yer: "ust" }],
    },
    {
      // Bomboş vapur iskelesi; 08:28 vapuru yanaşmış, inen binen yok.
      sure: 3.8,
      adres: "saat=08:24&hiz=6",
      kamera: [
        [0, -40, 24, 186, 0, 2, 232],
        [3.8, -24, 15, 198, 1, 2, 236],
      ],
      yazilar: [{ metin: "TikTok'ta takip eden<br>herkes buraya taşınıyor.", bas: 0.15, son: 3.8, yer: "ust" }],
    },
    ...montage,
    {
      // Bir sakin yakından: adının yerinde "@sen", başının üstünde işaret.
      sure: 5.0,
      adres: "saat=17:45&hiz=2&nufus=3200",
      isinma: 90,
      takip: { yakin: true, x: 0, z: 30, ad: "sen", uzaklik: 6.5, aci: 0.8, yukseklik: 2.7, bak: 2.2 },
      yazilar: [{ metin: "Kendi evin, mesleğin,<br>kendi günün.", bas: 0.2, son: 5.0, yer: "ust" }],
    },
    {
      // Yeniden bomboş ada, yüksekten: çağrı.
      sure: 5.4,
      adres: "saat=09:40&hiz=6",
      kamera: [
        [0, 160, 180, 420, 0, 0, -60],
        [5.4, 230, 300, 560, 0, 0, -90],
      ],
      yazilar: [{ metin: "İlk sakin<br>sen ol.", alt: "TikTok'ta takip et<br><small>mercanada.rumpuskit.com</small>", bas: 0.25, son: 5.4, yer: "ust" }],
    },
  ],
};
