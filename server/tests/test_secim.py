"""Seçim yorumu ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from secim import cozumle


class SecimCozumleTest(unittest.TestCase):
    def test_aday(self):
        for t in ["adayım", "Başkan adayıyım", "belediye başkanı olmak istiyorum", "ben başkan olcam",
                  "ada başkanı olacağım", "ilk ben dedim başkan benim", "başkan olabilir miyim",
                  "Başkan ben olurum", "başkan olayım"]:
            self.assertEqual(cozumle(t), {"aday": True}, t)

    def test_aday_degil(self):
        for t in ["kim başkan olacak", "başkan olsun", "başkanımız çok iyi", "futbolcu olcam"]:
            self.assertEqual(cozumle(t), {}, t)

    def test_oy(self):
        self.assertEqual(cozumle("oy: @Nar21437"), {"oy": "nar21437"})
        self.assertEqual(cozumle("oyum @kurox120, başkan benim değil"), {"oy": "kurox120"})


if __name__ == "__main__":
    unittest.main()
