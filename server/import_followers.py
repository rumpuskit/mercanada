#!/usr/bin/env python3
"""Instagram takipçi dışa aktarımını şehre işler: yeni gelenler taşınır, ayrılanlar şehirden çıkar.

Kullanım:
    python3 import_followers.py instagram-export.zip [--day N] [--force] [--dry-run]

Girdi, Instagram "Bilgilerini indir" çıktısıdır (JSON biçimi): ya zip'in kendisi ya da içindeki
followers_*.json dosyaları. Kurallar:
  - Yeni takipçi, takip sırasına göre bir sonraki boş sıraya (slot) yerleşir.
  - Takibi bırakan ayrılır; 7 gün içinde dönerse aynı evine döner, daha sonra dönerse yeni ev alır
    (karakteri aynı kalır, çünkü tohum değeri ilk gelişte belirlenir).
  - Dışa aktarım aktif nüfusun %80'inden azını içeriyorsa yarım dosya olabilir; --force olmadan işlenmez.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from mercanada_sim import sim

HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
FOLLOWERS_FILE_RE = re.compile(r"followers_\d+\.json$")
RETURN_WINDOW_DAYS = 7
MIN_RATIO = 0.8


def read_export(paths: list[Path]) -> tuple[dict[str, int], str]:
    """{handle: takip zaman damgası} ve dosyaların sha256 özeti."""
    blobs: list[bytes] = []
    for path in paths:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as z:
                blobs += [z.read(n) for n in sorted(z.namelist()) if FOLLOWERS_FILE_RE.search(n)]
        else:
            blobs.append(path.read_bytes())
    if not blobs:
        sys.exit("HATA: dışa aktarımda followers_*.json bulunamadı")

    followers: dict[str, int] = {}
    for blob in blobs:
        for item in json.loads(blob):
            handle, ts = _parse_item(item)
            if handle and HANDLE_RE.match(handle):
                followers[handle] = min(ts, followers.get(handle, ts))
    return followers, hashlib.sha256(b"".join(blobs)).hexdigest()


def _parse_item(item: dict) -> tuple[str, int]:
    entry = (item.get("string_list_data") or [{}])[0]
    handle = entry.get("value") or item.get("title") or ""
    if not handle and entry.get("href"):
        handle = entry["href"].rstrip("/").rsplit("/", 1)[-1]
    return sim.normalize_handle(handle), int(entry.get("timestamp") or 0)


def psql(sql: str, db: str, extra: list[str] | None = None) -> str:
    result = subprocess.run(
        ["psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-d", db, *(extra or []), "-f", "-"],
        input=sql, capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit("HATA (psql): " + result.stderr.strip())
    return result.stdout.strip()


IMPORT_SQL = """
BEGIN;
CREATE TEMP TABLE gelenler (handle text PRIMARY KEY, seed bigint NOT NULL, ts bigint NOT NULL) ON COMMIT DROP;
COPY gelenler FROM STDIN;
{rows}
\\.

-- 7 gün içinde dönenler eski evine döner.
WITH d AS (
    UPDATE sakinler s SET left_day = NULL
    FROM gelenler g
    WHERE s.handle = g.handle AND s.left_day IS NOT NULL AND :day - s.left_day <= {window}
    RETURNING 1
) SELECT count(*) AS donen FROM d \\gset

-- Yeniler ve uzun aradan sonra dönenler takip sırasına göre sıradaki evlere yerleşir.
WITH yeni AS (
    SELECT g.handle, g.seed, g.ts
    FROM gelenler g LEFT JOIN sakinler s ON s.handle = g.handle
    WHERE s.handle IS NULL OR s.left_day IS NOT NULL
), numarali AS (
    SELECT handle, seed,
           (SELECT coalesce(max(slot), -1) FROM sakinler) + row_number() OVER (ORDER BY ts, handle) AS slot
    FROM yeni
), d AS (
    INSERT INTO sakinler (handle, seed, slot, arrived_day)
    SELECT handle, seed, slot, :day FROM numarali
    ON CONFLICT (handle) DO UPDATE SET slot = EXCLUDED.slot, arrived_day = EXCLUDED.arrived_day, left_day = NULL
    RETURNING 1
) SELECT count(*) AS gelen FROM d \\gset

WITH d AS (
    UPDATE sakinler s SET left_day = :day
    WHERE s.left_day IS NULL AND NOT EXISTS (SELECT 1 FROM gelenler g WHERE g.handle = s.handle)
    RETURNING 1
) SELECT count(*) AS ayrilan FROM d \\gset

INSERT INTO aktarimlar (day, dosya_sha256, takipci, gelen, donen, ayrilan)
VALUES (:day, :'sha', :takipci, :gelen, :donen, :ayrilan);

SELECT json_build_object(
    'gelen', :gelen, 'donen', :donen, 'ayrilan', :ayrilan,
    'nufus', (SELECT count(*) FROM sakinler WHERE left_day IS NULL));
{end};
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("exports", nargs="+", type=Path)
    parser.add_argument("--day", type=int, default=sim.day_of(time.time()), help="Türkiye günü (varsayılan: bugün)")
    parser.add_argument("--db", default="mercanada")
    parser.add_argument("--force", action="store_true", help="nüfus düşüşü kontrolünü atla")
    parser.add_argument("--dry-run", action="store_true", help="hesapla ama kaydetme")
    args = parser.parse_args()

    followers, sha = read_export(args.exports)
    if not followers:
        sys.exit("HATA: dışa aktarımda geçerli kullanıcı adı yok")
    if psql(f"SELECT 1 FROM aktarimlar WHERE dosya_sha256 = '{sha}'", args.db):
        sys.exit("Bu dışa aktarım daha önce işlenmiş, atlandı.")
    active = int(psql("SELECT count(*) FROM sakinler WHERE left_day IS NULL", args.db))
    if len(followers) < MIN_RATIO * active and not args.force:
        sys.exit(f"HATA: dışa aktarımda {len(followers)} kişi var, şehirde {active}. "
                 "Yarım dosya olabilir; eminsen --force ile çalıştır.")

    rows = "\n".join(f"{h}\t{sim.seed_of(h)}\t{ts}" for h, ts in followers.items())
    sql = IMPORT_SQL.format(rows=rows, window=RETURN_WINDOW_DAYS, end="ROLLBACK" if args.dry_run else "COMMIT")
    variables = ["-v", f"day={args.day}", "-v", f"sha={sha}", "-v", f"takipci={len(followers)}"]
    result = json.loads(psql(sql, args.db, variables))
    print(("[DENEME] " if args.dry_run else "") + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
