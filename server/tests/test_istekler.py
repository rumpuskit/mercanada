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
            "Meslek Football": {"meslek": "futbolcu"},
            "Meslek çaycı/kahveci": {"meslek": "kahveci"},
            "abla takipteyim balıkcı olucam": {"meslek": "balikci"},
            "ben polis olcam": {"meslek": "polis"},
            "doktor olacağım": {"meslek": "doktor"},
            # 1 Kasım yorumları: videonun sorusuna "ben X" cevabı.
            "ben garson": {"meslek": "garson"},
            "Ben de futbolcu": {"meslek": "futbolcu"},
            "ben olurum fırınçı": {"meslek": "firinci"},
            "polis olabilirmiyim": {"meslek": "polis"},
            "abla garson olabilir miyim": {"meslek": "garson"},
            "Footballcu": {"meslek": "futbolcu"},
            "Beni topçu yap": {"meslek": "futbolcu"},
            "abla ben futbolcu": {"meslek": "futbolcu"},
            "Abla futbolcu": {"meslek": "futbolcu"},
            "futbolcu bennn": {"meslek": "futbolcu"},
            "ben polis yap abi": {"meslek": "polis"},
            "avukat olcan": {"meslek": "avukat"},
            "Savcı olabilrimiyim hayalimd3": {"meslek": "savci"},
            "beni zeplin pilotu yapar misin teşekkürler": {"meslek": "zeplin_pilotu"},
            "futbolcu yap beni": {"meslek": "futbolcu"},
            "polis olim": {"meslek": "polis"},
            "Ben öğretmen olurmuyum": {"meslek": "ogretmen"},
            "doktor olur muyum": {"meslek": "doktor"},
            "yazılım mühendisi": {"meslek": "yazilimci"},
            "bakkal": {"meslek": "kasiyer"},
            "Bilgisayar mühendisi olmak istiyorum": {"meslek": "yazilimci"},
            "pilot pls": {"meslek": "zeplin_pilotu"},
            "yazılımcııı": {"meslek": "yazilimci"},
            "abla benide futbolcu yap": {"meslek": "futbolcu"},
            "futbolcu olurummm": {"meslek": "futbolcu"},
            "ben fublocu yap": {"meslek": "futbolcu"},
            "kaleci olurum": {"meslek": "futbolcu"},
            "Uçak pilotu oluyum lütfen": {"meslek": "zeplin_pilotu"},
            "ben futbolcu olyrum": {"meslek": "futbolcu"},
            "Dönerci olurum": {"meslek": "asci"},
            "Futbolcu yap": {"meslek": "futbolcu"},
            "fotbolcu": {"meslek": "futbolcu"},
            "forvet": {"meslek": "futbolcu"},
            "abla ben stoper oluyum": {"meslek": "futbolcu"},
            "sağ kanat": {"meslek": "futbolcu"},
            "Kale": {"meslek": "futbolcu"},
            "kalem": {},
            "forvet lüfen": {"meslek": "futbolcu"},
            "mesleek hakimm": {"meslek": "hakim"},
            "ben futbolcu oluyim": {"meslek": "futbolcu"},
            "tamam yaz bakalım": {},
            "nükleer santraldeki operatör olmak istiyorum": {},
            "Mobilyacıyım": {"meslek": "marangoz"},
            "abla ben önceden futbolcu olmuştum takım kaptanımız kim yoksa olabilirim": {},
            "gemi kaptanı olmak istiyorum": {"meslek": "balikci"},
            "tamirci oliyimmi": {"meslek": "gemi_ustasi"},
            "Jandarma lazım ben Jandarma Komutanlığı o lim": {},
            "jandarma": {"meslek": "polis"},
            "Insaat ustasi": {"meslek": "mimar"},
            "bilgisayar mühendisliği": {"meslek": "yazilimci"},
            "abi adaya beni al bakal olcam": {"meslek": "kasiyer"},
            "ben duktur olim": {"meslek": "doktor"},
            "sanayici olim": {"meslek": "gemi_ustasi"},
            "saanayi açılsın ben lastikçi olum": {"meslek": "gemi_ustasi"},
            "Ben basketbolcu olim": {"meslek": "futbolcu"},
            "abla Ben garnizon komutanı tümgeneral olmak istiyorum": {"meslek": "polis"},
            "polis oliyim": {"meslek": "polis"},
            "ben öğrenciyim": {"meslek": "ogrenci"},
            "Ben doktorum": {"meslek": "doktor"},
            "polis olayımmı": {"meslek": "polis"},
            "komser olmak istiyorum": {"meslek": "polis"},
            "ben subay olabilir miyim": {"meslek": "polis"},
            "meslek asker": {"meslek": "polis"},
            "veteriner": {"meslek": "doktor"},
            "polis yapar mısın nolur🥰": {"meslek": "polis"},
            "abla balık çı olmak istiyorum": {"meslek": "balikci"},
            "Evcil hayvan =muhabbet kuşu": {"evcil": "Papağan"},
            "ben oliyim asker": {"meslek": "polis"},
            "Meslek:yargıç": {"meslek": "hakim"},
            "insaatciyim": {"meslek": "mimar"},
            "ben meslek olarak inşatçı olcam": {"meslek": "mimar"},
            "ben pilot olsam olur mu": {"meslek": "zeplin_pilotu"},
            "Ben tamirci": {"meslek": "gemi_ustasi"},
            "abla taşındım Futbolcuyum @Ezman Atak": {"meslek": "futbolcu"},
            "polis olsun": {"meslek": "polis"},
            "Avukat olarak Adalet Bakanlığında Çalışmak istiyorum": {"meslek": "avukat"},
            "kim başkan olsun": {},
            "ben olsam ne yapardım": {},
            "meslek pilot": {"meslek": "zeplin_pilotu"},
            "zeplin pilotu olmak istiyorum": {"meslek": "zeplin_pilotu"},
            "doktor olablir miyim": {"meslek": "doktor"},
            "hemşire olabilr miyim": {"meslek": "hemsire"},
        }
        for text, want in cases.items():
            self.assertEqual(cozumle(text), want, text)

    def test_istek_degil(self):
        for text in ("çok güzel olmuş", "balıkçı amca çok iyi", "balıkçı olmak istemiyorum", "balıkçı olmayacağım",
                     "itfaiyeci olmak istiyorum", "belediye başkanı olmak istiyorum", "kahve içmek istiyorum", "meslek: şef", "meslek: müdür",
                     # Kadrolu işler (kontenjanlı) ve "anakara" istenemez.
                     "meslek: cankurtaran", "meslek: uzman",
                     "ben de geldim", "ben bilim adamı", "ben avm açmak istiyorum"):
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


class DogrulamaKoduTest(unittest.TestCase):
    """Sitedeki yorumla doğrulama: yorumdaki kod Worker'a [kod, kullanıcı adı] olarak gider, istek sayılmaz."""

    def test_kod(self):
        from istekler import KOD
        for text, want in {"kod 4821": "4821", "Kod: 4821 ben buradayım": "4821", "kodum 1234": "1234",
                           "kod4821": "4821", "KOD 12345": None, "kodlar çok güzel": None}.items():
            m = KOD.search(katla(text))
            self.assertEqual(m and m.group(1), want, text)
        self.assertEqual(cozumle("kod 4821"), {})

    def test_worker_cagrisi(self):
        import istekler
        import ortak
        gelen = []
        eski_kayit, eski_kaydet, eski_psql, eski_uygula = ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula
        ortak.kayit = lambda method, path, body=None: (gelen.append((method, path, body)), {"onaylanan": ["ali"]})[1]
        istekler.kaydet = lambda satirlar, kaynak, db=None: 0
        istekler.psql = lambda sql, db=None, extra=None: "[]" if "json_agg" in sql else "0"
        istekler.uygula = lambda db=None: []
        try:
            out = istekler.yorumlar([["c1", "Ali", 1, "kod 4821"], ["c2", "veli", 2, "meslek: balıkçı"], ["c3", "biz", 3, "kod 1111"]], hesap="biz")
        finally:
            ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula = eski_kayit, eski_kaydet, eski_psql, eski_uygula
        self.assertEqual(gelen, [("POST", "/api/onayla", {"ciftler": [["4821", "ali", True]]})])
        self.assertEqual(out["dogrulanan"], ["ali"])


class KodTest(unittest.TestCase):
    def test_kod(self):
        from istekler import KOD, KOD_TEK
        self.assertEqual(KOD.search(katla("kod: 1234")).group(1), "1234")
        self.assertEqual(KOD_TEK.match(katla(" 8538 ")).group(1), "8538")
        self.assertIsNone(KOD_TEK.match(katla("2026 yılı")))
        from istekler import kodlar_bul
        for metin, beklenen in [("kod 1234", [("1234", True)]), ("kodum: 3674", [("3674", True)]),
                                ("8538", [("8538", True)]), ("4521 evimi onayla lütfen", [("4521", False)]),
                                ("1234 kodum 🏠", [("1234", True)]), ("Kodu yazdım abla: 9087 ✨", [("9087", True)]),
                                ("tel 05321234567", []), ("polis olmak istiyorum", [])]:
            self.assertEqual(kodlar_bul(metin), beklenen, metin)
