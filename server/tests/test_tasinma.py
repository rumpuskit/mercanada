"""tasinma.py uçtan uca: saatlik sayı, günde 3 taşınma, sıralama, bekleyenler, korumalar.

Gerçek bir Postgres ister; yalnız MERCANADA_TEST_DB verilince çalışır (CI'da atlanır). Veritabanı her
testte sıfırdan kurulur, bu yüzden asıl veritabanının adı verilmemeli. Liste Worker'a yollanmaz
(geçici MERCANADA_ROOT'ta secrets/yayin.json yok).

    docker run -d --rm --name mercanada-deneme -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:17-alpine
    PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres MERCANADA_TEST_DB=mercanada_deneme python3 -m unittest tests.test_tasinma
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
DB = os.environ.get("MERCANADA_TEST_DB")


def sh(*cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


@unittest.skipUnless(DB, "MERCANADA_TEST_DB verilmedi")
class TasinmaTest(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(DB, "mercanada", "asıl veritabanında test çalıştırılmaz")
        sh("dropdb", "--if-exists", DB)
        sh("createdb", DB)
        sh("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", str(SERVER / "schema.sql"))
        self.root = tempfile.mkdtemp()
        self.env = dict(os.environ, MERCANADA_DB=DB, MERCANADA_ROOT=self.root)

    def send(self, msg) -> tuple[int, dict]:
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input=json.dumps(msg),
                           capture_output=True, text=True, env=self.env)
        return p.returncode, json.loads(p.stdout.strip().splitlines()[-1])

    def q(self, sql) -> str:
        return sh("psql", "-X", "-tA", "-d", DB, "-c", sql).strip()

    def published(self) -> dict:
        return json.loads((Path(self.root) / "public" / "sakinler.json").read_text())

    def test_tasinma_akisi(self):
        # Saatlik sayı: henüz kimse taşınmadı, hepsi iskelede bekliyor.
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.published()["bekleyen"], 10)
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(out, {"takipci": 10, "degisiklik": False})

        # İlk taşınma: 12 kişi; b0..b3 aynı sayfada (aynı takip zamanı), sırayı 'sıra' belirler.
        liste = [["ilk", 100, 0], ["b3", 200, 3], ["b0", 200, 0], ["b2", 200, 2], ["b1", 200, 1]]
        liste += [[f"k{i:02d}", 300 + i, 0] for i in range(7)]
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual(code, 0, out)
        self.assertEqual((out["gelen"], out["nufus"], out["ayrilan"]), (12, 12, 0))
        self.assertIn("Kahvehane", " ".join(out["acilan"]))
        order = self.q("SELECT string_agg(handle, ',' ORDER BY slot) FROM sakinler").split(",")
        self.assertEqual(order[:5], ["ilk", "b0", "b1", "b2", "b3"])
        # Profilde 13, listede 12: biri listede hiç görünmüyor (gizli hesap), iskelede beklemez.
        self.assertEqual((self.published()["bekleyen"], self.published()["zirve"]), (0, 12))

        # Aynı liste ikinci kez işlenmez.
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual((code, out.get("atlandi")), (0, True))

        # Aradaki saatlerde 2 yeni takipçi: iskelede 2 kişi.
        self.send({"tur": "sayi", "takipci": 15})
        self.assertEqual(self.published()["bekleyen"], 2)

        # İkinci taşınma: 2 kişi bıraktı, 3 kişi geldi. Ayrılanların evi 7 gün tutulur.
        liste2 = [x for x in liste if x[0] not in ("k00", "k01")] + [["y0", 400, 0], ["y1", 401, 0], ["y2", 402, 0]]
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2})
        self.assertEqual((out["gelen"], out["ayrilan"], out["nufus"]), (3, 2, 13))
        self.assertEqual(self.q("SELECT min(slot) FROM sakinler WHERE handle LIKE 'y%'"), "12")
        self.assertEqual(self.published()["zirve"], 15)

        # Çıkan biri listede olsa da taşınmaz.
        sh(sys.executable, str(SERVER / "cikar.py"), "y2", env=self.env, cwd=SERVER)
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2 + [["z0", 500, 0]]})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE handle = 'y2'"), "0")

    def test_korumalar(self):
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(10)]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste})[0], 0)
        # Yarım liste (aktif nüfusun %80'inden az) işlenmez: ada boşalmaz.
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": liste[:5]})
        self.assertEqual(code, 1)
        self.assertIn("Yarım liste", out["hata"])
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE left_day IS NULL"), "10")
        for bad in ({"tur": "liste", "takipci": 10, "liste": []}, {"tur": "x", "takipci": 1}, {"tur": "sayi"}):
            code, out = self.send(bad)
            self.assertEqual(code, 1, bad)
            self.assertIn("hata", out)
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input="bozuk", capture_output=True,
                           text=True, env=self.env)
        self.assertEqual(p.returncode, 1)
        self.assertIn("hata", json.loads(p.stdout))


if __name__ == "__main__":
    unittest.main()
