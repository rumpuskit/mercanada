"""Godot ve Python simülasyonlarının aynı sonucu verdiğini doğrular.

Çalıştırma (proje kökünden): cd server && python3 -m unittest -v
"""

import json
import random
import subprocess
import unittest
from pathlib import Path

from mercanada_sim import sim

GAME_DIR = Path(__file__).resolve().parents[2] / "game"
DAY = 20_752  # 26 Ekim 2026 (Pazartesi)


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
        out.append({
            "seed": r["seed"],
            "address": sim.address_text(r["slot"]),
            "job": sim.job(r)["id"],
            "workplace": sim.workplace(r)["name"],
            "title": sim.title(r, day),
            "pet": sim.pet(r, day),
            "hobby": sim.hobby(r)["id"],
            "look": sim.look(r),
            "plans": [sim.day_plan(r, d) for d in range(day, day + 7)],
        })
    return out


def godot_vectors(day: int, handles: list[str]) -> list[dict]:
    result = subprocess.run(
        ["godot", "--headless", "--path", str(GAME_DIR), "-s", "tests/parity_vectors.gd", "--", str(day), *handles],
        capture_output=True, text=True, timeout=120, check=True,
    )
    for line in result.stdout.splitlines():
        if line.startswith("PARITY_JSON:"):
            return json.loads(line.removeprefix("PARITY_JSON:"))
    raise AssertionError("Godot çıktısında PARITY_JSON yok:\n" + result.stdout + result.stderr)


class ParityTest(unittest.TestCase):
    def test_godot_matches_python(self):
        handles = sample_handles(300)
        expected = python_vectors(DAY, handles)
        actual = godot_vectors(DAY, handles)
        self.assertEqual(len(actual), len(expected))
        for handle, a, e in zip(handles, actual, expected):
            self.assertEqual(a, e, handle)

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
