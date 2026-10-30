"""Web (JS) ve Python simülasyonlarının aynı sonucu verdiğini doğrular.

Çalıştırma (proje kökünden): cd server && python3 -m unittest -v
"""

import json
import math
import random
import subprocess
import unittest
from pathlib import Path

from mercanada_sim import sim

VECTORS_JS = Path(__file__).resolve().parents[2] / "web" / "tests" / "parity_vectors.mjs"
DAY = 20_752  # 26 Ekim 2026 (Pazartesi)
LEVELS = [0, 35, 230, 700, 2120, "inf"]  # boş ada, ilk dükkânlar, sağlık merkezi, liman, ikinci mahalle, tam ada


def sample_handles(n: int) -> list[str]:
    rng = random.Random(42)
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789._"
    handles = ["mercanada", "@Ali.Veli_", "zeynep_92"]
    while len(handles) < n:
        handles.append("".join(rng.choice(alphabet) for _ in range(rng.randint(3, 30))))
    return handles


def python_vectors(day: int, handles: list[str]) -> list[dict]:
    out = []
    for i, handle in enumerate(handles, start=1):
        r = {"handle": handle, "seed": sim.seed_of(handle), "slot": i * 977, "arrived_day": day - i % 60}
        if i % 7 == 3:
            r["overrides"] = {"meslek": "polis" if i % 2 else "muhtar"}
        elif i % 11 == 5:
            r["overrides"] = {"meslek": "okul_muduru" if i % 2 else "hakim"}
        out.append({
            "seed": r["seed"],
            "address": sim.address_text(r["slot"]),
            "job": sim.job(r)["id"],
            "dream": sim.dream_job(r)["id"],
            "workplace": sim.workplace(r)["name"],
            "title": sim.title(r, day),
            "pet": sim.pet(r, day),
            "hobby": sim.hobby(r)["id"],
            "look": sim.look(r),
            "plans": [sim.day_plan(r, d) for d in range(day, day + 7)],
        })
    return out


def js_vectors(day: int, level, handles: list[str]) -> list[dict]:
    result = subprocess.run(
        ["node", str(VECTORS_JS), str(day), str(level), *handles],
        capture_output=True, text=True, timeout=120, check=True,
    )
    return json.loads(result.stdout)


class ParityTest(unittest.TestCase):
    def tearDown(self):
        sim.set_town(math.inf)

    def test_js_matches_python(self):
        handles = sample_handles(300)
        for level in LEVELS:
            sim.set_town(math.inf if level == "inf" else level)
            expected = python_vectors(DAY, handles)
            actual = js_vectors(DAY, level, handles)
            self.assertEqual(len(actual), len(expected))
            for handle, a, e in zip(handles, actual, expected):
                self.assertEqual(a, e, f"{handle} (düzey {level})")

    def test_locked_workplaces_fall_back(self):
        # Boş adada kimse kilitli bir iş yerinde çalışmaz; her iş yeri türü gelişim tablosunda.
        sim.set_town(0)
        for handle in sample_handles(400):
            r = {"seed": sim.seed_of(handle), "slot": sim.seed_of(handle) % 5000, "arrived_day": DAY}
            wp = sim.workplace(r)
            self.assertTrue(sim.is_open(f"{wp['kind']}:{wp['index']}"), handle)
            self.assertIn(sim.job(r)["yer"], ("anakara", "ev", "fener"), handle)
        always = {"anakara", "ev", "fener"}
        for kind, names in sim.catalog()["isyerleri"].items():
            for i in range(len(names)):
                if kind not in always:
                    self.assertGreater(sim.stage_of(f"{kind}:{i}"), 0, f"{kind}:{i} gelişim tablosunda yok")

    def test_plans_cover_whole_day(self):
        for handle in sample_handles(500):
            r = {"seed": sim.seed_of(handle), "arrived_day": DAY}
            for d in range(DAY, DAY + 14):
                plan = sim.day_plan(r, d)
                self.assertEqual(plan[0]["bas"], 0, handle)
                self.assertEqual(plan[-1]["son"], 1440, handle)
                for prev, cur in zip(plan, plan[1:]):
                    self.assertEqual(prev["son"], cur["bas"], handle)
                    self.assertLess(cur["bas"], cur["son"], handle)

    def test_known_hash_values(self):
        # FNV-1a referans değerleri
        self.assertEqual(sim.fnv1a(""), 0x811C9DC5)
        self.assertEqual(sim.fnv1a("a"), 0xE40C292C)
        self.assertEqual(sim.seed_of("@Mercanada "), sim.seed_of("mercanada"))


if __name__ == "__main__":
    unittest.main()
