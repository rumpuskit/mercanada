// İş yeri içleri: kafe, kahvehane, fırın, market, atölye, ofis (plaza), okul, sağlık merkezi, belediye,
// kütüphane, müze, otel, büfe. Her türün kendi döşemesi ve çalışma noktaları vardır; o saatte işte olan
// sakinler bu noktalarda çalışır (tezgâhta, masa başında, tahta önünde, raflar arasında...).
import * as THREE from "three";
import { roll } from "../sim.js";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
const GOODS = ["#d8433d", "#e8b93a", "#3e8a86", "#2f6fb5", "#8a62d1", "#f28c28", "#7fae45", "#f4f1ea"];

/**
 * İç mekânı kurar. add(w, h, d, lx, ly, lz, color, rot, opts) yerel (bina) koordinatlarında kutu ekler,
 * spot(lx, lz, heading, kind) bir çalışma noktası kaydeder. Döner: çalışma noktaları listesi.
 */
export function buildWorkInterior(b, f, add, spot) {
  const hw = b.w / 2, hd = b.d / 2;
  const kind = b.kind;
  const floorCol = { kafe: "#b58a63", kahvehane: "#9c7353", firin: "#d8c6a8", market: "#e6e2da", plaza: "#c9ccd1", okul: "#c79f74", saglik: "#e9edf0", belediye: "#cfc4b6", karakol: "#cfd5dc", muhtarlik: "#c9b79c", adliye: "#a98b6f", kutuphane: "#a98b6f", muze: "#d9d2c6", otel: "#b58a63", atolye: "#bfb3a2", bufe: "#d8c6a8", carsi: "#d8c6a8" }[kind] ?? "#cfc4b6";
  add(b.w - 0.3, 0.06, b.d - 0.3, 0, 0, 0, floorCol, 0, { shadow: false });
  const counter = (x, z, w, color = "#8a6a52", top = "#4a4f57") => {
    add(w, 1.0, 0.7, x, 0.06, z, color);
    add(w + 0.05, 0.05, 0.75, x, 1.06, z, top);
  };
  const guests = []; // müşteri/öğrenci oturma yerleri (çalışanlara verilmez)
  const chair = (cx, cz, face, color = "#8a6a52") => {
    // Dört ayaklı, arkalıklı sandalye; face: oturanın baktığı yön (yerel).
    const bx = cx - Math.sin(face) * 0.19, bz = cz - Math.cos(face) * 0.19;
    add(0.42, 0.05, 0.42, cx, 0.45, cz, color, face);
    add(0.42, 0.45, 0.04, bx, 0.5, bz, color, face);
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      const rx = dx * Math.cos(face) + dz * Math.sin(face), rz = -dx * Math.sin(face) + dz * Math.cos(face);
      add(0.03, 0.44, 0.03, cx + rx, 0.01, cz + rz, "#3c4148", 0, { shadow: false });
    }
    guests.push(spot(cx, cz, face, "guest"));
  };
  const table = (x, z, chairs = 2, round = true) => {
    if (round) add(0.8, 0.05, 0.8, x, 0.74, z, "#f4f1ea");
    else add(1.2, 0.05, 0.8, x, 0.74, z, "#a07a58");
    add(0.07, 0.72, 0.07, x, 0.02, z, "#3c4148");
    add(0.4, 0.03, 0.4, x, 0.02, z, "#3c4148", 0, { shadow: false });
    for (let c = 0; c < chairs; c++) {
      const a = (c / chairs) * Math.PI * 2;
      const cx = x + Math.cos(a) * 0.7, cz = z + Math.sin(a) * 0.7;
      chair(cx, cz, Math.atan2(x - cx, z - cz));
    }
  };
  const shelf = (x, z, w, rot = 0, goods = true) => {
    add(w, 1.9, 0.45, x, 0.06, z, "#d9d4ca", rot);
    if (goods) for (let r = 0; r < 4; r++) for (let k = 0; k < Math.floor(w / 0.35); k++) add(0.28, 0.28, 0.3, x - w / 2 + 0.2 + k * 0.35, 0.15 + r * 0.45, z, GOODS[(k * 3 + r * 5 + Math.round(x * 7)) % GOODS.length], rot, { shadow: false });
  };
  const desk = (x, z, rot = 0) => {
    add(1.3, 0.05, 0.7, x, 0.74, z, "#e6e1d6", rot);
    add(0.06, 0.72, 0.06, x - 0.6, 0.02, z, "#3c4148", rot);
    add(0.06, 0.72, 0.06, x + 0.6, 0.02, z, "#3c4148", rot);
    add(0.55, 0.36, 0.03, x, 0.98, z - 0.22, null, rot, { material: new THREE.MeshBasicMaterial({ color: "#7fb0e0", toneMapped: false }), shadow: false });
    add(0.45, 0.05, 0.45, x, 0.47, z + 0.55, "#2f3540", rot);
  };
  const spots = [];
  const S = (x, z, heading, type) => spots.push(spot(x, z, heading, type));

  switch (kind) {
    case "kafe": case "kahvehane": case "bufe": case "firin": case "carsi": {
      // Arka duvar boyunca tezgâh; önde masalar. Fırında ekmek rafları ve taş fırın.
      counter(0, -hd + 1.4, b.w - 2.5, kind === "firin" ? "#c9a27a" : "#6b4a35");
      if (kind === "firin") {
        add(2.2, 1.8, 1.2, -hw + 1.6, 0.06, -hd + 0.8, "#b5563f");
        add(1.2, 0.6, 0.05, -hw + 1.6, 0.7, -hd + 1.42, "#2a1a14");
        for (let r = 0; r < 3; r++) add(b.w - 4, 0.05, 0.4, 0.6, 1.2 + r * 0.4, -hd + 0.3, "#8a6a52");
        for (let k = 0; k < 10; k++) add(0.35, 0.18, 0.2, -hw + 3 + k * 0.6, 1.3, -hd + 0.3, "#d9a24a", 0, { shadow: false });
      } else {
        add(0.6, 0.5, 0.45, -hw + 1.8, 1.1, -hd + 1.4, "#3c4148"); // kahve makinesi / semaver
        add(b.w - 3, 0.04, 0.3, 0, 1.9, -hd + 0.25, "#6b4a35");
      }
      const cols = Math.max(1, Math.floor((b.w - 2) / 2.6));
      for (let c = 0; c < cols; c++) for (let r = 0; r < 2; r++) table(-hw + 1.6 + c * 2.6, 0.6 + r * 2.4, kind === "kahvehane" ? 4 : 2);
      S(-1.2, -hd + 2.2, Math.PI, "counter");
      S(1.5, -hd + 2.2, Math.PI, "counter");
      S(0, 1.8, 0, "waiter");
      break;
    }
    case "market": {
      counter(hw - 2.2, hd - 2.2, 1.8, "#f4f1ea");
      for (let r = 0; r < 3; r++) shelf(-1.2, -hd + 2 + r * 3.2, b.w - 6);
      shelf(0, -hd + 0.4, b.w - 1.5);
      S(hw - 2.2, hd - 3.1, 0, "counter");
      S(-1.2, -hd + 3.6, Math.PI / 2, "shelf");
      break;
    }
    case "atolye": {
      for (let k = 0; k < 2; k++) {
        add(2.4, 0.9, 1.0, -hw + 2.5 + k * 4.5, 0.06, -1, "#8a6a52");
        add(0.4, 0.4, 0.4, -hw + 2.2 + k * 4.5, 0.96, -1, "#9a9fa6");
      }
      add(0.6, 0.8, 0.6, hw - 2, 0.06, 1.5, "#6b4a35"); // çömlek çarkı
      shelf(0, -hd + 0.4, b.w - 1.5);
      S(-hw + 2.5, -0.2, Math.PI, "bench");
      S(-hw + 7, -0.2, Math.PI, "bench");
      S(hw - 2, 2.3, Math.PI, "bench");
      break;
    }
    case "plaza": case "belediye": case "karakol": case "muhtarlik": case "adliye": {
      // Açık ofis: masa sıraları, toplantı masası.
      const rows = Math.max(1, Math.floor((b.d - 3) / 2.6)), cols = Math.max(1, Math.floor((b.w - 2) / 2.4));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -hw + 1.6 + c * 2.4, z = -hd + 1.8 + r * 2.6;
          desk(x, z);
          if ((r * cols + c) % 2 === 0) S(x, z + 0.55, Math.PI, "desk");
        }
      }
      if (kind === "belediye" || kind === "karakol" || kind === "adliye") counter(0, hd - 2, Math.min(8, b.w - 4), kind === "karakol" ? "#c9d3df" : "#f4f1ea");
      break;
    }
    case "okul": {
      // Kat: önde boydan boya koridor; arkada iki derslik ve öğretmenler odası (alçak bölmeler, kapılar).
      // Derslikte tahta, öğretmen masası, 4×3 çift kişilik sıra; odada toplantı masası ve dolaplar.
      const corr = 2.0, zc = hd - corr; // koridor duvarı
      const roomW = (b.w - 0.3) / 3;
      const xs = [-hw + 0.15, -hw + 0.15 + roomW, -hw + 0.15 + 2 * roomW, hw - 0.15];
      const wallC = "#efe7d6";
      for (let k = 1; k < 3; k++) add(0.12, 1.05, zc + hd - 0.15, xs[k], 0, (zc - hd + 0.15) / 2, wallC);
      for (let k = 0; k < 3; k++) {
        const cx = (xs[k] + xs[k + 1]) / 2;
        add(roomW / 2 - 0.7, 1.05, 0.12, xs[k] + (roomW / 2 - 0.7) / 2, 0, zc, wallC); // kapının solu
        add(roomW / 2 - 0.7, 1.05, 0.12, xs[k + 1] - (roomW / 2 - 0.7) / 2, 0, zc, wallC); // kapının sağı
        if (k < 2) {
          add(Math.min(4, roomW - 2), 1.2, 0.05, cx, 1.0, -hd + 0.25, "#2f4a3a");
          add(1.2, 0.75, 0.6, cx - roomW / 2 + 1.4, 0.06, -hd + 1.3, "#a07a58");
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            const x = cx - 2.3 + c * 2.3, z = -hd + 3.0 + r * 1.55;
            add(1.1, 0.05, 0.5, x, 0.68, z, "#c9a27a");
            for (const dx of [-0.5, 0.5]) add(0.05, 0.66, 0.45, x + dx, 0.02, z, "#3c4148", 0, { shadow: false });
            for (const dx of [-0.27, 0.27]) chair(x + dx, z + 0.55, Math.PI, "#5a7fa8");
          }
          S(cx + 0.4, -hd + 1.3, 0, "board");
        } else {
          // Öğretmenler odası: uzun masa, sandalyeler (çalışanlar oturur), dolap.
          add(1.2, 0.05, 3.6, cx, 0.74, -0.8, "#a07a58");
          add(0.08, 0.72, 0.08, cx, 0.02, -2.2, "#3c4148"); add(0.08, 0.72, 0.08, cx, 0.02, 0.6, "#3c4148");
          shelf(cx, -hd + 0.4, roomW - 1, 0, false);
          for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
            const x = cx + s * 0.95, z = -2.0 + r * 1.2;
            add(0.42, 0.05, 0.42, x, 0.45, z, "#6b4a35");
            S(x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, "seat");
          }
        }
      }
      S(-hw + 2, hd - 1.0, Math.PI / 2, "walk");
      S(hw - 2, hd - 1.0, -Math.PI / 2, "walk");
      // Öğrenci sandalyeleri yalnızca dersliklerde (öğretmenler odasındakiler çalışan yeri).
      break;
    }
    case "saglik": {
      counter(0, hd - 2.2, 4, "#f4f6f8", "#d8dde2");
      for (let k = 0; k < 6; k++) add(0.5, 0.45, 0.5, -hw + 1.5 + k * 0.7, 0.06, hd - 0.8, "#6fa0c8");
      for (let k = 0; k < 2; k++) {
        add(0.8, 0.6, 2.0, -hw + 2 + k * 5, 0.06, -hd + 1.6, "#f4f6f8");
        add(0.05, 2.0, 2.4, -hw + 3.4 + k * 5, 0.06, -hd + 1.6, "#bcd6e6");
      }
      S(0, hd - 3.0, 0, "counter");
      S(-hw + 3, -hd + 2.8, Math.PI, "walk");
      break;
    }
    case "kutuphane": {
      for (let r = 0; r < 2; r++) shelf(-hw / 2, -hd + 0.6 + r * 2.4, b.w / 2 - 1, 0, true);
      for (let k = 0; k < 2; k++) table(hw / 2 - 1 + k * 0, -1 + k * 2.6, 4, false);
      counter(-1, hd - 2, 2.4, "#6b4a35");
      S(-1, hd - 2.8, 0, "counter");
      break;
    }
    case "muze": {
      for (let k = 0; k < 6; k++) {
        const x = -hw + 2.5 + (k % 3) * (b.w - 5) / 2, z = -2 + Math.floor(k / 3) * 4;
        add(0.8, 1.0, 0.8, x, 0.06, z, "#f4f1ea");
        add(0.45, 0.6, 0.45, x, 1.06, z, ["#c9a24a", "#8a5a3a", "#5a7a8a"][k % 3]);
      }
      for (let k = 0; k < 4; k++) add(1.6, 1.1, 0.04, -hw + 3 + k * (b.w - 6) / 3, 1.3, -hd + 0.2, ["#b8625a", "#5a7fa8", "#c9a25a", "#7a6a9a"][k]);
      S(0, hd - 2, 0, "walk");
      break;
    }
    case "otel": {
      if (f === 0) {
        counter(0, -hd + 1.6, 5, "#6b4a35");
        for (let k = 0; k < 3; k++) add(1.8, 0.42, 0.85, -hw + 2.5 + k * 3.2, 0.06, hd - 1.5, "#8a5a4a");
        S(0, -hd + 2.4, Math.PI, "counter");
      } else {
        const rooms = Math.max(1, Math.floor(b.w / 4.5));
        for (let k = 0; k < rooms; k++) {
          const x = -hw + 2.2 + k * 4.5;
          add(1.6, 0.55, 2.0, x, 0.06, -hd + 1.3, "#f3eee6");
          if (k > 0) add(0.12, 2.9, b.d - 0.4, x - 2.25, 0, 0, "#e9e2d6");
        }
        S(-hw + 2, 1, Math.PI / 2, "walk");
      }
      break;
    }
    default: {
      for (let k = 0; k < 3; k++) desk(-hw + 2 + k * 2.5, -1);
      S(-hw + 2, -0.45, Math.PI, "desk");
    }
  }
  spots.guests = guests;
  return spots;
}

/** Çalışanın duruşu: nokta türüne göre. */
export function workPose(type, p, t, ph, sitPose, idleGesture, k) {
  switch (type) {
    case "desk":
      sitPose(p, p.y + 0.47, k);
      p.lean = 0.15; p.shL = p.shR = 0.75; p.elL = p.elR = 1.35 + 0.08 * Math.sin(t * 9 + ph); p.headPitch = 0.15;
      break;
    case "counter":
      idleGesture(p, t, ph, false);
      p.shR = 0.8 + 0.25 * Math.sin(t * 2.4 + ph); p.elR = 0.9; p.shL = 0.6; p.elL = 1.0; p.lean = 0.08;
      break;
    case "board": {
      const g = Math.max(0, Math.sin(t * 0.8 + ph));
      p.shR = 1.4 + 0.6 * g; p.elR = 0.3; p.headYaw = 0.5 * Math.sin(t * 0.3 + ph);
      break;
    }
    case "bench":
      p.lean = 0.35; p.shL = p.shR = 1.0; p.elL = p.elR = 0.8 + 0.3 * Math.sin(t * 3 + ph);
      break;
    case "shelf":
      p.shR = 1.5 + 0.4 * Math.sin(t * 1.2 + ph); p.elR = 0.4; p.headPitch = -0.2;
      break;
    case "seat": {
      // Masada oturur: çay içer, kâğıt okur, sohbet eder.
      sitPose(p, p.y + 0.5, k);
      const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
      idleGesture(p, t, ph, sip < 0.1);
      p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip); p.lean = 0.15;
      break;
    }
    case "stand":
      idleGesture(p, t, ph, true);
      break;
    default:
      idleGesture(p, t, ph, true);
  }
}

export { roll };
