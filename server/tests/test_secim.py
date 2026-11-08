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


if __name__ == "__main__":
    unittest.main()
