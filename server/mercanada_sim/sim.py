"""Mercanada simülasyonunun Python karşılığı.

web/src/sim.js ile bit bit aynı sonucu vermeli; kural değişirse ikisi birlikte değişir
ve tests/test_parity.py çalıştırılır. Sakin sözlüğü: {handle, seed, slot, arrived_day, overrides?}.
"""

import json
import math
from functools import cache
from pathlib import Path

MASK = 0xFFFFFFFF
TZ_OFFSET = 3 * 3600
PLACE_HOME = "ev"
PLACE_WORK = "is"
OUTING_LATEST_HOBBY = 1200   # 20:00
OUTING_LATEST_MEYDAN = 1290  # 21:30

CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "catalog.json"


@cache
def catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def cap(key: str) -> int:
    return int(catalog()["kapasite"][key])


# --- hash (mhash.gd) ---

def mul32(a: int, b: int) -> int:
    return (a * b) & MASK


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h = mul32(h ^ byte, 0x01000193)
    return h


def mix(x: int) -> int:
    x ^= x >> 16
    x = mul32(x, 0x7FEB352D)
    x ^= x >> 15
    x = mul32(x, 0x846CA68B)
    x ^= x >> 16
    return x


def combine(a: int, b: int) -> int:
    return mix(a ^ mul32(b & MASK, 0x9E3779B1))


def roll(seed: int, tag: str, n: int = 0) -> int:
    return combine(combine(seed, fnv1a(tag)), n)


def normalize_handle(handle: str) -> str:
    return handle.strip().removeprefix("@").lower()


def seed_of(handle: str) -> int:
    return fnv1a(normalize_handle(handle))


# --- saat (city_clock.gd) ---

def day_of(unix: float) -> int:
    return math.floor((unix + TZ_OFFSET) / 86400.0)


def weekday(day: int) -> int:
    return (day + 3) % 7


# --- adres (address.gd) ---

def address_parts(slot: int) -> dict:
    per_bina = cap("daire_per_bina")
    per_sokak = per_bina * cap("bina_per_sokak")
    per_mahalle = per_sokak * cap("sokak_per_mahalle")
    mahalle, in_mahalle = divmod(slot, per_mahalle)
    return {
        "ada": mahalle // cap("mahalle_per_ada"),
        "mahalle": mahalle,
        "sokak": in_mahalle // per_sokak,
        "bina": (in_mahalle % per_sokak) // per_bina,
        "daire": in_mahalle % per_bina,
    }


def ada_name(ada: int) -> str:
    names = catalog()["adalar"]
    name = names[ada % len(names)]
    return name if ada < len(names) else f"{name} {ada // len(names) + 1}"


def mahalle_name(mahalle: int) -> str:
    names = catalog()["mahalleler"]
    name = names[mahalle % len(names)]
    if mahalle >= len(names):
        name += f" {mahalle // len(names) + 1}"
    return name + " Mahallesi"


def sokak_name(mahalle: int, sokak: int) -> str:
    names = catalog()["sokaklar"]
    return names[(sokak + mahalle * 7) % len(names)] + " Sokağı"


def address_text(slot: int) -> str:
    p = address_parts(slot)
    return (
        f"{sokak_name(p['mahalle'], p['sokak'])} No {p['bina'] * 2 + 1}, Daire {p['daire'] + 1}, "
        f"{mahalle_name(p['mahalle'])}, {ada_name(p['ada'])}"
    )


# --- sakin (resident_sim.gd) ---

def _pick_weighted(items: list, r: int) -> int:
    x = r % sum(int(item["agirlik"]) for item in items)
    for i, item in enumerate(items):
        x -= int(item["agirlik"])
        if x < 0:
            return i
    return len(items) - 1


def _find(items: list, id_: str) -> int:
    return next((i for i, item in enumerate(items) if item["id"] == id_), -1)


def _override(r: dict, key: str) -> str:
    return str((r.get("overrides") or {}).get(key, ""))


def job(r: dict) -> dict:
    jobs = catalog()["meslekler"]
    i = _find(jobs, _override(r, "meslek"))
    if i < 0:
        # Kadrolu işler (fener bekçisi, cankurtaran): geliş sırasına göre sabit kontenjan, nüfusla orantılı.
        slot = int(r.get("slot", -1))
        i = next((k for k, j in enumerate(jobs) if j.get("kadro") and slot >= 0 and slot % int(j["kadro"]["her"]) == int(j["kadro"]["sira"])), -1)
    if i < 0:
        i = _pick_weighted(jobs, roll(r["seed"], "meslek"))
    return jobs[i]


def workplace(r: dict) -> dict:
    kind = job(r)["yer"]
    names = catalog()["isyerleri"][kind]
    index = roll(r["seed"], "isyeri") % len(names)
    return {"kind": kind, "index": index, "name": names[index]}


def tenure(r: dict, day: int) -> int:
    return max(0, day - int(r["arrived_day"]))


def rank(r: dict, day: int) -> int:
    shift = roll(r["seed"], "terfi") % 7
    t = tenure(r, day)
    return sum(1 for threshold in catalog()["terfi_gunleri"] if t >= int(threshold) + shift)


def title(r: dict, day: int) -> str:
    ladder = job(r)["kademeler"]
    return ladder[min(rank(r, day), len(ladder) - 1)]


def hobby(r: dict) -> dict:
    hobbies = catalog()["hobiler"]
    i = _find(hobbies, _override(r, "hobi"))
    if i < 0:
        i = roll(r["seed"], "hobi") % len(hobbies)
    return hobbies[i]


def pet(r: dict, day: int) -> str:
    requested = _override(r, "evcil")
    if requested:
        return requested
    if roll(r["seed"], "evcil") % 100 >= int(catalog()["evcil_orani"]):
        return ""
    if tenure(r, day) < 5 + roll(r["seed"], "evcil_gun") % 25:
        return ""
    pets = catalog()["evcil_hayvanlar"]
    return pets[roll(r["seed"], "evcil_tur") % len(pets)]


def look(r: dict) -> dict:
    result = {key: roll(r["seed"], "gorunus_" + key) % int(n) for key, n in catalog()["gorunus"].items()}
    result["boy"] = 92 + roll(r["seed"], "boy") % 17
    return result


def works_on(r: dict, day: int) -> bool:
    if job(r).get("calismaz"):
        return False  # emekli
    wd = weekday(day)
    if not job(r)["hafta_sonu"]:
        works = wd < 5
    else:
        # Hafta sonu da açık iş yerlerinde çalışanların haftada iki izin günü var.
        off = roll(r["seed"], "izin") % 7
        works = wd != off and wd != (off + 3) % 7
    # Yarı zamanlı çalışanlar (yaklaşık üçte biri) haftada iki gün daha evde ya da dışarıda.
    if works and roll(r["seed"], "yarim") % 100 < 30:
        p = roll(r["seed"], "yarim_gun") % 5
        if wd == p or wd == (p + 2) % 5:
            works = False
    return works


def _end(plan: list) -> int:
    return plan[-1]["son"] if plan else 0


def _add(plan: list, until: int, ne: str, yer: str) -> None:
    start = _end(plan)
    if until > start:
        plan.append({"bas": start, "son": until, "ne": ne, "yer": yer})


def _travel(plan: list, commute: int, from_: str, to: str) -> None:
    start = _end(plan)
    plan.append({"bas": start, "son": start + commute, "ne": "yol", "nereden": from_, "nereye": to})


def _evening_place(s: int, day: int, hobby_place: str) -> str:
    x = roll(s, "aksam", day) % 100
    if x < 25:
        return hobby_place
    if x < 55:
        return "meydan"
    return ""


def _activity_of(place: str) -> str:
    return "hobi" if place.startswith("hobi:") else place


def _night_out(plan: list, s: int, day: int, commute: int, sleep: int) -> None:
    """Akşam yemeğinden sonra bir kısmı yeniden çıkar (çarşı ya da mahalle çay bahçesi)."""
    if roll(s, "gece", day) % 100 >= 35:
        return
    start = max(_end(plan) + 45, 1230 + roll(s, "gece_saat", day) % 60)
    duration = 60 + roll(s, "gece_sure", day) % 60
    if start + duration + commute > sleep - 10:
        return
    _add(plan, start - commute, "ev", PLACE_HOME)
    _travel(plan, commute, PLACE_HOME, "meydan")
    _add(plan, _end(plan) + duration, "meydan", "meydan")
    _travel(plan, commute, "meydan", PLACE_HOME)


def day_plan(r: dict, day: int) -> list:
    s = r["seed"]
    commute = 15 + roll(s, "yol") % 20
    hobby_place = "hobi:" + hobby(r)["yer"]
    plan: list = []

    sleep = 1350 + roll(s, "uyku", day) % 80
    if works_on(r, day) and job(r)["yer"] == "ev":
        # Evden çalışan: sabah evde masasında; çoğu öğle arasında kısa bir çıkış yapar; akşam işçiler gibi.
        shift = catalog()["vardiyalar"][job(r)["vardiya"]]
        start, end = int(shift["bas"]), int(shift["son"])
        _add(plan, start - 40 - roll(s, "uyan", day) % 40, "uyku", PLACE_HOME)
        lunch = 720 + roll(s, "ogle_saat", day) % 45
        if roll(s, "ogle", day) % 100 < 45:
            _add(plan, lunch - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, _end(plan) + 30 + roll(s, "ogle_sure", day) % 30, "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
        leave = end + roll(s, "gec_cikis", day) % 31
        outing = _evening_place(s, day, hobby_place)
        duration = 60 + roll(s, "sure", day) % 120
        latest = OUTING_LATEST_HOBBY if outing.startswith("hobi:") else OUTING_LATEST_MEYDAN
        if outing and leave + commute <= latest and leave + 2 * commute + duration <= sleep - 10:
            _add(plan, leave, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, outing)
            _add(plan, _end(plan) + duration, _activity_of(outing), outing)
            _travel(plan, commute, outing, PLACE_HOME)
        _night_out(plan, s, day, commute, sleep)
    elif works_on(r, day):
        shift = catalog()["vardiyalar"][job(r)["vardiya"]]
        start, end = int(shift["bas"]), int(shift["son"])
        if job(r)["vardiya"] == "erken":
            sleep = 1290 + roll(s, "uyku", day) % 60
        # İşe 0-24 dk erken varılır, işten 0-15 dk geç çıkılır: herkes aynı otobüse/aynı dakikaya yığılmaz.
        arrive = start - roll(s, "erken_varis", day) % 25
        leave = end + roll(s, "gec_cikis", day) % 16
        if job(r)["vardiya"] == "gec":
            # Akşam vardiyası: sabah kalkar, işe gitmeden önce çoğu bir süre dışarı çıkar.
            wake = 510 + roll(s, "uyan", day) % 90
            _add(plan, wake, "uyku", PLACE_HOME)
            out = wake + 60 + roll(s, "sabah_cikis", day) % 60
            length = 60 + roll(s, "sabah_sure", day) % 60
            if roll(s, "sabah", day) % 100 < 60 and out + length + commute <= arrive - commute - 30:
                _add(plan, out - commute, "ev", PLACE_HOME)
                _travel(plan, commute, PLACE_HOME, "meydan")
                _add(plan, _end(plan) + length, "meydan", "meydan")
                _travel(plan, commute, "meydan", PLACE_HOME)
        else:
            _add(plan, arrive - commute - 45 - roll(s, "uyan", day) % 30, "uyku", PLACE_HOME)
        _add(plan, arrive - commute, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, PLACE_WORK)
        _add(plan, leave, "is", PLACE_WORK)
        outing = _evening_place(s, day, hobby_place)
        duration = 60 + roll(s, "sure", day) % 120
        # Hobiler 20:00'den, meydan buluşmaları 21:30'dan önce başlar.
        latest = OUTING_LATEST_HOBBY if outing.startswith("hobi:") else OUTING_LATEST_MEYDAN
        if outing and leave + commute <= latest and leave + 3 * commute + duration <= sleep - 10:
            _travel(plan, commute, PLACE_WORK, outing)
            _add(plan, _end(plan) + duration, _activity_of(outing), outing)
            _travel(plan, commute, outing, PLACE_HOME)
        else:
            _travel(plan, commute, PLACE_WORK, PLACE_HOME)
        _night_out(plan, s, day, commute, sleep)
    else:
        wake = 450 + roll(s, "uyan", day) % 120
        _add(plan, wake, "uyku", PLACE_HOME)
        _add(plan, max(wake + 60, 600) + roll(s, "cikis", day) % 60, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, hobby_place)
        _add(plan, _end(plan) + 90 + roll(s, "sure", day) % 90, "hobi", hobby_place)
        _travel(plan, commute, hobby_place, PLACE_HOME)
        evening = 1140 + roll(s, "aksam_saat", day) % 90
        # Öğleden sonra çoğu yeniden çıkar: çarşıda alışveriş ve kahve, mahallede çay bahçesi, park.
        noon = max(_end(plan) + 40, 840 + roll(s, "ogle_saat", day) % 180)
        noon_len = min(90 + roll(s, "ogle_sure", day) % 90, evening - 2 * commute - 20 - noon)
        if roll(s, "ogle", day) % 100 < 75 and noon_len >= 45:
            _add(plan, noon - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, _end(plan) + noon_len, "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
        if roll(s, "aksam", day) % 100 < 55 and evening + 90 + commute <= sleep - 10:
            _add(plan, evening - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, min(_end(plan) + 90 + roll(s, "meydan_sure", day) % 90, sleep - 10 - commute), "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
    _add(plan, max(sleep, _end(plan)), "ev", PLACE_HOME)
    _add(plan, 1440, "uyku", PLACE_HOME)
    return plan
