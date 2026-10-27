// 2. video (29 Ekim): adanın ilk Cumhuriyet Bayramı. Ada bayraklarla donanmış, akşam havai fişek var,
// ama henüz kutlayacak kimse yok. Belediye (57, -18) önünde gönder (66.6, -1); yaya caddesi x = 0, z 30-190.
export default {
  ad: "02-cumhuriyet",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: 0.4,
  aciklama: `Mercanada'nın ilk Cumhuriyet Bayramı 🇹🇷 Sokaklar bayraklarla donandı, akşam havai fişek var... ama adada henüz kutlayacak kimse yok.

TikTok'ta takip eden herkes adaya taşınıyor. Gelecek bayramda meydan dolu olsun.

#29ekim #cumhuriyetbayramı #mercanada #keşfet #ada #şehirkurma`,
  cekimler: [
    {
      // Bayraklı yaya caddesi boyunca denize doğru alçak uçuş.
      sure: 5,
      adres: "tarih=2026-10-29&saat=10:30&hiz=2",
      kamera: [
        [0, 2, 10, 36, 0, 5, 110],
        [5, -1, 8, 120, 0, 4, 210],
      ],
      yazilar: [{ metin: "Mercanada'nın ilk<br>Cumhuriyet Bayramı 🇹🇷", bas: 0.2, son: 5, yer: "ust" }],
    },
    {
      // Belediyenin önündeki gönder, aşağıdan.
      sure: 4.2,
      adres: "tarih=2026-10-29&saat=10:40&hiz=2",
      kamera: [
        [0, 32, 2.2, 6, 66.6, 12, -1],
        [4.2, 44, 2.6, 3.5, 66.6, 14, -1],
      ],
      yazilar: [{ metin: "Ada bayramlığını giydi...", bas: 0.2, son: 4.2, yer: "ust" }],
    },
    {
      // Bomboş meydan.
      sure: 4.4,
      adres: "tarih=2026-10-29&saat=11:00&hiz=2",
      kamera: [
        [0, 44, 30, 64, 0, 0, 0],
        [4.4, 30, 22, 46, 0, 0, -4],
      ],
      yazilar: [{ metin: "...ama kutlayacak<br>kimse yok.", bas: 0.2, son: 4.4, yer: "ust" }],
    },
    {
      // Akşam, bayraklı yaya caddesinden denizdeki havai fişeğe.
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
