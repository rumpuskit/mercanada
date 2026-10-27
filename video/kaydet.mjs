// Senaryodan dikey video üretir: her çekim için siteyi açar, zamanı sanal saate bağlar, kareleri tek tek
// ilerletip ekran görüntüsünü ffmpeg'e verir; sonunda çekimleri geçişlerle birleştirir.
//
//   cd web && npm run build && npx vite preview --port 4173      (ayrı terminalde)
//   cd video && node kaydet.mjs senaryolar/acilis.mjs [--onizleme] [--cekim 2] [--birlestir]
//
// Senaryo: { ad, fps, w, h, gecis, cekimler: [{ sure, adres, kamera, yazilar, takip, arayuz, hazirlik }] }
//   adres:   sitenin sorgu parametreleri (ör. "saat=08:10&hiz=20&nufus=3200")
//   kamera:  [[t, kx, ky, kz, bx, by, bz], ...] kamera konumu ve bakılan nokta (çekim başından saniye)
//   takip:   { omuz: true } yürüyen bir sakini omuz görünümünde izler (kamera yerine)
//   yazilar: [{ metin, alt?, bas, son, yer: "ust" | "orta" | "alt" }]
//   arayuz:  true ise sitenin üst bilgisi görünür (diğer paneller hep gizli)
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const preview = args.includes("--onizleme");
const only = args.includes("--cekim") ? Number(args[args.indexOf("--cekim") + 1]) : null;
const joinOnly = args.includes("--birlestir"); // çekimleri yeniden çizmeden yalnızca birleştir
const base = process.env.SITE ?? "http://localhost:4173/";
const S = (await import(resolve(file))).default;
const fps = preview ? 15 : S.fps ?? 30;
const scale = preview ? 0.5 : 1;
const W = Math.round((S.w ?? 1080) * scale), H = Math.round((S.h ?? 1920) * scale);
const out = resolve("cikti", S.ad);
mkdirSync(out, { recursive: true });

// Sayfa açılmadan önce: performance.now ve requestAnimationFrame sanal saate bağlanır.
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window);
  let manual = false, vt = 0, q = [];
  performance.now = () => (manual ? vt : realNow());
  window.requestAnimationFrame = (cb) => (manual ? (q.push(cb), q.length) : realRAF(cb));
  window.__manual = () => { vt = realNow(); manual = true; };
  window.__step = (ms) => { vt += ms; const c = q; q = []; for (const f of c) f(vt); return c.length; };
})();`;

const CSS = `
#hud .links, #speed, #card, #navbtns, #minimap, #places, #search, #floorbar, #loading, #online { display: none !important; }
body:not(.arayuz) #hud { display: none !important; }
body.arayuz #hud { transform: scale(2.1); transform-origin: top left; top: 150px !important; left: 60px !important; }
#kayit { position: fixed; inset: 0; pointer-events: none; font-family: Nunito, system-ui, sans-serif; }
#kayit .yazi { position: absolute; left: 50%; transform: translate(-50%, 0); width: 860px; text-align: center; transition: none; }
#kayit .yazi.ust { top: 300px; }
#kayit .yazi.orta { top: 760px; }
#kayit .yazi.alt { top: 1180px; }
#kayit .kutu { display: inline-block; background: rgba(18, 26, 44, 0.74); color: #fff; border-radius: 28px; padding: 20px 34px 24px;
  font-weight: 800; font-size: 66px; line-height: 1.15; letter-spacing: -0.5px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
#kayit .alt-yazi { display: inline-block; margin-top: 18px; background: #e0607a; color: #fff; border-radius: 20px; padding: 12px 26px 15px;
  font-weight: 800; font-size: 46px; line-height: 1.2; }
#kayit .alt-yazi small { font-size: 36px; font-weight: 700; opacity: 0.95; }
`;

function ffmpeg(args) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => p.on("close", (c) => (c === 0 ? ok() : fail(new Error("ffmpeg " + c)))));
  return { p, done };
}

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const parts = [];
for (const [ci, shot] of S.cekimler.entries()) {
  const path = `${out}/cekim${ci + 1}.mp4`;
  parts.push({ path, sure: shot.sure });
  if (joinOnly || (only != null && only !== ci + 1)) continue;
  const page = await browser.newPage({ viewport: { width: S.w ?? 1080, height: S.h ?? 1920 }, deviceScaleFactor: scale });
  page.on("pageerror", (e) => console.log("  sayfa hatası:", e.message));
  await page.addInitScript(CLOCK);
  await page.goto(`${base}?denetle&${shot.adres}`);
  await page.waitForFunction(() => globalThis.__ada?.ui, null, { timeout: 120000 });
  await page.addStyleTag({ content: CSS + (S.css ?? "") });
  await page.evaluate(async ({ yazilar, arayuz }) => {
    await document.fonts.ready;
    if (arayuz) document.body.classList.add("arayuz");
    const box = document.createElement("div");
    box.id = "kayit";
    for (const y of yazilar ?? []) {
      const d = document.createElement("div");
      d.className = `yazi ${y.yer ?? "ust"}`;
      d.innerHTML = `<div class="kutu">${y.metin}</div>${y.alt ? `<br><div class="alt-yazi">${y.alt}</div>` : ""}`;
      d.style.opacity = 0;
      box.append(d);
    }
    document.body.append(box);
  }, { yazilar: shot.yazilar, arayuz: shot.arayuz });
  // Dokular ve ilk kareler otursun, sonra sanal saate geç.
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__manual());
  await page.waitForTimeout(300);
  if (shot.hazirlik) await page.evaluate(shot.hazirlik);
  // Isınma: benzetim birkaç saniye ilerlesin (yürüyüşler, araçlar yerleşsin).
  for (let k = 0; k < (shot.isinma ?? 20); k++) await page.evaluate(() => window.__step(1000 / 30));
  await page.evaluate(({ kamera, takip }) => {
    const A = globalThis.__ada;
    A.controls.custom = { rotate() {}, zoom() {} };
    if (takip?.yakin) {
      // Yürüyen bir sakini önden-yandan, yakından izler; etiketi ("@sen") ve işareti görünür.
      const P = A.people;
      let best = -1, bd = Infinity;
      for (let i = 0; i < P.n; i++) {
        if (!P.visible[i] || !P.poses[i].moving || P.poses[i].inVehicle || P.poses[i].indoor || P.poses[i].dog) continue;
        const d = Math.hypot(P.positions[i * 3] - (takip.x ?? 0), P.positions[i * 3 + 2] - (takip.z ?? 0));
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      if (takip.ad) A.residents[best].handle = takip.ad;
      globalThis.__etiket = best; // etiketi hep önde ve vurgulu (işaret yok)
      const i = best, st = {};
      globalThis.__yonetmen = (dt) => {
        const x = P.positions[i * 3], y = P.positions[i * 3 + 1], z = P.positions[i * 3 + 2];
        const h = P.poses[i].heading ?? 0;
        if (st.h == null) Object.assign(st, { h, x, y, z });
        let dh = h - st.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const k = 1 - Math.exp(-dt * 2.2), kp = 1 - Math.exp(-dt * 8);
        st.h += dh * k; st.x += (x - st.x) * kp; st.y += (y - st.y) * kp; st.z += (z - st.z) * kp;
        const a = st.h + (takip.aci ?? 0.75), D = takip.uzaklik ?? 6;
        A.camera.position.set(st.x + Math.sin(a) * D, st.y + (takip.yukseklik ?? 2.4), st.z + Math.cos(a) * D);
        A.controls.target.set(st.x, st.y + (takip.bak ?? 1.2), st.z);
        A.camera.lookAt(A.controls.target);
      };
      return;
    }
    if (takip?.omuz) {
      // Meydanın çevresinde yürüyen, araçta olmayan bir sakin.
      const P = A.people;
      let best = -1, bd = Infinity;
      for (let i = 0; i < P.n; i++) {
        if (!P.visible[i] || !P.poses[i].moving || P.poses[i].inVehicle || P.poses[i].indoor) continue;
        const d = Math.hypot(P.positions[i * 3] - (takip.x ?? 0), P.positions[i * 3 + 2] - (takip.z ?? -60));
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) {
        if (takip.ad) A.residents[best].handle = takip.ad;
        A.follower.start({ kind: "sakin", i: best }, "omuz");
        A.follower.dist = takip.uzaklik ?? 4.2;
        A.follower.pitch = takip.egim ?? 0.28;
        A.ui.select?.(best);
      }
      globalThis.__yonetmen = null;
      return;
    }
    const keys = kamera;
    const ease = (u) => u * u * (3 - 2 * u);
    globalThis.__yonetmen = () => {
      const t = globalThis.__shotT ?? 0;
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
      const u = b[0] > a[0] ? ease(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 0;
      const L = (j) => a[j] + (b[j] - a[j]) * u;
      A.controls.target.set(L(4), L(5), L(6));
      A.camera.position.set(L(1), L(2), L(3));
      A.camera.lookAt(A.controls.target);
    };
  }, { kamera: shot.kamera, takip: shot.takip });

  const frames = Math.round(shot.sure * fps);
  const enc = ffmpeg(["-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "26" : "16", "-pix_fmt", "yuv420p", "-r", String(fps), path]);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    await page.evaluate(({ t, dt, yazilar }) => {
      globalThis.__shotT = t;
      // Yazılar: 0,3 sn'de belirir ve kaybolur.
      document.querySelectorAll("#kayit .yazi").forEach((d, k) => {
        const y = yazilar[k];
        const o = Math.max(0, Math.min(1, (t - y.bas) / 0.3, (y.son - t) / 0.3));
        d.style.opacity = o;
        d.style.transform = `translate(-50%, ${(1 - o) * 24}px)`;
      });
      window.__step(dt * 1000);
    }, { t, dt: 1 / fps, yazilar: shot.yazilar ?? [] });
    const buf = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!enc.p.stdin.write(buf)) await new Promise((r) => enc.p.stdin.once("drain", r));
    if (f % fps === 0) process.stdout.write(`\r  çekim ${ci + 1}: ${f}/${frames} kare (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  }
  enc.p.stdin.end();
  await enc.done;
  console.log(`\r  çekim ${ci + 1}: ${frames} kare → ${path}`);
  await page.close();
}
await browser.close();

if (only == null || joinOnly) {
  // Çekimleri yumuşak geçişlerle birleştir.
  const X = S.gecis ?? 0.35;
  const inputs = parts.flatMap((p) => ["-i", p.path]);
  let chain = "", prev = "[0:v]", offset = 0;
  for (let k = 1; k < parts.length; k++) {
    offset += parts[k - 1].sure - X;
    const lab = k === parts.length - 1 ? "[v]" : `[x${k}]`;
    chain += `${prev}[${k}:v]xfade=transition=fade:duration=${X}:offset=${offset.toFixed(3)}${lab};`;
    prev = lab;
  }
  const final = `${out}/${S.ad}${preview ? "-onizleme" : ""}.mp4`;
  const enc = ffmpeg([...inputs, "-filter_complex", chain.replace(/;$/, ""), "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", preview ? "24" : "17",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", final]);
  enc.p.stdin.end();
  await enc.done;
  writeFileSync(`${out}/ACIKLAMA.txt`, S.aciklama ?? "");
  console.log("bitti:", final);
}
