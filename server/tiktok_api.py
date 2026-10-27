#!/usr/bin/env python3
"""TikTok resmî API'sinden yalnız kendi hesabımızın takipçi SAYISINI alır (liste resmî API'de yok).

Sayı, aktarımla henüz taşınmamış takipçileri iskelede "bekleyen" olarak göstermek için kullanılır.
Kurulum (bir kez, mercanada kullanıcısıyla):
    python3 tiktok_api.py kur CLIENT_KEY https://mercanada.rumpuskit.com/tiktok/   # gizli anahtarı sorar
    python3 tiktok_api.py adres          # tarayıcıda açılacak izin bağlantısı
    python3 tiktok_api.py kod KOD         # yönlendirme sayfasında görünen kodu ver
Sonra saatlik zamanlayıcı:
    python3 tiktok_api.py guncelle       # belirteci gerekirse yeniler, sayıyı kaydeder, listeyi yayınlar

Anahtarlar /opt/mercanada/secrets/tiktok.json içinde durur (yalnız mercanada okur); depoya girmez.
"""

import argparse
import getpass
import json
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from ortak import DB, SECRETS, psql, publish

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
INFO_URL = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count"
SCOPES = "user.info.basic,user.info.stats"
CONF = SECRETS / "tiktok.json"


def load() -> dict:
    try:
        return json.loads(CONF.read_text())
    except FileNotFoundError:
        sys.exit(f"HATA: {CONF} yok; önce 'kur' komutunu çalıştır.")


def save(conf: dict) -> None:
    SECRETS.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = CONF.with_suffix(".tmp")
    tmp.touch(mode=0o600)
    tmp.write_text(json.dumps(conf, indent=1))
    tmp.replace(CONF)


def post_form(url: str, fields: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HATA (TikTok {e.code}): {e.read().decode(errors='replace')[:300]}")
    if "access_token" not in data:
        sys.exit(f"HATA (TikTok): {json.dumps(data)[:300]}")
    return data


def store_token(conf: dict, data: dict) -> None:
    conf.update({
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", conf.get("refresh_token")),
        "expires_at": int(time.time()) + int(data.get("expires_in", 86400)) - 300,
        "refresh_expires_at": int(time.time()) + int(data.get("refresh_expires_in", 0)),
    })
    save(conf)


def refresh(conf: dict) -> None:
    if conf.get("expires_at", 0) > time.time():
        return
    store_token(conf, post_form(TOKEN_URL, {
        "client_key": conf["client_key"], "client_secret": conf["client_secret"],
        "grant_type": "refresh_token", "refresh_token": conf["refresh_token"],
    }))


def follower_count(conf: dict) -> int:
    req = urllib.request.Request(INFO_URL, headers={"Authorization": f"Bearer {conf['access_token']}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HATA (TikTok {e.code}): {e.read().decode(errors='replace')[:300]}")
    if data.get("error", {}).get("code") not in (None, "ok"):
        sys.exit(f"HATA (TikTok): {json.dumps(data['error'])[:300]}")
    return int(data["data"]["user"]["follower_count"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("kur")
    k.add_argument("client_key")
    k.add_argument("redirect_uri")
    sub.add_parser("adres")
    c = sub.add_parser("kod")
    c.add_argument("code")
    sub.add_parser("guncelle")
    args = parser.parse_args()

    if args.cmd == "kur":
        secret = getpass.getpass("client_secret: ").strip()
        save({"client_key": args.client_key, "client_secret": secret, "redirect_uri": args.redirect_uri})
        print("Kaydedildi. Şimdi: python3 tiktok_api.py adres")
    elif args.cmd == "adres":
        conf = load()
        conf["state"] = secrets.token_urlsafe(16)
        save(conf)
        print(AUTH_URL + "?" + urllib.parse.urlencode({
            "client_key": conf["client_key"], "scope": SCOPES, "response_type": "code",
            "redirect_uri": conf["redirect_uri"], "state": conf["state"],
        }))
    elif args.cmd == "kod":
        conf = load()
        code = urllib.parse.unquote(args.code.strip())
        store_token(conf, post_form(TOKEN_URL, {
            "client_key": conf["client_key"], "client_secret": conf["client_secret"], "code": code,
            "grant_type": "authorization_code", "redirect_uri": conf["redirect_uri"],
        }))
        print("Belirteç alındı. Deneme: python3 tiktok_api.py guncelle")
    elif args.cmd == "guncelle":
        conf = load()
        refresh(conf)
        n = follower_count(conf)
        psql(f"""INSERT INTO durum (anahtar, deger) VALUES ('tt_takipci', '{{"sayi": {n}}}')
                 ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();""", DB)
        print(json.dumps({"takipci": n, "yayin": publish(DB)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
