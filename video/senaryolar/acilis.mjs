// 1. video (açılış, 28 Ekim): boş ada → 3.200 takipçide ada → "ilk sakin sen ol".
// Kamera noktaları: çarşı meydanı (0, 0), vapur iskelesi z 199-279, Yakamoz Mahallesi (0, -270).
export default {
  ad: "01-acilis",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: 0.35,
  aciklama: `Bu ada bomboş. TikTok'ta takip eden herkes Mercanada'ya taşınıyor: kendi evi, mesleği ve kendi günüyle.
İlk sakin kim olacak? 🏝️

mercanada.rumpuskit.com

#mercanada #keşfet #ada #şehirkurma #simülasyon #oyun #3d`,
  cekimler: [
    {
      // Boş mahallenin sokakları üstünden alçak uçuş.
      sure: 4.6,
      adres: "saat=08:10&hiz=20",
      kamera: [
        [0, 40, 34, -120, 0, 4, -300],
        [4.6, 10, 22, -205, -10, 2, -360],
      ],
      yazilar: [{ metin: "Bu adada henüz<br>kimse yaşamıyor.", bas: 0.2, son: 4.6, yer: "ust" }],
    },
    {
      // Bomboş vapur iskelesi; 08:28 vapuru yanaşmış, binen yok.
      sure: 4.2,
      adres: "saat=08:24&hiz=6",
      kamera: [
        [0, -40, 24, 186, 0, 2, 232],
        [4.2, -22, 14, 200, 1, 2, 236],
      ],
      yazilar: [{ metin: "TikTok'ta takip eden<br>herkes buraya taşınıyor.", bas: 0.15, son: 4.2, yer: "ust" }],
    },
    {
      // Aynı iskele, aynı açı, 3.200 sakinle: 08:28 vapuruna binen anakara işçileri (önce/sonra).
      sure: 5.2,
      adres: "saat=08:24&hiz=6&nufus=3200",
      isinma: 90,
      kamera: [
        [0, -40, 24, 186, 0, 2, 232],
        [5.2, -22, 14, 200, 1, 2, 236],
      ],
      yazilar: [{ metin: "3.200 takipçide<br>ada böyle olacak.", bas: 0.2, son: 5.2, yer: "ust" }],
    },
    {
      // Çarşı caddesi kalabalık: alçak geçiş.
      sure: 4.6,
      adres: "saat=17:40&hiz=6&nufus=3200",
      isinma: 90,
      kamera: [
        [0, 30, 14, 60, 0, 1, 0],
        [4.6, -20, 11, 34, 0, 1, -24],
      ],
      yazilar: [],
    },
    {
      // Bir sakin yakından: adının yerinde "@sen", başının üstünde işaret.
      sure: 5.2,
      adres: "saat=17:45&hiz=2&nufus=3200",
      isinma: 90,
      takip: { yakin: true, x: 0, z: 30, ad: "sen", uzaklik: 6.5, aci: 0.8, yukseklik: 2.7, bak: 2.2 },
      yazilar: [{ metin: "Kendi evin, mesleğin,<br>kendi günün.", bas: 0.2, son: 5.2, yer: "ust" }],
    },
    {
      // Yeniden boş ada, yüksekten: çağrı.
      sure: 5.4,
      adres: "saat=08:30&hiz=20",
      kamera: [
        [0, 160, 180, 420, 0, 0, -60],
        [5.4, 230, 300, 560, 0, 0, -90],
      ],
      yazilar: [{ metin: "İlk sakin<br>sen ol.", alt: "TikTok'ta takip et<br><small>mercanada.rumpuskit.com</small>", bas: 0.25, son: 5.4, yer: "ust" }],
    },
  ],
};
