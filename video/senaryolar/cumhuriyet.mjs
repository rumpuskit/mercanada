// 2. video (29 Ekim): adanın ilk Cumhuriyet Bayramı. Boş adada meydandaki gönder ve iskele binasının
// direğinde bayrak dalgalanıyor, akşam denizde havai fişek var, ama henüz kutlayacak kimse yok.
// Meydan gönderi (0, -25.5), 12 m; iskele binası (-24, 182); vapur iskelesi x = 0, z 199-279.
export default {
  ad: "02-cumhuriyet",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: 0.4,
  aciklama: `Mercanada'nın ilk Cumhuriyet Bayramı 🇹🇷 Meydandaki gönderde bayrak dalgalanıyor, akşam havai fişek var... ama adada henüz kutlayacak kimse yok.

TikTok'ta takip eden herkes adaya taşınıyor. Gelecek bayramda meydan dolu olsun.

#29ekim #cumhuriyetbayramı #mercanada #keşfet #ada #şehirkurma`,
  cekimler: [
    {
      // Meydan gönderi aşağıdan: bayrak gökyüzünde.
      sure: 5,
      adres: "tarih=2026-10-29&saat=10:30&hiz=2",
      kamera: [
        [0, 9, 1.7, -11, 0, 10.5, -25.5],
        [5, 5, 2.2, -14, 0, 11, -25.5],
      ],
      yazilar: [{ metin: "Mercanada'nın ilk<br>Cumhuriyet Bayramı 🇹🇷", bas: 0.2, son: 5, yer: "ust" }],
    },
    {
      // Bomboş meydan: önde çeşme, arkada gönder.
      sure: 4.4,
      adres: "tarih=2026-10-29&saat=10:45&hiz=2",
      kamera: [
        [0, 26, 13, 30, 0, 5, -22],
        [4.4, 17, 9.5, 21, 0, 6, -24],
      ],
      yazilar: [{ metin: "Meydanda bayrak<br>dalgalanıyor...", bas: 0.2, son: 4.4, yer: "ust" }],
    },
    {
      // İskele binası ve direği, boş iskele (kamera iskelenin batısında, denizin üstünde; vapur doğuda).
      sure: 4.4,
      adres: "tarih=2026-10-29&saat=11:00&hiz=2",
      kamera: [
        [0, -11, 6.5, 236, -22, 4, 184],
        [4.4, -14, 5.5, 222, -24, 4, 183],
      ],
      yazilar: [{ metin: "...ama kutlayacak<br>kimse yok.", bas: 0.2, son: 4.4, yer: "ust" }],
    },
    {
      // Akşam, karanlık adanın patikasından denizdeki havai fişeğe.
      sure: 7,
      adres: "tarih=2026-10-29&saat=20:41&hiz=1",
      kamera: [
        [0, -3, 7, 140, 0, 46, 349],
        [7, 1, 8, 158, 0, 50, 349],
      ],
      yazilar: [{ metin: "Gelecek bayramda<br>meydan dolu olsun.", alt: "TikTok'ta takip et, adaya taşın<br><small>mercanada.rumpuskit.com</small>", bas: 0.6, son: 7, yer: "orta" }],
    },
  ],
};
