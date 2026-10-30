"""Yorumdan istek ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from istekler import cozumle, katla, secenekler


class CozumleTest(unittest.TestCase):
    def test_gecerli(self):
        cases = {
            "meslek: balıkçı": {"meslek": "balikci"},
            "Mesleğim YAZILIMCI olsun lütfen": {"meslek": "yazilimci"},
            "balıkçı olmak istiyorum": {"meslek": "balikci"},
            "İzmirli öğretmen olmak istiyorum": {"meslek": "ogretmen"},
            "Mesleğim: Seramik sanatçısı": {"meslek": "seramikci"},
            "meslek balıkçı, hobi satranç, evcil kedi": {"meslek": "balikci", "hobi": "satranc", "evcil": "Kedi"},
            "evcil hayvanım köpek olsun": {"evcil": "Köpek"},
            "hobim kitap okumak": {"hobi": "kitap"},
            "hobi: yüzmek": {"hobi": "yuzme"},
            "adımı gizle": {"gizle": "1"},
            "ADIMI GÖSTERİN": {"gizle": "0"},
            "ismimi gizler misiniz": {"gizle": "1"},
            # Polis kadrolu ama istenebilir; muhtar mahalle başına tek (koltuk sunucuda denetlenir).
            "polis olmak istiyorum": {"meslek": "polis"},
            "meslek: komiser": {"meslek": "polis"},
            "Meslek:muhtar": {"meslek": "muhtar"},
            "okul müdürü olmak istiyorum": {"meslek": "okul_muduru"},
            "hâkim olmak istiyorum": {"meslek": "hakim"},
            "okul müdürü": {"meslek": "okul_muduru"},
            "meslek: fener bekçisi": {"meslek": "fener_bekcisi"},  # tek koltuk (8. sakin avukatlığı seçti)
            "Polis 👮": {"meslek": "polis"},
            "Meslek çaycı/kahveci": {"meslek": "kahveci"},
        }
        for text, want in cases.items():
            self.assertEqual(cozumle(text), want, text)

    def test_istek_degil(self):
        for text in ("çok güzel olmuş", "balıkçı amca çok iyi", "balıkçı olmak istemiyorum",
                     "itfaiyeci olmak istiyorum", "belediye başkanı olmak istiyorum", "kahve içmek istiyorum", "meslek: şef", "meslek: müdür",
                     # Kadrolu işler (kontenjanlı) ve "anakara" istenemez.
                     "meslek: cankurtaran", "meslek: uzman"):
            self.assertEqual(cozumle(text), {}, text)

    def test_katla(self):
        self.assertEqual(katla("  İĞNE, Işık!  çöp "), "igne isik cop")

    def test_belirsiz_ad_yok(self):
        # Her takma ad tek bir değere gider; katalog değişip iki mesleğe aynı unvan eklenirse çıkarılır.
        for tur, pairs in secenekler().items():
            aliases = [a for a, _ in pairs]
            self.assertEqual(len(aliases), len(set(aliases)), tur)


if __name__ == "__main__":
    unittest.main()
