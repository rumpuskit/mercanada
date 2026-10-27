#!/usr/bin/env python3
"""Takipçi dışa aktarımını şehre işler: yeni gelenler taşınır, takibi bırakanlar adadan ayrılır.

Kullanım:
    python3 import_followers.py tiktok-export.zip [--platform tt] [--day N] [--force] [--dry-run]

Girdi TikTok "Verilerini indir" çıktısıdır (JSON ya da TXT): zip'in kendisi ya da içindeki
user_data*.json / Follower*.txt. Instagram dışa aktarımı da okunur (--platform ig, followers_*.json).
Kurallar:
  - Takibi bırakan bu aktarımda ayrılır; evi 7 gün tutulur, bu sürede dönerse aynı evine döner.
  - 7 günü geçen ayrılanın kaydı silinir (KVKK: gerekenden uzun tutulmaz), evi boşa çıkar.
  - Yeni gelenler takip sırasına göre önce boş evlere, sonra adanın ucundaki yeni evlere yerleşir.
    Böylece mahalleler delik deşik kalmaz, tek kişilik görevler (fener bekçisi) de boş kalmaz.
  - Çıkma isteyenler (cikanlar) bir daha taşınmaz.
  - Dışa aktarım aktif nüfusun %80'inden azını içeriyorsa yarım dosya olabilir; --force olmadan işlenmez.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from mercanada_sim import sim
from ortak import DB, RETURN_WINDOW_DAYS, key_of, opt_out_hash, psql, publish

HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
MIN_RATIO = 0.8
NAME_KEYS = ("username", "user_name", "uniqueid", "unique_id")


# --- TikTok ---

def _tiktok_json(blob: bytes) -> dict[str, int]:
    """user_data.json içinde takipçi listesini arar. Biçim yıllar içinde değişti
    (Activity → "Follower List" → FansList, ya da "Follower" → FansList); bu yüzden ağaçta
    adı 'fan'/'follower' geçen ama 'following' geçmeyen bir yolun altındaki kişi listeleri toplanır."""
    out: dict[str, int] = {}

    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + "/" + str(k).lower())
        elif isinstance(node, list):
            if "following" in path or not ("fan" in path or "follower" in path):
                for v in node:
                    walk(v, path)
                return
            for item in node:
                if not isinstance(item, dict):
                    continue
                low = {str(k).lower().replace(" ", "_"): v for k, v in item.items()}
                name = next((low[k] for k in NAME_KEYS if k in low), None)
                if name:
                    _add(out, str(name), _tiktok_date(low.get("date")))

    walk(json.loads(blob), "")
    return out


def _tiktok_txt(text: str) -> dict[str, int]:
    """TXT biçimi: 'Date: 2026-10-28 10:12:03' ve 'Username: ali.veli' satırları."""
    out: dict[str, int] = {}
    date = None
    for line in text.splitlines():
        k, _, v = line.partition(":")
        k = k.strip().lower()
        if k == "date":
            date = v.strip()
        elif k in ("username", "user name"):
            _add(out, v.strip(), _tiktok_date(date))
            date = None
    return out


def _tiktok_date(value) -> int:
    if not value:
        return 0
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return int(datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            pass
    return 0


# --- Instagram ---

def _instagram_json(blob: bytes) -> dict[str, int]:
    out: dict[str, int] = {}
    data = json.loads(blob)
    if isinstance(data, dict):  # bazı sürümlerde {"relationships_followers": [...]}
        data = next((v for v in data.values() if isinstance(v, list)), [])
    for item in data:
        entry = (item.get("string_list_data") or [{}])[0]
        handle = entry.get("value") or item.get("title") or ""
        if not handle and entry.get("href"):
            handle = entry["href"].rstrip("/").rsplit("/", 1)[-1]
        _add(out, handle, int(entry.get("timestamp") or 0))
    return out


def _add(out: dict[str, int], handle: str, ts: int) -> None:
    h = sim.normalize_handle(handle)
    if HANDLE_RE.match(h):
        out[h] = min(ts, out.get(h, ts)) if ts else out.get(h, 0)


def read_export(paths: list[Path], platform: str) -> tuple[dict[str, int], str]:
    """{handle: takip zaman damgası (UTC, saniye)} ve okunan dosyaların sha256 özeti."""
    if platform == "ig":
        wanted = re.compile(r"followers_\d+\.json$")
    else:
        wanted = re.compile(r"(user_data[^/]*\.json|follower[^/]*\.txt)$", re.I)
    blobs: list[tuple[str, bytes]] = []
    for path in paths:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as z:
                blobs += [(n, z.read(n)) for n in sorted(z.namelist()) if wanted.search(n) and "following" not in n.lower()]
        else:
            blobs.append((path.name, path.read_bytes()))
    if not blobs:
        sys.exit("HATA: dışa aktarımda takipçi dosyası bulunamadı")

    followers: dict[str, int] = {}
    for name, blob in blobs:
        if platform == "ig":
            part = _instagram_json(blob)
        elif name.lower().endswith(".txt"):
            part = _tiktok_txt(blob.decode("utf-8", "replace"))
        else:
            part = _tiktok_json(blob)
        for h, ts in part.items():
            followers[h] = min(ts, followers.get(h, ts)) if ts else followers.get(h, 0)
    return followers, hashlib.sha256(b"".join(b for _, b in blobs)).hexdigest()


IMPORT_SQL = """
BEGIN;
CREATE TEMP TABLE gelenler (handle text PRIMARY KEY, seed bigint NOT NULL, ts bigint NOT NULL) ON COMMIT DROP;
COPY gelenler FROM STDIN;
{rows}
\\.

-- 7 günden uzun süredir ayrı olanların kaydı silinir, evleri boşa çıkar.
WITH d AS (
    DELETE FROM sakinler WHERE left_day IS NOT NULL AND :day - left_day > {window} RETURNING 1
) SELECT count(*) AS silinen FROM d \\gset

-- 7 gün içinde dönenler eski evine döner.
WITH d AS (
    UPDATE sakinler s SET left_day = NULL
    FROM gelenler g
    WHERE s.platform = :'pf' AND s.handle = g.handle AND s.left_day IS NOT NULL
    RETURNING 1
) SELECT count(*) AS donen FROM d \\gset

-- Takibi bırakanlar ayrılır (evleri 7 gün tutulur).
WITH d AS (
    UPDATE sakinler s SET left_day = :day
    WHERE s.platform = :'pf' AND s.left_day IS NULL
      AND NOT EXISTS (SELECT 1 FROM gelenler g WHERE g.handle = s.handle)
    RETURNING 1
) SELECT count(*) AS ayrilan FROM d \\gset

-- Yeniler takip sırasına göre önce boş evlere, sonra adanın ucuna yerleşir.
WITH yeni AS (
    SELECT g.handle, g.seed, row_number() OVER (ORDER BY g.ts, g.handle) AS rn
    FROM gelenler g
    WHERE NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.platform = :'pf' AND s.handle = g.handle)
), bos AS (
    SELECT n AS slot, row_number() OVER (ORDER BY n) AS rn
    FROM generate_series(0, (SELECT coalesce(max(slot), -1) FROM sakinler) + (SELECT count(*) FROM yeni)) AS n
    WHERE NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.slot = n)
), d AS (
    INSERT INTO sakinler (platform, handle, seed, slot, arrived_day)
    SELECT :'pf', y.handle, y.seed, b.slot, :day FROM yeni y JOIN bos b USING (rn)
    RETURNING 1
) SELECT count(*) AS gelen FROM d \\gset

INSERT INTO aktarimlar (platform, day, dosya_sha256, takipci, gelen, donen, ayrilan, silinen)
VALUES (:'pf', :day, :'sha', :takipci, :gelen, :donen, :ayrilan, :silinen);

SELECT json_build_object(
    'gelen', :gelen, 'donen', :donen, 'ayrilan', :ayrilan, 'silinen', :silinen,
    'nufus', (SELECT count(*) FROM sakinler WHERE left_day IS NULL));
{end};
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("exports", nargs="+", type=Path)
    parser.add_argument("--platform", default="tt", choices=["tt", "ig"], help="tt: TikTok (varsayılan), ig: Instagram")
    parser.add_argument("--day", type=int, default=sim.day_of(time.time()), help="Türkiye günü (varsayılan: bugün)")
    parser.add_argument("--db", default=DB)
    parser.add_argument("--force", action="store_true", help="nüfus düşüşü kontrolünü atla")
    parser.add_argument("--dry-run", action="store_true", help="hesapla ama kaydetme")
    args = parser.parse_args()

    followers, sha = read_export(args.exports, args.platform)
    if not followers:
        sys.exit("HATA: dışa aktarımda geçerli kullanıcı adı yok")
    if psql(f"SELECT 1 FROM aktarimlar WHERE dosya_sha256 = '{sha}'", args.db):
        sys.exit("Bu dışa aktarım daha önce işlenmiş, atlandı.")
    opted_out = set(psql("SELECT ozet FROM cikanlar", args.db).split())
    followers = {h: ts for h, ts in followers.items() if opt_out_hash(args.platform, h) not in opted_out}
    active = int(psql(f"SELECT count(*) FROM sakinler WHERE left_day IS NULL AND platform = '{args.platform}'", args.db))
    if len(followers) < MIN_RATIO * active and not args.force:
        sys.exit(f"HATA: dışa aktarımda {len(followers)} kişi var, şehirde {active}. "
                 "Yarım dosya olabilir; eminsen --force ile çalıştır.")

    rows = "\n".join(f"{h}\t{sim.seed_of(key_of(args.platform, h))}\t{ts}" for h, ts in followers.items())
    sql = IMPORT_SQL.format(rows=rows, window=RETURN_WINDOW_DAYS, end="ROLLBACK" if args.dry_run else "COMMIT")
    variables = ["-v", f"day={args.day}", "-v", f"sha={sha}", "-v", f"takipci={len(followers)}", "-v", f"pf={args.platform}"]
    result = json.loads(psql(sql, args.db, variables))
    if not args.dry_run:
        result["yayin"] = publish(args.db)
    print(("[DENEME] " if args.dry_run else "") + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
