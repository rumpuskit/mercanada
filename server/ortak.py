"""Sunucu betiklerinin ortak parçaları: yollar, psql çağrısı, sakin listesinin yayını."""

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from mercanada_sim import sim

ROOT = Path(os.environ.get("MERCANADA_ROOT", "/opt/mercanada"))
PUBLIC = ROOT / "public"            # yayınlanan listenin yerel kopyası
SECRETS = ROOT / "secrets"          # yalnız mercanada kullanıcısı okur (chmod 700)
DB = os.environ.get("MERCANADA_DB", "mercanada")

RETURN_WINDOW_DAYS = 7


def psql(sql: str, db: str = DB, extra: list[str] | None = None) -> str:
    result = subprocess.run(
        ["psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-d", db, *(extra or []), "-f", "-"],
        input=sql, capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit("HATA (psql): " + result.stderr.strip())
    return result.stdout.strip()


def key_of(platform: str, handle: str) -> str:
    """Sakinin kalıcı kimliği: tohum değeri ve çıkma listesi bundan türetilir."""
    return f"{platform}:{sim.normalize_handle(handle)}"


def opt_out_hash(platform: str, handle: str) -> str:
    return hashlib.sha256(key_of(platform, handle).encode()).hexdigest()


def publish(db: str = DB) -> dict:
    """Aktif sakinleri ve iskelede bekleyen sayısını public/sakinler.json'a yazar (atomik) ve
    Cloudflare Worker'ına yollar; site listeyi oradan okur (sunucuya ziyaretçi trafiği gelmez)."""
    rows = psql("""
        SELECT coalesce(json_agg(json_build_array(
                   CASE WHEN hidden THEN NULL ELSE handle END, seed, slot, arrived_day,
                   CASE WHEN overrides = '{}'::jsonb THEN NULL ELSE overrides END) ORDER BY slot), '[]')
        FROM sakinler WHERE left_day IS NULL;
    """, db)
    sakinler = json.loads(rows or "[]")
    takipci = psql("SELECT deger FROM durum WHERE anahtar = 'tt_takipci'", db)
    takipci = json.loads(takipci)["sayi"] if takipci else None
    son = psql("SELECT coalesce(max(extract(epoch FROM imported_at))::bigint, 0) FROM aktarimlar", db)
    data = {
        "v": 1,
        "guncel": int(time.time()),
        "son_aktarim": int(son or 0),
        "takipci": takipci,
        # Takip etmiş ama henüz aktarımla taşınmamış olanlar: iskelede valizleriyle bekler.
        "bekleyen": max(0, takipci - len(sakinler)) if takipci is not None else 0,
        # [handle | null (adı gizli), seed, slot, arrived_day, overrides | null]
        "sakinler": sakinler,
    }
    PUBLIC.mkdir(parents=True, exist_ok=True)
    tmp = PUBLIC / "sakinler.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(PUBLIC / "sakinler.json")
    return {"sakin": len(sakinler), "bekleyen": data["bekleyen"], "worker": push((PUBLIC / "sakinler.json").read_bytes())}


def push(body: bytes) -> str:
    try:
        conf = json.loads((SECRETS / "yayin.json").read_text())
    except FileNotFoundError:
        return "atlandı (secrets/yayin.json yok)"
    req = urllib.request.Request(conf["url"], data=body, method="PUT", headers={
        "Authorization": f"Bearer {conf['anahtar']}", "Content-Type": "application/json",
        "User-Agent": "mercanada-sunucu/1"})  # Cloudflare varsayılan Python istemcisini engelliyor
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return "ok" if r.status == 200 else f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        sys.exit(f"HATA: liste Worker'a yollanamadı (HTTP {e.code}); yerel kopya yazıldı, tekrar dene: python3 -c 'import ortak; ortak.publish()'")
    except urllib.error.URLError as e:
        sys.exit(f"HATA: liste Worker'a yollanamadı ({e.reason}); yerel kopya yazıldı, tekrar dene")
