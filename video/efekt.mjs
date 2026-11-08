// Ses efektleri (kayıt dosyası yok, telif yok): videoya karışacak kısa sesler burada sentezlenir ve WAV yazılır.
//   siren: hava ikaz sireni (10 Kasım 09:05): iki rotorlu düz ton, açılışta devir alır, sonda devir düşer, uzaktan
//          gelir (tepesi yumuşak, kısa yankı). vapur: iki uzun vapur düdüğü (kalın, 110/165 Hz).
// gunluk.mjs hikâyedeki çekim "efekt" alanından kullanır; kaydet.mjs konuşmanın altına karıştırır.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SR = 44100;

function wav(path, samples) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.89 / peak : 1; // tepe ≈ −1 dBFS; düzey kaydet.mjs'de ayarlanır
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

/** Basit tek kutuplu alçak geçiren + kısa yankı. */
function yumusat(x, fc, yankiSn = 0.23, yankiK = 0.28) {
  const a = Math.exp((-2 * Math.PI * fc) / SR), out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; out[i] = y; }
  const d = Math.round(yankiSn * SR);
  for (let i = d; i < out.length; i++) out[i] += out[i - d] * yankiK;
  return out;
}

function siren(sure = 12) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  const up = 2.6, down = 3.5;
  const tonlar = [[415, 1], [622, 0.8]];
  const faz = tonlar.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Devir: açılışta 0,45'ten 1'e, sonda 1'den 0,5'e; hafif dalgalanma (rotor).
    const r = t < up ? 0.45 + 0.55 * Math.sin((t / up) * Math.PI / 2) : t > sure - down ? 1 - 0.5 * ((t - (sure - down)) / down) ** 1.5 : 1;
    const v = 1 + 0.012 * Math.sin(2 * Math.PI * 0.22 * t);
    const g = Math.min(1, t / 1.2) * Math.min(1, (sure - t) / 1.5);
    let s = 0;
    tonlar.forEach(([f, a], k) => {
      faz[k] += (2 * Math.PI * f * r * v) / SR;
      // Testere dalgası benzeri (ilk 6 harmonik).
      for (let h = 1; h <= 6; h++) s += (a / h) * Math.sin(faz[k] * h) * (h % 2 ? 1 : 0.6);
    });
    x[i] = s * g;
  }
  return yumusat(x, 2200);
}

function vapur(sure = 9) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  const cal = [[0.2, 3.8], [4.6, 8.6]];
  let f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const c = cal.find(([a, b]) => t >= a && t < b);
    if (!c) continue;
    const g = Math.min(1, (t - c[0]) / 0.25) * Math.min(1, (c[1] - t) / 0.4);
    f1 += (2 * Math.PI * 110) / SR; f2 += (2 * Math.PI * 165) / SR;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += (Math.sin(f1 * h) + 0.8 * Math.sin(f2 * h)) / h;
    x[i] = s * g;
  }
  return yumusat(x, 700, 0.31, 0.35);
}

const EFEKT = { siren, vapur };
export const EFEKTLER = Object.keys(EFEKT);

/** Efekti (yoksa) yazar ve dosya yolunu döner. */
export function efekt(ad, klasor, sure) {
  if (!EFEKT[ad]) throw new Error(`bilinmeyen efekt: ${ad} (${EFEKTLER.join(", ")})`);
  const yol = `${klasor}/${ad}${sure ? "-" + sure : ""}.wav`;
  if (!existsSync(yol)) wav(yol, EFEKT[ad](sure));
  return yol;
}
