"""Seçim yorumu ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from secim import cozumle


class SecimCozumleTest(unittest.TestCase):
    def test_aday(self):
        for t in ["adayım", "Başkan adayıyım", "belediye başkanı olmak istiyorum", "ben başkan olcam",
                  "ada başkanı olacağım", "ilk ben dedim başkan benim", "başkan olabilir miyim",
                  "Başkan ben olurum", "başkan olayım", "Bêlêdîyê başkanî", "başkan ben", "Belediye başkanlığı",
                  "Ben Başkan olabilirim bu ada için vaatlerim şunlar"]:
            self.assertEqual(cozumle(t), {"aday": True}, t)

    def test_aday_degil(self):
        for t in ["kim başkan olacak", "başkan olsun", "başkanımız çok iyi", "futbolcu olcam", "başkan kim", "belediye"]:
            self.assertEqual(cozumle(t), {}, t)

    def test_oy(self):
        self.assertEqual(cozumle("oy: @Nar21437"), {"oy": "nar21437"})
        self.assertEqual(cozumle("oy:exo45526"), {"oy": "exo45526"})
        self.assertEqual(cozumle("Oyum: kurox120"), {"oy": "kurox120"})
        self.assertEqual(cozumle("oyum yok"), {})
        from secim import KENDI
        self.assertEqual(cozumle("Kendime oy veriyorum… Ayrıca bana oy vermeyenlere sürpriz"), {"oy": KENDI})
        self.assertEqual(cozumle("kendime oy verebiliyor muyum"), {"oy": KENDI})
        self.assertEqual(cozumle("exo45526"), {})
        self.assertEqual(cozumle("adayım kendime veriyorum"), {"oy": KENDI, "aday": True})
        self.assertEqual(cozumle("oy: @exo45526 adayım"), {"oy": "exo45526"})  # yalın ad: yalnız adaysa, yorumlar() içinde
        self.assertEqual(cozumle("oyum @kurox120, başkan benim değil"), {"oy": "kurox120"})


class OyNiyetiTest(unittest.TestCase):
    """Biçime uymayan oylar: etiket, görünen ad, yazım hatası, niyet sözcüğü."""
    adaylar = {"shinomerwo1", "exo45526", "seviobl"}
    isimler = {"omerr": "shinomerwo1"}

    def oy(self, metin, yazan="secmen1"):
        from secim import oy_niyeti
        return oy_niyeti(metin, yazan, self.adaylar, self.isimler)

    def test_oy(self):
        self.assertEqual(self.oy("@Ömerr"), "shinomerwo1")
        self.assertEqual(self.oy("Taraftar çıldırdı @Ömerr başkan olucakk"), "shinomerwo1")
        self.assertEqual(self.oy("@sahinomerwo1"), "shinomerwo1")  # yazım hatası
        self.assertEqual(self.oy("taraftar cıldırdı @ shinomerwo1 yaz"), "shinomerwo1")
        self.assertEqual(self.oy("exo45526"), "exo45526")
        self.assertEqual(self.oy("exo45526 başkan olsun 👑"), "exo45526")
        self.assertEqual(self.oy("seviobl oyumu veriyorumm"), "seviobl")
        self.assertEqual(self.oy("takip ettim @shinomerwo1"), "shinomerwo1")
        self.assertEqual(self.oy('sieunun_suhosu" oyum'.replace("sieunun_suhosu", "seviobl")), "seviobl")

    def test_oy_degil(self):
        self.assertIsNone(self.oy("exo45526 polis mi?"))
        self.assertIsNone(self.oy("@exo45526 sen neden hep polis oluyorsun ki bunu anlamadım"))
        self.assertIsNone(self.oy("@Ömerr", yazan="shinomerwo1"))  # kendini etiketlemek oy değil
        self.assertIsNone(self.oy("exo45526 ve seviobl başkan olsun"))  # iki aday: belirsiz
        self.assertIsNone(self.oy("@birisi başkan olsun"))  # aday değil


if __name__ == "__main__":
    unittest.main()
