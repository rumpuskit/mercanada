#!/usr/bin/env python3
"""Mac'teki tik.ninja takibinden gelen veriyi işler. Yalnız bu betiği çalıştırabilen bir ssh anahtarının
zorunlu komutudur (mercanada kullanıcısının authorized_keys'i); veri stdin'den tek bir JSON olarak gelir:

    {"tur": "sayi", "takipci": N}
        Saatlik: profildeki takipçi sayısı. İskelede bekleyenler bundan hesaplanır.
    {"tur": "liste", "takipci": N, "liste": [[ad, takip zamanı, sıra], ...]}
        Günde 3 kez (taşınma): aktif takipçilerin tam listesi, import_followers.aktar() ile şehre işlenir.
    {"tur": "yorumlar", "hesap": ad, "yorumlar": [[yorum kimliği, ad, unix zaman, metin], ...]}
        Taşınmadan hemen sonra: videolarımıza son okumadan beri gelen yorumlar. istekler.py ayrıştırır;
        metin saklanmaz, yalnız geçerli istekler (meslek, hobi, evcil, adımı gizle) kaydedilir.

Çıktı tek satır JSON; hata olursa {"hata": "..."} ve çıkış kodu 1. Aynı anda tek çalıştırma (kilit).
Elle deneme:  echo '{"tur": "sayi", "takipci": 3}' | python3 tasinma.py
"""

import fcntl
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import istekler  # noqa: E402
from import_followers import AktarimHatasi, _tikninja_json, aktar  # noqa: E402
from ortak import DB, ROOT, psql, publish  # noqa: E402

MAX_BYTES = 64 << 20  # ~1M takipçilik liste


def durum(anahtar: str, db: str = DB) -> int | None:
    v = psql(f"SELECT deger FROM durum WHERE anahtar = '{anahtar}'", db)
    return json.loads(v)["sayi"] if v else None


def durum_yaz(anahtar: str, sayi: int, db: str = DB) -> None:
    psql(f"""INSERT INTO durum (anahtar, deger) VALUES ('{anahtar}', '{{"sayi": {int(sayi)}}}')
             ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();""", db)


def sayi(takipci: int) -> dict:
    if durum("tt_takipci") == takipci:
        return {"takipci": takipci, "degisiklik": False}
    durum_yaz("tt_takipci", takipci)
    return {"takipci": takipci, "yayin": publish()}


def liste(takipci: int, items: list) -> dict:
    followers = _tikninja_json({"liste": items})
    nufus = int(psql("SELECT count(*) FROM sakinler WHERE left_day IS NULL"))
    if not followers and nufus == 0:
        # Ada henüz boş ve takipçi yok (ya da hepsi listede görünmeyen hesaplar): hata değil.
        durum_yaz("tt_takipci", takipci)
        durum_yaz("disarida", takipci)
        return {"gelen": 0, "ayrilan": 0, "donen": 0, "nufus": 0, "acilan": [], "yayin": publish()}
    # Özet içeriğe göre: değişmeyen liste ikinci kez işlenmez (aktarimlar.dosya_sha256).
    sha = hashlib.sha256(json.dumps(sorted(followers.items())).encode()).hexdigest()
    sonuc = aktar(followers, sha, yayinla=False)
    if sonuc.get("atlandi"):
        sonuc = {"atlandi": True, "nufus": nufus}
    # Profilde sayılıp listede hiç görünmeyenler (gizli/kısıtlı hesaplar, çıkanlar) iskelede beklemez.
    durum_yaz("tt_takipci", takipci)
    durum_yaz("disarida", max(0, takipci - sonuc["nufus"]))
    # Taşınmadan önce yorum yazıp şimdi gelenlerin bekleyen istekleri.
    if uygulanan := istekler.uygula():
        sonuc["istek_uygulanan"] = uygulanan
    sonuc["yayin"] = publish()
    return sonuc


def yorumlar(hesap: str | None, items: list) -> dict:
    sonuc = istekler.yorumlar(items, hesap)
    if sonuc["uygulanan"]:
        sonuc["yayin"] = publish()
    return sonuc


def main() -> int:
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    try:
        if len(raw) > MAX_BYTES:
            raise ValueError("veri çok büyük")
        msg = json.loads(raw)
        takipci = msg.get("takipci")
        if msg.get("tur") != "yorumlar" and (not isinstance(takipci, int) or takipci < 0):
            raise ValueError("takipci sayısı yok")
        with open(ROOT / "tasinma.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if msg.get("tur") == "yorumlar" and isinstance(msg.get("yorumlar"), list):
                hesap = msg.get("hesap")
                out = yorumlar(str(hesap).lower() if hesap else None, msg["yorumlar"])
            elif msg.get("tur") == "sayi":
                out = sayi(takipci)
            elif msg.get("tur") == "liste" and isinstance(msg.get("liste"), list):
                out = liste(takipci, msg["liste"])
            else:
                raise ValueError("bilinmeyen tür")
    except (ValueError, AktarimHatasi) as e:
        out = {"hata": str(e)}
    except SystemExit as e:  # psql ya da Worker hatası (ortak.py mesajla çıkar)
        out = {"hata": str(e.code)}
    print(json.dumps(out, ensure_ascii=False))
    return 1 if "hata" in out else 0


if __name__ == "__main__":
    sys.exit(main())
