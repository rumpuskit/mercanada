// Çevrimiçi sayacı: sitede o an kaç kişinin olduğunu gösterir.
// Her ziyaretçi tek bir WebSocket açar; tek bir Durable Object bağlantıları sayar ve sayıyı herkese yollar.
// Hiçbir kimlik, IP ya da çerez saklanmaz; yalnızca açık bağlantıların sayısı tutulur.
import { DurableObject } from "cloudflare:workers";

const ORIGINS = ["https://ada.rumpuskit.com", "http://localhost:4173", "http://localhost:5173"];

export class Presence extends DurableObject {
  async fetch(request) {
    const pair = new WebSocketPair();
    // Uyku (hibernation) API'si: boşta bekleyen bağlantılar için ücret ya da bellek harcanmaz.
    this.ctx.acceptWebSocket(pair[1]);
    this._schedule();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, message) {
    // İstemci yalnızca ara sıra "p" (canlılık) yollar; cevap olarak güncel sayı döner.
    if (message === "p") ws.send(String(this._count()));
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this._schedule();
  }

  webSocketError() {
    this._schedule();
  }

  _count() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN).length;
  }

  /** Bağlantı değişince sayıyı en geç bir saniye içinde herkese yayar (ani girişlerde tek yayın). */
  async _schedule() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  async alarm() {
    const n = String(this._count());
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(n); } catch {}
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket bekleniyor", { status: 426 });
      if (origin && !ORIGINS.includes(origin)) return new Response("izin yok", { status: 403 });
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName("ada"));
      return stub.fetch(request);
    }
    return new Response("Mercanada çevrimiçi sayacı", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
