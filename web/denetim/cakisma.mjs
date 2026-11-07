// Yerleşim çakışma denetimi (geliştirici aracı): önizleme sunucusu açıkken (cd web && npx vite --port 4173)
//   node web/denetim/cakisma.mjs "nufus=172" [ayrinti]
// Binalar, ağaçlar, kent eşyası, plaj, balıkçı koyu, oyun parkları ve plaj sineması taban izlerini toplar
// (cakisma-sayfa.js, sayfada __ada ile çalışır); iç içe geçen çiftleri, binaya/yapıya giren ağaç taçlarını ve
// taşıt yoluna düşen eşyayı sayar. Yeni yerleşim ya da gelişim adımı eklenince birkaç nüfusla çalıştır.
import { chromium } from "../../video/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";
const q = process.argv[2] ?? "nufus=172";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu"] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const warns = [];
p.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warns.push(m.text().slice(0, 160)); });
await p.goto(`http://localhost:4173/?denetle&${q}`);
await p.waitForFunction(() => globalThis.__ada, null, { timeout: 180000 });
const r = await p.evaluate(readFileSync(new URL("./cakisma-sayfa.js", import.meta.url), "utf8"));
await b.close();
const sum = (list) => { const m = {}; for (const h of list) { const k = [h.a, h.b].sort().join(" × "); m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
console.log(`${q}: ${r.n} nesne, ${r.hits.length} iç içe, ${r.soft.length} taç, ${r.onRoad.length} yolda; uyarı ${warns.length}`);
for (const [k, n] of sum(r.hits)) console.log("  ", n, k);
console.log(" taç:"); for (const [k, n] of sum(r.soft)) console.log("  ", n, k);
console.log(" yolda:"); for (const [k, n] of sum(r.onRoad)) console.log("  ", n, k);
for (const w of [...new Set(warns)].slice(0, 8)) console.log(" !", w);
if (process.argv[3]) console.log(JSON.stringify(r, null, 0));
