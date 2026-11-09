#!/usr/bin/env python3
"""Belediye başkanlığı seçimi: belediye açılınca (katalog: belediye:0) adanın ilk seçimi başlar.

Seçim 3 gün sürer; kazananın dönemi 30 gün, sonra yeni seçim. Her şey yorumlarla:
    adayım / başkan adayıyım / belediye başkanı olmak istiyorum   → aday olur (adada oturuyorsa)
    başkan olcam / başkan olabilir miyim / başkan benim           → aday (yalnız birinci tekil; "kim başkan olacak" değil)
    oy: @kullaniciadi / oyum @kullaniciadi                         → o adaya oy (seçmen adada oturmalı)
Seçmen başına tek oy; en son yazılan geçer. Sonuç: en çok oy, eşitlikte önce aday olan. Aday ya da oy
yoksa seçim bir dönem (3 gün) uzar. Kazanana "belediye_baskani" mesleği verilir (sim: belediyede çalışır);
dönemi biten ya da adadan ayrılan başkanın önceki mesleği geri gelir (overrides.eski_meslek).

Yorum metni saklanmaz; yalnız aday ve oy kayıtları (kim, kime) seçim boyunca tutulur. Seçim bitince oylar
silinir, yalnız sonuç (kazanan, oy sayıları) kalır.

    python3 secim.py durum    # açık seçim ve adaylar
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from istekler import katla  # noqa: E402
from mercanada_sim import sim  # noqa: E402
from ortak import DB, psql  # noqa: E402

MAKAM = "belediye_baskani"
SURE_GUN = 3
DONEM_GUN = 30

SEMA = """
CREATE TABLE IF NOT EXISTS secimler (
    id        bigserial   PRIMARY KEY,
    makam     text        NOT NULL,
    bas       timestamptz NOT NULL,
    son       timestamptz NOT NULL,
    durum     text        NOT NULL DEFAULT 'acik',   -- acik, bitti
    kazanan   text,
    sonuc     jsonb                                  -- [[aday, oy], ...]
);
CREATE TABLE IF NOT EXISTS secim_adaylar (
    secim_id  bigint      NOT NULL,
    handle    text        NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (secim_id, handle)
);
CREATE TABLE IF NOT EXISTS secim_oylar (
    secim_id  bigint      NOT NULL,
    secmen    text        NOT NULL,
    aday      text        NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (secim_id, secmen)
);
"""

ADAY = re.compile(r"\b(?:aday(?:im|iyim|ligimi|ligimizi)?|baskan adayi\w*|belediye baskani ol\w*|baskan olmak isti\w*"
                  r"|mesle[kg]\w* (?:belediye )?baskan\w*"
                  r"|baskan\w* (?:ben )?ol(?:acagim|acam|cagim|cam|ucam|urum|ayim|abilirim|abilir ?miyim|abilr\w*)|baskan\w* benim)\b")
# Yorumun tamamı "belediye başkanı" / "başkan ben" ise de adaylık (seçim videolarına kısa cevaplar).
TAM_ADAY = re.compile(r"^(?:ben )?(?:belediye |ada )?baskan(?:i|lik|ligi)?(?: ben\w*)?$")
OY = re.compile(r"\boy(?:um|umu|u|lar|larimi|umuz)?\b")
ETIKET = re.compile(r"@([A-Za-z0-9._]{2,24})")
# "@" unutulmuş oy: yorumun tamamı "oy:kullaniciadi" (iki nokta şart; "oyum yok" oy değil).
OY_DUZ = re.compile(r"^\s*oy\w*\s*:\s*([A-Za-z0-9._]{2,24})\s*$", re.I)
# "Kendime oy veriyorum": yazanın kendisine oy (yorumlar() yazanın adıyla değiştirir).
# "kendime oy veriyorum", ve sözcük sırası ters: "oyum kendime", "oy kendime", "oyun kendime" (yazım hatası, 9 Kasım).
KENDIME = re.compile(r"\bkendi(?:me|mize)\b(?: \w+){0,2} (?:oy|veri)|\boy(?:um|umu|un|u)?\b(?: \w+)? kendi(?:me|mize)\b")
KENDI = "__kendi__"
# Biçime uymayan oylar (insanlar "oy: @ad" yazmıyor): yorumda bir adayın adı geçiyorsa ve ya yorum neredeyse
# yalnız o addan ibaretse ya da oy niyeti sözcüğü varsa oy sayılır. Ad: kullanıcı adı (@'li/@'siz, en çok 2 harf
# yanlış), ya da TikTok'taki görünen adı ("@Ömerr": TikTok etiketi metne görünen adı yazar). Görünen adlar adayların
# kendi yorumlarından öğrenilir (yalnız adaylarınki, seçim boyunca durum tablosunda).
NIYET = re.compile(r"\b(?:oy(?:um|umu|u|umuz|umla|la|lar\w*)?|sec\w*|destek\w*|baskan\w*|kazan\w*|yasasin|helal|taraftar\w*)\b")
ETIKET_GENIS = re.compile(r"@([^\s@]{2,40})")
SOZCUK = re.compile(r"[A-Za-z0-9._]{3,24}")


def _yakin(a: str, b: str) -> int:
    """Levenshtein uzaklığı (kısa adlar için)."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def oy_niyeti(text: str, yazan: str, adaylar: set, isimler: dict) -> str | None:
    """Biçime uymayan yorumda kime oy verildiği (yoksa None)."""
    t = katla(text[:300])
    adaylar_tam = {}  # yorumda geçen ad parçası → aday
    etiketli = False  # aday @ ile etiketlendi mi (kısa yorumda etiket tek başına oy sayılır: "takip ettim @aday")
    for m in ETIKET_GENIS.finditer(text):
        ham = m.group(1).rstrip(".,!?:;")
        h = sim.normalize_handle(ham)
        if h in adaylar:
            adaylar_tam[ham] = h
        elif (a := isimler.get(katla(ham))) in adaylar:
            adaylar_tam[ham] = a
    etiketli = bool(adaylar_tam)
    if not adaylar_tam:
        for w in SOZCUK.findall(text):
            h = sim.normalize_handle(w)
            if h in adaylar:
                adaylar_tam[w] = h
            elif len(h) >= 5:
                # En yakın aday (en çok 2 harf fark), ikinciden açıkça daha yakınsa.
                uz = sorted((_yakin(a, h), a) for a in adaylar if abs(len(a) - len(h)) <= 2)
                if uz and uz[0][0] <= 2 and (len(uz) == 1 or uz[1][0] > uz[0][0]):
                    adaylar_tam[w] = uz[0][1]
    hedefler = set(adaylar_tam.values())
    if len(hedefler) != 1:
        return None
    hedef = hedefler.pop()
    # Yorumdan ad(lar) ve emoji/noktalama çıkınca geriye bir şey kalmıyorsa yalnız ad yazılmıştır.
    kalan = text
    for parca in adaylar_tam:
        kalan = kalan.replace("@" + parca, " ").replace(parca, " ")
    yalniz_ad = not katla(kalan).strip()
    if hedef == yazan and not NIYET.search(t):
        return None
    kisa = etiketli and len(katla(kalan).split()) <= 4
    return hedef if (yalniz_ad or kisa or NIYET.search(t)) else None


# Makamı bırakan (dönemi biten, yenilen ya da adadan ayrılan) başkanın önceki mesleği geri gelir.
BIRAK = f"""UPDATE sakinler SET overrides = (overrides - 'meslek' - 'eski_meslek')
    || CASE WHEN overrides ? 'eski_meslek' THEN jsonb_build_object('meslek', overrides->'eski_meslek') ELSE '{{}}'::jsonb END
    WHERE platform = 'tt' AND overrides->>'meslek' = '{MAKAM}' AND KOSUL;"""


def cozumle(text: str) -> dict:
    """{"aday": True} ya da {"oy": "kullaniciadi"}; ikisi de yoksa {}. Oy, @etiket ve "oy" kelimesi ister."""
    t = katla(text[:300])
    out = {}
    m = ETIKET.search(text)
    if m and OY.search(t):
        out["oy"] = sim.normalize_handle(m.group(1).rstrip("."))
    elif (d := OY_DUZ.match(text)):
        out["oy"] = sim.normalize_handle(d.group(1).rstrip("."))
    elif KENDIME.search(t):
        out["oy"] = KENDI
    # Aynı yorum hem adaylık hem kendine oy olabilir ("adayım, kendime veriyorum").
    if ADAY.search(t) or TAM_ADAY.match(t):
        if out.get("oy") in (None, KENDI):
            out["aday"] = True
    return out


def site_items(db: str = DB) -> list:
    """Sitede doğrulanmış sakinlerin verdiği adaylık ve oylar (Worker), yorum biçiminde: yorumlar() aynı kuralla
    işler (adada oturma, seçim süresi, son oy geçer). Çekilen en son zaman durum tablosunda tutulur."""
    import ortak
    son = psql("SELECT deger->>'ms' FROM durum WHERE anahtar = 'secim_site_son'", db) or "0"
    r = ortak.kayit("GET", f"/api/secim-oylari?since={int(son)}")
    if not r or not r.get("oylar"):
        return []
    items = [[f"site:{o['handle']}:{o['olusma']}", o["handle"], int(o["olusma"]) // 1000,
              "adayım" if o["tur"] == "aday" else f"oy @{o['aday']}"] for o in r["oylar"]]
    en_son = max(int(o["olusma"]) for o in r["oylar"])
    psql(f"""INSERT INTO durum (anahtar, deger) VALUES ('secim_site_son', '{{"ms": {en_son}}}')
             ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();""", db)
    return items


def acik(db: str = DB) -> dict | None:
    v = psql(f"""SELECT json_build_object('id', id, 'bas', extract(epoch FROM bas)::bigint, 'son', extract(epoch FROM son)::bigint)
                 FROM secimler WHERE makam = '{MAKAM}' AND durum = 'acik' ORDER BY id DESC LIMIT 1""", db)
    return json.loads(v) if v else None


def yorumlar(items: list, hesap: str | None, db: str = DB) -> dict:
    """[[yorum kimliği, ad, unix zaman, metin], ...] → açık seçimde aday ve oy kayıtları."""
    psql(SEMA, db)
    s = acik(db)
    if not s:
        return {}
    adaylar, oylar = [], []
    aday_adlari = set(psql(f"SELECT coalesce(string_agg(handle, ' '), '') FROM secim_adaylar WHERE secim_id = {s['id']}", db).split())
    # Adayların görünen adları (5. alan, Mac'teki okuyucu gönderir): "@Ömerr" etiketini adaya bağlamak için.
    kayit = json.loads(psql("SELECT coalesce(deger::text, '{}') FROM durum WHERE anahtar = 'secim_isimler'", db) or "{}")
    isimler = kayit.get("isim", {}) if kayit.get("id") == s["id"] else {}
    yeni_isim = False
    for it in items:
        if isinstance(it, list) and len(it) == 5 and isinstance(it[4], str) and it[4].strip():
            h, ad = sim.normalize_handle(str(it[1])), katla(it[4])
            if h in aday_adlari and ad and isimler.get(ad) != h:
                isimler[ad] = h if ad not in isimler else None  # iki aday aynı görünen adı taşıyorsa belirsiz
                yeni_isim = True
    if yeni_isim:
        psql("""INSERT INTO durum (anahtar, deger) VALUES ('secim_isimler', :'v'::jsonb)
                ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();""", db,
             ["-v", "v=" + json.dumps({"id": s["id"], "isim": isimler})])
    for it in items:
        if not (isinstance(it, list) and len(it) in (4, 5) and isinstance(it[2], int) and isinstance(it[3], str)):
            continue
        handle = sim.normalize_handle(str(it[1]))
        if not handle or handle == hesap or not (s["bas"] <= it[2] <= s["son"]):
            continue
        c = cozumle(it[3])
        if c.get("oy") == KENDI:
            # Kendine oy yalnız aday olan (ya da aynı yorumda aday olan) için anlamlı.
            if handle in aday_adlari or c.get("aday"):
                c["oy"] = handle
            else:
                c.pop("oy")
        elif not c and (hedef := oy_niyeti(it[3], handle, aday_adlari, isimler)):
            c = {"oy": hedef}
        if c.get("aday"):
            adaylar.append([handle, it[2]])
        if c.get("oy"):
            oylar.append([handle, c["oy"], it[2]])
    veri = json.dumps({"a": adaylar, "o": oylar})
    # Aday ve seçmen adada oturmalı. Aday kaydı ilk yazılanla kalır; oyda en son yazılan geçer.
    out = psql(f"""
        WITH v AS (SELECT :'veri'::json AS j),
        a AS (INSERT INTO secim_adaylar (secim_id, handle, created_at)
              SELECT {s['id']}, x->>0, min(to_timestamp((x->>1)::bigint))
              FROM v, json_array_elements(v.j->'a') x
              JOIN sakinler k ON k.platform = 'tt' AND k.handle = x->>0 AND k.left_day IS NULL
              GROUP BY x->>0
              ON CONFLICT (secim_id, handle) DO UPDATE SET created_at = least(secim_adaylar.created_at, EXCLUDED.created_at)
              RETURNING 1),
        o AS (INSERT INTO secim_oylar (secim_id, secmen, aday, created_at)
              SELECT DISTINCT ON (x->>0) {s['id']}, x->>0, x->>1, to_timestamp((x->>2)::bigint)
              FROM v, json_array_elements(v.j->'o') x
              JOIN sakinler k ON k.platform = 'tt' AND k.handle = x->>0 AND k.left_day IS NULL
              ORDER BY x->>0, (x->>2)::bigint DESC
              ON CONFLICT (secim_id, secmen) DO UPDATE SET aday = EXCLUDED.aday, created_at = EXCLUDED.created_at
              WHERE EXCLUDED.created_at >= secim_oylar.created_at
              RETURNING 1)
        SELECT json_build_object('aday', (SELECT count(*) FROM a), 'oy', (SELECT count(*) FROM o));
    """, db, ["-v", "veri=" + veri])
    return json.loads(out)


def ilerlet(db: str = DB) -> dict:
    """Taşınmada çağrılır: zamanı gelen seçimi açar, süresi dolanı sonuçlandırır. Ne olduysa döner."""
    psql(SEMA, db)
    out = {}
    # Gelişim düzeyi: kayıtlı zirve ya da bu taşınmadaki nüfus (zirve yayında güncellenir, bu ondan önce çalışır).
    zirve = psql("SELECT deger FROM durum WHERE anahtar = 'zirve'", db)
    zirve = max(json.loads(zirve)["sayi"] if zirve else 0,
                int(psql("SELECT coalesce(max(slot) + 1, 0) FROM sakinler WHERE platform = 'tt' AND left_day IS NULL", db)))
    if zirve < sim.stage_of("belediye:0"):
        return out
    # Adadan ayrılan başkan makamı bırakır (önceki mesleği geri gelir).
    psql(BIRAK.replace("KOSUL", "left_day IS NOT NULL"), db)
    s = acik(db)
    now = int(time.time())
    if s and now >= s["son"]:
        sonuc = json.loads(psql(f"""
            SELECT coalesce(json_agg(json_build_array(a.handle, coalesce(o.n, 0)) ORDER BY coalesce(o.n, 0) DESC, a.created_at), '[]')
            FROM secim_adaylar a
            JOIN sakinler k ON k.platform = 'tt' AND k.handle = a.handle AND k.left_day IS NULL
            LEFT JOIN (SELECT o.aday, count(*) n FROM secim_oylar o
                       JOIN sakinler k2 ON k2.platform = 'tt' AND k2.handle = o.secmen AND k2.left_day IS NULL
                       WHERE o.secim_id = {s['id']} GROUP BY o.aday) o ON o.aday = a.handle
            WHERE a.secim_id = {s['id']}""", db))
        if not sonuc:
            # Aday yok: seçim bir süre daha açık kalır.
            psql(f"UPDATE secimler SET son = son + make_interval(days => {SURE_GUN}) WHERE id = {s['id']}", db)
            return {"secim": "uzadi"}
        kazanan = sonuc[0][0]
        psql(f"""BEGIN;
            {BIRAK.replace("KOSUL", "true")}
            UPDATE sakinler SET overrides = overrides || jsonb_build_object('meslek', '{MAKAM}')
                || CASE WHEN overrides ? 'meslek' THEN jsonb_build_object('eski_meslek', overrides->'meslek') ELSE '{{}}'::jsonb END
                WHERE platform = 'tt' AND handle = :'kazanan';
            UPDATE secimler SET durum = 'bitti', kazanan = :'kazanan', sonuc = :'sonuc'::jsonb WHERE id = {s['id']};
            DELETE FROM secim_oylar WHERE secim_id = {s['id']};
            COMMIT;""", db, ["-v", f"kazanan={kazanan}", "-v", "sonuc=" + json.dumps(sonuc)])
        return {"secim": "bitti", "kazanan": kazanan, "sonuc": sonuc}
    if s:
        return out
    # Açık seçim yok: ilk seçim ya da dönemi biten başkan.
    son = psql(f"""SELECT coalesce(extract(epoch FROM max(son))::bigint, 0) FROM secimler
                   WHERE makam = '{MAKAM}' AND durum = 'bitti'""", db)
    if int(son) and now < int(son) + DONEM_GUN * 86400:
        return out
    psql(f"""INSERT INTO secimler (makam, bas, son)
             VALUES ('{MAKAM}', now(), now() + make_interval(days => {SURE_GUN}))""", db)
    return {"secim": "basladi"}


def yayin(db: str = DB) -> dict | None:
    """Sitenin göstereceği seçim bilgisi: açık seçim (bitiş, adaylar ve oyları) ya da son sonuç."""
    psql(SEMA, db)
    v = psql(f"""
        SELECT json_build_object(
            'durum', s.durum, 'bitis', extract(epoch FROM s.son)::bigint, 'kazanan', s.kazanan,
            'adaylar', CASE WHEN s.durum = 'bitti' THEN s.sonuc::json ELSE (
                SELECT coalesce(json_agg(json_build_array(a.handle, coalesce(o.n, 0)) ORDER BY coalesce(o.n, 0) DESC, a.created_at), '[]')
                FROM secim_adaylar a
                JOIN sakinler k ON k.platform = 'tt' AND k.handle = a.handle AND k.left_day IS NULL AND NOT k.hidden
                LEFT JOIN (SELECT aday, count(*) n FROM secim_oylar o
                           JOIN sakinler k2 ON k2.platform = 'tt' AND k2.handle = o.secmen AND k2.left_day IS NULL
                           WHERE o.secim_id = s.id GROUP BY aday) o ON o.aday = a.handle
                WHERE a.secim_id = s.id) END)
        FROM secimler s WHERE s.makam = '{MAKAM}' ORDER BY s.id DESC LIMIT 1""", db)
    if not v:
        return None
    out = json.loads(v)
    # Adını gizleyenler sitede görünmez (oyları sayılır).
    gizli = set(json.loads(psql("SELECT coalesce(json_agg(handle), '[]') FROM sakinler WHERE platform = 'tt' AND hidden", db)))
    out["adaylar"] = [[None if a in gizli else a, n] for a, n in out["adaylar"] or []]
    if out["kazanan"] in gizli:
        out["kazanan"] = None
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("komut", choices=["durum", "dene"])
    p.add_argument("metin", nargs="?")
    p.add_argument("--db", default=DB)
    a = p.parse_args()
    if a.komut == "dene":
        print(json.dumps(cozumle(a.metin or ""), ensure_ascii=False))
    else:
        print(json.dumps(yayin(a.db), ensure_ascii=False))


if __name__ == "__main__":
    main()
