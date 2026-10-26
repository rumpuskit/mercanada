// Parite testi için JS simülasyonunun çıktısını JSON olarak basar:
// node web/tests/parity_vectors.mjs <gün> <kullanıcı adı>...
// server/tests/test_parity.py bunu Python çıktısıyla karşılaştırır.
import { readFileSync } from "node:fs";
import * as sim from "../src/sim.js";

sim.setCatalog(JSON.parse(readFileSync(new URL("../../data/catalog.json", import.meta.url), "utf8")));

const [dayArg, ...handles] = process.argv.slice(2);
const day = Number(dayArg);
const out = handles.map((handle, i) => {
  const n = i + 1;
  const r = { handle, seed: sim.seedOf(handle), slot: n * 977, arrived_day: day - (n % 60) };
  const plans = [];
  for (let d = day; d < day + 7; d++) plans.push(sim.dayPlan(r, d));
  return {
    seed: r.seed,
    address: sim.addressText(r.slot),
    job: sim.job(r).id,
    workplace: sim.workplace(r).name,
    title: sim.title(r, day),
    pet: sim.pet(r, day),
    hobby: sim.hobby(r).id,
    look: sim.look(r),
    plans,
  };
});
process.stdout.write(JSON.stringify(out));
