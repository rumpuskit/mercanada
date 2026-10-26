// Tarayıcıda çizilen zemin dokuları: asfalt, Arnavut kaldırımı, kaldırım taşı, toprak, sahil taşı, çimen.
// Dosya indirmeye gerek kalmaz ve her cihazda aynı görünür.
import * as THREE from "three";
import { rng } from "./noise.js";

function canvasTexture(size, draw, repeat = true) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return tex;
}

function speckle(ctx, size, rand, count, colors, rMax = 1.6) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = 0.4 + rand() * rMax;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

const cache = {};

/** Asfalt; v ekseni yol boyunca. */
export function asphalt() {
  return (cache.asphalt ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("asfalt");
    ctx.fillStyle = "#5e6167";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 9000, ["#55585e", "#686b71", "#4f5258", "#72757a"]);
  }));
}

/** Arnavut kaldırımı: düzensiz, yuvarlak köşeli taşlar. */
export function cobble() {
  return (cache.cobble ??= canvasTexture(512, (ctx, s) => {
    const rand = rng("parke");
    ctx.fillStyle = "#6f6a62";
    ctx.fillRect(0, 0, s, s);
    const rows = 14, cols = 12;
    const ch = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * cw * 0.5;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * cw + shift + (rand() - 0.5) * 4, y = r * ch + (rand() - 0.5) * 3;
        const w = cw - 4 - rand() * 3, h = ch - 4 - rand() * 3;
        const tone = 130 + Math.floor(rand() * 45);
        ctx.fillStyle = `rgb(${tone + 8},${tone + 2},${tone - 8})`;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, w, h, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 3, w * 0.6, h * 0.35, 5);
        ctx.fill();
      }
    }
  }));
}

/** Kaldırım: 40 cm kare taşlar, yol tarafında (u = 0) bordür. */
export function paving() {
  return (cache.paving ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("kaldirim");
    ctx.fillStyle = "#b9b2a7";
    ctx.fillRect(0, 0, s, s);
    const n = 6, t = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const tone = 205 + Math.floor(rand() * 18);
        ctx.fillStyle = `rgb(${tone},${tone - 5},${tone - 13})`;
        ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    }
    speckle(ctx, s, rand, 1500, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.08)"]);
  }));
}

/** Bordür taşı şeridi (kaldırımın yol tarafı). */
export function curb() {
  return (cache.curb ??= canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = "#d9d6d0";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#b8b4ac";
    for (let y = 0; y < s; y += 16) ctx.fillRect(0, y, s, 1.5);
  }));
}

export function dirt() {
  return (cache.dirt ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("toprak");
    ctx.fillStyle = "#c9ad86";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 6000, ["#bb9f78", "#d6bc96", "#b0946e", "#a88d68"], 2.5);
  }));
}

/** Sahil yolu: büyük, açık renkli taş levhalar. */
export function slabs() {
  return (cache.slabs ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("sahil");
    ctx.fillStyle = "#c8c0b2";
    ctx.fillRect(0, 0, s, s);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 40 - 40;
      while (x < s) {
        const w = 60 + rand() * 50;
        const tone = 222 + Math.floor(rand() * 16);
        ctx.fillStyle = `rgb(${tone},${tone - 6},${tone - 16})`;
        ctx.fillRect(x + 2, r * (s / rows) + 2, w - 4, s / rows - 4);
        x += w;
      }
    }
    speckle(ctx, s, rand, 1200, ["rgba(0,0,0,0.05)"]);
  }));
}

/** Meydan döşemesi: iç içe halkalar hissi veren desenli taş. */
export function plazaStone() {
  return (cache.plaza ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("meydan");
    ctx.fillStyle = "#cdbfae";
    ctx.fillRect(0, 0, s, s);
    const n = 8, t = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const accent = (i + j) % 4 === 0;
        const tone = accent ? 196 : 226 + Math.floor(rand() * 12);
        ctx.fillStyle = accent ? `rgb(${tone},${tone - 30},${tone - 46})` : `rgb(${tone},${tone - 7},${tone - 16})`;
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      }
    }
  }));
}

/** Çimen ayrıntısı: arazinin köşe rengini hafifçe bozar (gri tonlu, renk köşeden gelir). */
export function grassDetail() {
  return (cache.grass ??= canvasTexture(256, (ctx, s) => {
    const rand = rng("cimen");
    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 14000; i++) {
      const v = 200 + Math.floor(rand() * 55);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      const x = rand() * s, y = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 2, y - 2 - rand() * 3);
      ctx.stroke();
    }
  }));
}

/** Tarla: ekin sıraları. */
export function crops(color) {
  return (cache["crops" + color] ??= canvasTexture(128, (ctx, s) => {
    const c = new THREE.Color(color);
    const dark = c.clone().multiplyScalar(0.72);
    ctx.fillStyle = "#" + dark.getHexString();
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#" + c.getHexString();
    for (let y = 0; y < s; y += 16) ctx.fillRect(0, y + 3, s, 9);
  }));
}

/** Futbol sahası çizgileri. */
export function pitch() {
  return (cache.pitch ??= canvasTexture(512, (ctx, s) => {
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#6fae55" : "#78b85d";
      ctx.fillRect((i * s) / 10, 0, s / 10, s);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    const m = 20;
    ctx.strokeRect(m, m, s - 2 * m, s - 2 * m);
    ctx.beginPath();
    ctx.moveTo(s / 2, m);
    ctx.lineTo(s / 2, s - m);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(m, s / 2 - 90, 70, 180);
    ctx.strokeRect(s - m - 70, s / 2 - 90, 70, 180);
  }, false));
}

/** Otopark: asfalt üstünde beyaz park çizgileri (2,7 m aralık, 13 m sıra). */
export function parkingLot() {
  return (cache.lot ??= canvasTexture(256, (ctx, sz) => {
    const rand = rng("otopark");
    ctx.fillStyle = "#5e6167";
    ctx.fillRect(0, 0, sz, sz);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = ["#55585e", "#686b71", "#4f5258"][Math.floor(rand() * 3)];
      ctx.fillRect(rand() * sz, rand() * sz, 1.4, 1.4);
    }
    // Doku 2,7 x 13 m'lik bir sırayı kaplar: ortada şerit, iki yanda park yerleri.
    ctx.fillStyle = "rgba(240,240,236,0.92)";
    ctx.fillRect(0, 0, 3, sz * (5.3 / 13));
    ctx.fillRect(0, sz * (7.7 / 13), 3, sz * (5.3 / 13));
  }));
}

/** Basketbol sahası: turuncu zemin, beyaz çizgiler (sahaya tek parça yayılır). */
export function court() {
  return (cache.court ??= canvasTexture(256, (ctx, sz) => {
    ctx.fillStyle = "#c86a3c";
    ctx.fillRect(0, 0, sz, sz);
    ctx.fillStyle = "#2f6fb5";
    ctx.fillRect(sz * 0.3, 0, sz * 0.4, sz * 0.18);
    ctx.fillRect(sz * 0.3, sz * 0.82, sz * 0.4, sz * 0.18);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, sz - 12, sz - 12);
    ctx.beginPath(); ctx.moveTo(6, sz / 2); ctx.lineTo(sz - 6, sz / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(sz / 2, sz / 2, sz * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(sz / 2, 6, sz * 0.32, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(sz / 2, sz - 6, sz * 0.32, Math.PI, 2 * Math.PI); ctx.stroke();
  }, false));
}
