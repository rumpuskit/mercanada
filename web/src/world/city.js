// Binalar ve kent eşyası. Ölçüler gerçektir (metre).
// Aynı parçalar (pencere, balkon, çatı...) tek bir InstancedMesh ile çizilir; telefonda da akıcı kalsın diye.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLAT_Y, FLOOR_H } from "./layout.js";
import * as P from "./palette.js";
import * as T from "./textures.js";

/**
 * Dünya koordinatından üç yönlü doku: duvarlarda (x+z, y), çatılarda eğim yönüne göre. Instance ölçeği
 * dokuyu esnetmez; her binada aynı ölçekte sıva ve kiremit görünür.
 */
function worldTextured(material, tex, scale) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wTex = { value: tex };
    shader.uniforms.wScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;")
      .replace("#include <project_vertex>", `#include <project_vertex>
      vec4 wp4 = vec4(transformed, 1.0);
      vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4;
        wn = mat3(instanceMatrix) * wn;
      #endif
      vWPos = (modelMatrix * wp4).xyz;
      vWNrm = normalize(mat3(modelMatrix) * wn);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; uniform sampler2D wTex; uniform float wScale;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      vec3 an = abs(vWNrm);
      vec2 uvw = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
      diffuseColor.rgb *= texture2D(wTex, uvw / wScale).rgb * 1.08;`);
  };
  material.needsUpdate = true;
  return material;
}

const v = new THREE.Vector3();
const s = new THREE.Vector3();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

/** Bina yerel koordinatından dünyaya: lx sağa, ly yukarı, lz öne (cephe +z). */
export function local(b, lx, ly, lz) {
  const c = Math.cos(b.rot), sn = Math.sin(b.rot);
  return v.set(b.x + lx * c + lz * sn, FLAT_Y + ly, b.z - lx * sn + lz * c);
}

class Batch {
  constructor(geometry, material, { shadow = true } = {}) {
    Object.assign(this, { geometry, material, shadow, items: [] });
  }

  add(pos, rot, scale, color) {
    q.setFromAxisAngle(UP, rot);
    this.items.push({ m: new THREE.Matrix4().compose(pos.clone(), q.clone(), scale.clone()), color: color != null ? new THREE.Color(color) : null, owner: Batch.owner });
    return this.items.length - 1;
  }

  build() {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, this.items.length));
    mesh.count = this.items.length;
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    return mesh;
  }
}

/** Kırma çatı (dört yana eğimli). r = genişlik/derinlik; birim kutu içinde, mahya x ekseninde. */
function hipRoof(r) {
  const a = Math.max(0, 0.5 - 0.5 / r);
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, a, 1, 0, -0.5, 0, 0.5, a, 1, 0, -a, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -a, 1, 0, 0.5, 0, -0.5, -a, 1, 0, a, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -a, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, a, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

/** Beşik çatı: mahya x ekseninde, iki ucu üçgen alınlık. */
function gableRoof() {
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const HIP_RATIOS = [1, 1.4, 1.8, 2.4];

/** Bina parçalarının toplandığı InstancedMesh kümeleri. */
export function makeKit() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return {
    B: {
      walls: new Batch(box, worldTextured(std(0xffffff, { roughness: 0.92 }), T.plaster(), 6)),
      plinth: new Batch(box, worldTextured(std("#b4ada3"), T.stoneBase(), 2.4)),
      trims: new Batch(box, std(0xffffff, { roughness: 0.7 }), { shadow: false }),
      hips: HIP_RATIOS.map((r) => new Batch(hipRoof(r), worldTextured(std(0xffffff, { roughness: 0.75, flatShading: true }), T.tiles(), 1.6))),
      gable: new Batch(gableRoof(), worldTextured(std(0xffffff, { roughness: 0.75, flatShading: true }), T.tiles(), 1.6)),
      parapet: new Batch(box, std("#e7e2d9")),
      frames: new Batch(box, std("#f7f5f0", { roughness: 0.6 }), { shadow: false }),
      doors: new Batch(box, std("#6b4a35", { roughness: 0.6 }), { shadow: false }),
      slabs: new Batch(box, std("#e9e5dd")),
      rails: new Batch(box, std("#4a4f57", { roughness: 0.4, metalness: 0.5 }), { shadow: false }),
      awnings: new Batch(box, std(0xffffff, { roughness: 0.9 })),
      signs: new Batch(box, std(0xffffff, { roughness: 0.6 }), { shadow: false }),
      tanks: new Batch(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2).translate(0, 0.5, 0), std("#d9dde2", { metalness: 0.4, roughness: 0.4 })),
      solar: new Batch(box, std("#24324f", { roughness: 0.3, metalness: 0.3 }), { shadow: false }),
      chimneys: new Batch(box, std("#a29a90")),
      domes: new Batch(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff, { roughness: 0.5, metalness: 0.3 })),
    },
    glass: new Batch(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), { shadow: false }),
    windowOwners: [], // cam -> {slot} (daire) veya {workplace, seed}
  };
}

function kitBatches(K) {
  return [...Object.values(K.B).flatMap((x) => (Array.isArray(x) ? x : [x])), K.glass];
}

/** Kümeyi InstancedMesh'lere çevirir. */
export function buildKit(K) {
  const group = new THREE.Group();
  for (const batch of kitBatches(K)) group.add(batch.build());
  return group;
}

/** Bir binayı kümeye ekler. maxFloors verilirse yalnızca alttaki o kadar kat çizilir (kesit görünümü). */
export function drawBuilding(K, b, maxFloors = Infinity) {
  const { B, glass, windowOwners } = K;
  const addGlass = (b, lx, ly, lz, w, h, back, owner) => {
    glass.add(local(b, lx, ly, lz), b.rot + (back ? Math.PI : 0), s.set(w, h, 1), P.WINDOW_DAY);
    windowOwners.push(owner);
  };
  /** Pencere: çerçeve + cam + denizlik. side: 1 ön, -1 arka. */
  const addWindow = (b, lx, ly, side, w, h, owner) => {
    const z = side * (b.d / 2);
    B.frames.add(local(b, lx, ly - 0.08, z), b.rot, s.set(w + 0.24, h + 0.24, 0.16));
    addGlass(b, lx, ly + h / 2 - 0.08 + 0.04, z + side * 0.085, w, h, side < 0, owner);
    B.trims.add(local(b, lx, ly - 0.16, z + side * 0.1), b.rot, s.set(w + 0.5, 0.1, 0.28), "#f2efe8");
  };

  const floors = Math.min(b.floors, maxFloors);
  const full = floors === b.floors;
  const h = floors * FLOOR_H;
  if (floors <= 0) return;
  const st = b.style ?? {};
  B.walls.add(local(b, 0, 0, 0), b.rot, s.set(b.w, h, b.d), b.wall);
  B.plinth.add(local(b, 0, 0, 0), b.rot, s.set(b.w + 0.12, 0.6, b.d + 0.12));
  // Kat silmeleri.
  for (let f = 1; f < floors; f++) B.trims.add(local(b, 0, f * FLOOR_H - 0.1, 0), b.rot, s.set(b.w + 0.14, 0.2, b.d + 0.14), "#f6f3ee");
  // Çatı.
  if (full && b.roofType === "dome") {
    // Cami: kasnak üstünde kurşun kubbe ve alem.
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w * 0.82, 1.4, b.d * 0.82), b.wall);
    B.domes.add(local(b, 0, h + 1.4, 0), b.rot, s.set(b.w * 0.4, b.w * 0.36, b.d * 0.4), b.roof);
    B.rails.add(local(b, 0, h + 1.4 + b.w * 0.36, 0), b.rot, s.set(0.15, 1.6, 0.15));
  } else if (!full) {
    // Kesit görünümü: çatı yok, üst kat döşemesi.
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.1, 0.12, b.d + 0.1), "#d6d0c6");
  } else if (b.roofType === "hip") {
    const r = b.w / b.d;
    const k = HIP_RATIOS.reduce((best, x, i) => (Math.abs(x - r) < Math.abs(HIP_RATIOS[best] - r) ? i : best), 0);
    B.hips[k].add(local(b, 0, h, 0), b.rot, s.set(b.w + 1, b.d * 0.3, b.d + 1), b.roof);
    if (b.kind === "konut") B.chimneys.add(local(b, b.w * 0.25, h + b.d * 0.12, -b.d * 0.15), b.rot, s.set(0.6, b.d * 0.22, 0.6));
  } else if (b.roofType === "gable") {
    B.gable.add(local(b, 0, h, 0), b.rot + Math.PI / 2, s.set(b.d + 0.8, Math.min(5, b.w * 0.35), b.w + 0.8), b.roof);
  } else {
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.3, 0.12, b.d + 0.3), "#d6d0c6");
    for (const [lx, lz, w, d] of [[0, b.d / 2, b.w + 0.3, 0.3], [0, -b.d / 2, b.w + 0.3, 0.3], [b.w / 2, 0, 0.3, b.d], [-b.w / 2, 0, 0.3, b.d]]) {
      B.parapet.add(local(b, lx, h, lz), b.rot, s.set(w, 0.9, d));
    }
    if (b.kind === "konut" || b.kind === "otel") {
      // Çatıda güneş enerjili su ısıtıcıları.
      const n = Math.max(1, Math.floor(b.w / 6));
      for (let i = 0; i < n; i++) {
        const lx = -b.w / 2 + 3 + i * 5.5;
        B.solar.add(local(b, lx, h + 0.5, -1), b.rot, s.set(1.9, 0.08, 2.2));
        B.tanks.add(local(b, lx, h + 1.1, -2.6), b.rot, s.set(2, 0.6, 0.6));
      }
    }
  }

  if (b.kind === "konut") {
    // Apartman: kat başına perFloor daire; her dairenin önde balkonlu (ya da düz) penceresi, arkada penceresi.
    const bay = b.w / b.perFloor;
    for (let k = 0; k < b.daireler; k++) {
      const floor = Math.floor(k / b.perFloor), col = k % b.perFloor;
      if (floor >= floors) continue;
      const lx = -b.w / 2 + (col + 0.5) * bay;
      const ly = floor * FLOOR_H;
      const owner = { slot: b.slot0 + k };
      const doorClash = floor === 0 && Math.abs(lx) < 1.8;
      const fx = doorClash ? lx + (lx >= 0 ? 1.4 : -1.4) : lx;
      if (b.balconies && floor > 0) {
        addWindow(b, fx - 0.7, ly + 0.25, 1, 1.0, 2.15, owner);
        addWindow(b, fx + 0.9, ly + 0.95, 1, 1.0, 1.35, owner);
        B.slabs.add(local(b, fx, ly - 0.05, b.d / 2 + 0.6), b.rot, s.set(3.6, 0.16, 1.2));
        B.rails.add(local(b, fx, ly + 0.95, b.d / 2 + 1.17), b.rot, s.set(3.6, 0.05, 0.05));
        B.rails.add(local(b, fx, ly + 0.45, b.d / 2 + 1.17), b.rot, s.set(3.6, 0.03, 0.03));
        for (const e of [-1.78, 1.78]) B.rails.add(local(b, fx + e, ly + 0.1, b.d / 2 + 0.6), b.rot, s.set(0.04, 0.9, 1.15));
      } else {
        addWindow(b, fx, ly + 0.95, 1, 1.3, 1.4, owner);
      }
      addWindow(b, lx, ly + 0.95, -1, 1.2, 1.35, owner);
    }
    // Yan cephelerde merdiven pencereleri.
    for (let f = 0; f < floors; f++) {
      for (const side of [-1, 1]) {
        const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
        addWindow(fake, 0, f * FLOOR_H + 1.0, 1, 0.8, 1.1, { workplace: "merdiven", seed: f });
      }
    }
    // Cumba: üst katlarda sokağa taşan çıkma (Türk evlerinin tipik ayrıntısı).
    if (b.cumba) {
      for (let f = 1; f < floors; f++) {
        B.walls.add(local(b, 0, f * FLOOR_H + 0.1, b.d / 2 + 0.45), b.rot, s.set(3.4, FLOOR_H - 0.25, 0.9), b.wall);
        addWindow({ ...b, d: b.d + 1.8 }, 0, f * FLOOR_H + 0.95, 1, 2.2, 1.4, { workplace: "cumba", seed: f });
      }
    }
    // Giriş: kapı, saçak, basamak.
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.3, 2.3, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: 1.3, h: 2.3 };
    B.slabs.add(local(b, 0, 2.6, b.d / 2 + 0.6), b.rot, s.set(2.2, 0.12, 1.2));
    B.slabs.add(local(b, 0, 0, b.d / 2 + 0.7), b.rot, s.set(2.2, 0.15, 1.4));
    return;
  }

  // İş yerleri ve diğer binalar.
  const perFloor = Math.max(2, Math.round(b.w / 3.4));
  const bay = b.w / perFloor;
  const owner = (k) => ({ workplace: b.kind, seed: k });
  if (st.shop) {
    // Zemin kat dükkân vitrini, tente ve tabela.
    // Vitrin ortada camlı kapıyla ikiye bölünür.
    const pane = (b.w - 2.4 - 1.5) / 2;
    addGlass(b, -(0.75 + pane / 2), 0.45 + 1.3, b.d / 2 + 0.06, pane, 2.6, false, { workplace: b.kind, seed: 0, shop: true });
    addGlass(b, 0.75 + pane / 2, 0.45 + 1.3, b.d / 2 + 0.06, pane, 2.6, false, { workplace: b.kind, seed: 1, shop: true });
    B.frames.add(local(b, 0, 0.35, b.d / 2), b.rot, s.set(b.w - 2.1, 2.9, 0.1));
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.07), b.rot, s.set(1.3, 2.45, 0.06)), y: 0.15, z: b.d / 2 + 0.07, w: 1.3, h: 2.45 };
    B.awnings.add(local(b, 0, 3.0, b.d / 2 + 0.9), b.rot, s.set(b.w - 1.6, 0.12, 1.9), st.awning);
    B.awnings.add(local(b, 0, 2.75, b.d / 2 + 1.85), b.rot, s.set(b.w - 1.6, 0.35, 0.06), st.awning);
    B.signs.add(local(b, 0, 3.25, b.d / 2 + 0.1), b.rot, s.set(Math.min(b.w - 2, 7), 0.7, 0.12), st.awning);
  } else if (st.garage) {
    // Garaj kapıları (itfaiye, belediye garajı) ve yanında yaya kapısı.
    const n = Math.max(1, Math.floor((b.w - 4) / 5.5));
    for (let k = 0; k < n; k++) {
      const lx = -b.w / 2 + 2.5 + k * 5.5 + 2.2;
      B.signs.add(local(b, lx, 0.15, b.d / 2 + 0.04), b.rot, s.set(4.2, 3.6, 0.08), st.garage);
      for (let r = 1; r < 6; r++) B.trims.add(local(b, lx, 0.15 + r * 0.6, b.d / 2 + 0.09), b.rot, s.set(4.2, 0.05, 0.04), "#f2f2ef");
    }
    b.door = { idx: B.doors.add(local(b, b.w / 2 - 1.4, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.1, 2.3, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: 1.1, h: 2.3 };
    B.signs.add(local(b, 0, 4.4, b.d / 2 + 0.1), b.rot, s.set(Math.min(b.w - 2, 9), 0.9, 0.12), st.garage);
  } else if (!st.glass) {
    const dw = b.w > 20 ? 2.6 : 1.6;
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.02), b.rot, s.set(dw, 2.5, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: dw, h: 2.5 };
    B.slabs.add(local(b, 0, 2.9, b.d / 2 + 0.8), b.rot, s.set(b.w > 20 ? 4 : 2.4, 0.15, 1.6));
  }
  for (let f = 0; f < floors; f++) {
    if (f === 0 && st.shop) continue;
    for (let c = 0; c < perFloor; c++) {
      const lx = -b.w / 2 + (c + 0.5) * bay;
      if (f === 0 && Math.abs(lx) < 2.2) continue;
      if (st.glass) {
        addGlass(b, lx, f * FLOOR_H + 1.6, b.d / 2 + 0.05, bay - 0.25, FLOOR_H - 0.5, false, owner(f * perFloor + c));
        addGlass(b, lx, f * FLOOR_H + 1.6, -b.d / 2 - 0.05, bay - 0.25, FLOOR_H - 0.5, true, owner(f * perFloor + c + 1));
      } else {
        addWindow(b, lx, f * FLOOR_H + 0.95, 1, Math.min(1.4, bay - 0.8), 1.5, owner(f * perFloor + c));
        addWindow(b, lx, f * FLOOR_H + 0.95, -1, Math.min(1.4, bay - 0.8), 1.5, owner(f * perFloor + c + 7));
      }
      if (st.balconies && f > 0) {
        B.slabs.add(local(b, lx, f * FLOOR_H - 0.05, b.d / 2 + 0.6), b.rot, s.set(bay - 0.6, 0.15, 1.2));
        B.rails.add(local(b, lx, f * FLOOR_H + 0.95, b.d / 2 + 1.17), b.rot, s.set(bay - 0.6, 0.05, 0.05));
      }
    }
  }
  if (st.glass) for (let f = 1; f <= floors; f++) B.trims.add(local(b, 0, f * FLOOR_H - 0.25, 0), b.rot, s.set(b.w + 0.1, 0.25, b.d + 0.1), "#e8edf2");
  if (!full) return;
  if (st.tower) {
    B.walls.add(local(b, 0, h, -2), b.rot, s.set(5, 11, 5), b.wall);
    B.hips[0].add(local(b, 0, h + 11, -2), b.rot, s.set(6, 4, 6), b.roof);
    B.frames.add(local(b, 0, h + 7.5, 0.55), b.rot, s.set(2.8, 2.8, 0.15));
    B.rails.add(local(b, 0, h + 7.5, 0.65), b.rot, s.set(0.08, 1.1, 0.05));
  }
  if (st.columns) for (let i = 0; i < 6; i++) B.trims.add(local(b, -b.w / 2 + 2 + i * ((b.w - 4) / 5), 0.6, b.d / 2 + 1.5), b.rot, s.set(0.8, h - 0.6, 0.8), "#f4f1ea");
  if (st.columns) B.slabs.add(local(b, 0, h - 0.4, b.d / 2 + 1.5), b.rot, s.set(b.w, 0.6, 3));
  if (st.sign) {
    B.signs.add(local(b, 0, h - 1.6, b.d / 2 + 0.12), b.rot, s.set(2.6, 0.8, 0.12), st.sign);
    B.signs.add(local(b, 0, h - 2.5, b.d / 2 + 0.12), b.rot, s.set(0.8, 2.6, 0.12), st.sign);
  }
  if (b.kind === "belediye" || b.kind === "okul") {
    // Bayrak direği ve bayrak.
    B.rails.add(local(b, b.w / 2 - 2, 0, b.d / 2 + 4), b.rot, s.set(0.12, 10, 0.12));
    B.signs.add(local(b, b.w / 2 - 2 + 1.2, 8.4, b.d / 2 + 4), b.rot, s.set(2.4, 1.6, 0.04), "#d8233a");
  }
}

export function buildCity(world) {
  const K = makeKit();
  for (const b of world.buildings) {
    Batch.owner = b;
    drawBuilding(K, b);
  }
  Batch.owner = null;
  const group = buildKit(K);
  group.add(buildFeatures(world));
  const batches = kitBatches(K);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    windows: K.glass.mesh,
    windowOwners: K.windowOwners,
    wallMaterials: [K.B.walls.material, K.B.plinth.material, K.B.doors.material],
    /** Bir binayı gizler ya da geri getirir (ev içi görünümü için). */
    setHidden(b, on) {
      for (const batch of batches) {
        let touched = false;
        batch.items.forEach((it, i) => {
          if (it.owner !== b) return;
          batch.mesh.setMatrixAt(i, on ? hidden : it.m);
          touched = true;
        });
        if (touched) batch.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    /** Kapılar: içinden biri geçenler açılır (menteşesinden dışa doğru), diğerleri kapanır. */
    setOpenDoors(open) {
      const mesh = K.B.doors.mesh;
      let touched = false;
      const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      for (const b of this._open ?? []) {
        if (open.has(b) || !b.door) continue;
        mesh.setMatrixAt(b.door.idx, K.B.doors.items[b.door.idx].m);
        touched = true;
      }
      for (const b of open) {
        if (!b?.door || this._hidden === b) continue;
        const a = 1.25, d = b.door;
        const lx = -d.w / 2 + (d.w / 2) * Math.cos(a), lz = d.z + (d.w / 2) * Math.sin(a);
        const c = Math.cos(b.rot), sn = Math.sin(b.rot);
        pp.set(b.x + lx * c + lz * sn, FLAT_Y + d.y, b.z - lx * sn + lz * c);
        qq.setFromAxisAngle(UP, b.rot - a);
        m.compose(pp, qq, ss.set(d.w, d.h, 0.08));
        mesh.setMatrixAt(d.idx, m);
        touched = true;
      }
      this._open = new Set(open);
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    },
    /** Işın hangi binaya çarpıyor? */
    pickBuilding(raycaster) {
      const hit = raycaster.intersectObject(K.B.walls.mesh)[0];
      return hit?.instanceId != null ? K.B.walls.items[hit.instanceId].owner : null;
    },
  };
}

// --- kent eşyası ve özel yapılar ---

function buildFeatures(world) {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z, rot = 0, shadow = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const water = new THREE.MeshStandardMaterial({ color: "#6fc6d8", roughness: 0.08, metalness: 0.1 });
  const stone = std("#d8d0c4");
  const wood = std("#9b7353", { roughness: 0.9 });
  const darkWood = std("#6b4a35");
  const white = std("#f7f5f0");
  const metal = std("#4a4f57", { roughness: 0.4, metalness: 0.5 });

  // Bank ve masa gibi çok sayıdaki eşyalar tek InstancedMesh.
  const benchSeat = new Batch(new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), wood);
  const benchBack = new Batch(new THREE.BoxGeometry(1.8, 0.4, 0.06).rotateX(-0.15).translate(0, 0.75, -0.22), wood);
  const benchLegs = new Batch(new THREE.BoxGeometry(1.6, 0.45, 0.4).translate(0, 0.22, 0), metal, { shadow: false });
  const tables = new Batch(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12).translate(0, 0.74, 0), white);
  const tableLegs = new Batch(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6).translate(0, 0.36, 0), metal, { shadow: false });
  const chairs = new Batch(new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(0, 0.45, 0), wood);
  const chairBacks = new Batch(new THREE.BoxGeometry(0.42, 0.45, 0.04).translate(0, 0.7, -0.2), wood);
  // Sandalye ayakları (dört ince ayak, tek parça).
  const chairLegs = new Batch(mergeGeometries([[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => new THREE.CylinderGeometry(0.018, 0.018, 0.44, 5).translate(x, 0.22, z))), metal, { shadow: false });
  const chairBackLegs = new Batch(mergeGeometries([-0.18, 0.18].map((x) => new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5).translate(x, 0.72, -0.2))), metal, { shadow: false });
  // Çöp kutusu (kaldırımda) ve konteyner (park şeridinde).
  const bins = new Batch(mergeGeometries([new THREE.CylinderGeometry(0.24, 0.22, 0.8, 10).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.27, 0.27, 0.06, 10).translate(0, 0.82, 0)]), std("#4a6b4a", { metalness: 0.4, roughness: 0.5 }));
  const binPoles = new Batch(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6).translate(0, 0.5, -0.3), metal, { shadow: false });
  const containers = new Batch(mergeGeometries([
    new THREE.BoxGeometry(1.35, 1.1, 1.1).translate(0, 0.55, 0),
    new THREE.BoxGeometry(1.42, 0.1, 1.18).rotateX(-0.08).translate(0, 1.15, -0.02),
    ...[[-0.55, -0.42], [0.55, -0.42], [-0.55, 0.42], [0.55, 0.42]].map(([x, z]) => new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8).rotateZ(Math.PI / 2).translate(x, 0.08, z)),
  ]), std("#5f6a73", { metalness: 0.35, roughness: 0.55 }));
  const benchAt = (x, z, rot) => {
    const y = world.groundY(x, z);
    for (const batch of [benchSeat, benchBack, benchLegs]) batch.add(v.set(x, y, z), rot, s.set(1, 1, 1));
  };

  const fenerLamps = [];
  for (const f of world.features) {
    switch (f.type) {
      case "cesme": {
        const y = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(6.2, 6.5, 0.7, 8), stone, f.x, y + 0.35, f.z);
        add(new THREE.CylinderGeometry(5.7, 5.7, 0.1, 8), water, f.x, y + 0.62, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 8), stone, f.x, y + 1.3, f.z);
        add(new THREE.CylinderGeometry(1.8, 0.8, 0.5, 8), stone, f.x, y + 2.6, f.z);
        add(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 8), water, f.x, y + 2.84, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8), stone, f.x, y + 3.4, f.z);
        break;
      }
      case "bank":
        benchAt(f.x, f.z, f.rot);
        break;
      case "masa1":
        tables.add(v.set(f.x, world.groundY(f.x, f.z), f.z), 0, s.set(1, 1, 1));
        tableLegs.add(v.set(f.x, world.groundY(f.x, f.z), f.z), 0, s.set(1, 1, 1));
        break;
      case "sandalye":
        for (const batch of [chairs, chairBacks, chairLegs, chairBackLegs]) batch.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot, s.set(1, 1, 1));
        break;
      case "cop_kutusu":
        bins.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot ?? 0, s.set(1, 1, 1));
        binPoles.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot ?? 0, s.set(1, 1, 1));
        break;
      case "konteyner":
        containers.add(v.set(f.x, world.surfaceY(f.x, f.z) + 0.06, f.z), (f.rot ?? 0) + Math.PI / 2, s.set(1, 1, 1));
        break;
      case "tabela_h": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), metal, f.x, y0 + 2, f.z);
        add(new THREE.BoxGeometry(0.15, 1.6, 1.6), std("#2f6fb5"), f.x, y0 + 4.5, f.z, Math.PI / 2);
        add(new THREE.BoxGeometry(0.17, 1.0, 0.25), white, f.x, y0 + 4.5, f.z, Math.PI / 2, false);
        add(new THREE.BoxGeometry(0.17, 0.25, 0.8), white, f.x, y0 + 4.5, f.z, Math.PI / 2, false);
        break;
      }
      case "gol": {
        add(new THREE.CylinderGeometry(f.r + 0.6, f.r + 0.8, 0.5, 28), stone, f.x, FLAT_Y + 0.15, f.z);
        add(new THREE.CylinderGeometry(f.r, f.r, 0.1, 28), water, f.x, FLAT_Y + 0.38, f.z, 0, false);
        break;
      }
      case "havuz":
        add(new THREE.BoxGeometry(f.w + 4, 0.3, f.d + 4), std("#efe9df"), f.x, FLAT_Y + 0.15, f.z);
        add(new THREE.BoxGeometry(f.w, 0.1, f.d), new THREE.MeshStandardMaterial({ color: "#5cc7e0", roughness: 0.05 }), f.x, FLAT_Y + 0.31, f.z, 0, false);
        for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.7, 0.3, 1.9), white, f.x - f.w / 2 + 2 + i * 4.2, FLAT_Y + 0.45, f.z + f.d / 2 + 1.4);
        break;
      case "tezgah": {
        const c = P.CLOTHES[f.c % P.CLOTHES.length];
        add(new THREE.BoxGeometry(3, 0.9, 1.6), wood, f.x, FLAT_Y + 0.5, f.z);
        add(new THREE.BoxGeometry(3.4, 0.08, 2.2), std(c), f.x, FLAT_Y + 2.4, f.z, 0, true).rotation.x = -0.12;
        for (const dx of [-1.6, 1.6]) for (const dz of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 4), metal, f.x + dx, FLAT_Y + 1.2, f.z + dz, 0, false);
        add(new THREE.BoxGeometry(2.6, 0.25, 1.2), std(["#e0a33a", "#d2552f", "#7fae45", "#e8c95a"][f.c % 4]), f.x, FLAT_Y + 1.05, f.z, 0, false);
        break;
      }
      case "vinc": {
        add(new THREE.BoxGeometry(1.4, 26, 1.4), std("#e8b93a"), f.x, FLAT_Y + 13, f.z);
        add(new THREE.BoxGeometry(22, 1.2, 1.2), std("#e8b93a"), f.x - 8, FLAT_Y + 25.5, f.z);
        add(new THREE.BoxGeometry(0.05, 12, 0.05), metal, f.x - 16, FLAT_Y + 19.5, f.z, 0, false);
        break;
      }
      case "fener": {
        const y0 = world.height(f.x, f.z);
        add(new THREE.CylinderGeometry(4, 4.4, 1.5, 12), stone, f.x, y0 + 0.75, f.z);
        for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(2.4 - i * 0.22, 2.62 - i * 0.22, 4, 14), std(i % 2 ? "#c8312f" : "#f7f5f0"), f.x, y0 + 3.5 + i * 4, f.z);
        add(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 14), metal, f.x, y0 + 17.6, f.z);
        const lamp = add(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), new THREE.MeshBasicMaterial({ color: "#fff3c4", toneMapped: false }), f.x, y0 + 18.8, f.z, 0, false);
        add(new THREE.ConeGeometry(1.8, 1.8, 12), std("#c8312f"), f.x, y0 + 20.7, f.z);
        fenerLamps.push(lamp);
        break;
      }
      case "tribun": {
        const y0 = world.groundY((f.x0 + f.x1) / 2, f.z);
        const len = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2;
        const concrete = std("#cfcac2");
        for (let r = 0; r < 4; r++) {
          const z = f.z + f.side * (1.2 + r * 0.8);
          add(new THREE.BoxGeometry(len, 0.4 + r * 0.4, 0.8), concrete, cx, y0 + (0.4 + r * 0.4) / 2, z);
          add(new THREE.BoxGeometry(len, 0.08, 0.45), std(r % 2 ? "#d8433d" : "#2f6fb5"), cx, y0 + 0.45 + r * 0.4, z - f.side * 0.05, 0, false);
        }
        add(new THREE.BoxGeometry(len, 2.6, 0.25), concrete, cx, y0 + 1.3, f.z + f.side * 4.4);
        if (f.side < 0) {
          // Kuzey tribününe çatı.
          for (let x = f.x0; x <= f.x1; x += 15) add(new THREE.BoxGeometry(0.2, 4.6, 0.2), metal, x, y0 + 2.3, f.z - 4.3);
          const roof = add(new THREE.BoxGeometry(len + 1, 0.15, 4.6), std("#e9eef2", { metalness: 0.3, roughness: 0.4 }), cx, y0 + 4.7, f.z - 2.4);
          roof.rotation.x = -0.08;
        }
        break;
      }
      case "kale": {
        const y0 = world.groundY(f.x, f.z) + 0.1;
        const post = std("#ffffff");
        for (const dz of [-3.66, 3.66]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8), post, f.x, y0 + 1.22, f.z + dz);
        add(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 8).rotateX(Math.PI / 2), post, f.x, y0 + 2.44, f.z);
        const net = new THREE.MeshStandardMaterial({ color: "#f4f4f4", transparent: true, opacity: 0.35, roughness: 1, side: THREE.DoubleSide });
        add(new THREE.BoxGeometry(2, 2.44, 7.32), net, f.x - f.dir * 1, y0 + 1.22, f.z, 0, false);
        break;
      }
      case "projektor": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(0.25, 0.4, 24, 8), metal, f.x, y0 + 12, f.z);
        const head = add(new THREE.BoxGeometry(3.2, 1.6, 0.4), new THREE.MeshBasicMaterial({ color: "#fff6dc", toneMapped: false }), f.x, y0 + 24.5, f.z, Math.atan2(145 - f.x, -84 - f.z), false);
        head.rotation.x = 0.35;
        break;
      }
      case "minare": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(1.5, 1.6, 2, 12), stone, f.x, y0 + 1, f.z);
        add(new THREE.CylinderGeometry(1.0, 1.15, 22, 12), white, f.x, y0 + 13, f.z);
        add(new THREE.CylinderGeometry(1.55, 1.2, 0.5, 12), stone, f.x, y0 + 18, f.z);
        add(new THREE.CylinderGeometry(0.9, 1.0, 4, 12), white, f.x, y0 + 26, f.z);
        add(new THREE.ConeGeometry(1.05, 5, 12), std("#7d8e9c", { metalness: 0.3, roughness: 0.5 }), f.x, y0 + 30.5, f.z);
        add(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), std("#c9a24a", { metalness: 0.7, roughness: 0.3 }), f.x, y0 + 33.6, f.z, 0, false);
        break;
      }
      case "sadirvan": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(2.2, 2.4, 0.9, 8), stone, f.x, y0 + 0.45, f.z);
        add(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 8), water, f.x, y0 + 0.85, f.z, 0, false);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), stone, f.x + Math.cos(a) * 2.6, y0 + 1.3, f.z + Math.sin(a) * 2.6, 0, false); }
        add(new THREE.ConeGeometry(3.4, 1.4, 8), std("#7d8e9c", { metalness: 0.3, roughness: 0.5 }), f.x, y0 + 3.3, f.z);
        break;
      }
      case "oyun": {
        const y0 = world.groundY(f.x, f.z);
        const red = std("#d8433d"), yellow = std("#e8b93a"), blue = std("#2f6fb5");
        add(new THREE.BoxGeometry(1.2, 2.2, 1.2), blue, f.x - 4, y0 + 1.1, f.z - 2);
        const slide = add(new THREE.BoxGeometry(0.9, 0.1, 4.2), yellow, f.x - 4, y0 + 1.15, f.z + 0.6);
        slide.rotation.x = -0.5;
        for (const dx of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.12, 2.6, 0.12), red, f.x + 3 + dx, y0 + 1.3, f.z - 2);
        add(new THREE.BoxGeometry(3.4, 0.12, 0.12), red, f.x + 3, y0 + 2.6, f.z - 2);
        for (const dx of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.5, 0.06, 0.25), std("#3c4148"), f.x + 3 + dx, y0 + 0.6, f.z - 2, 0, false);
        const see = add(new THREE.BoxGeometry(0.3, 0.1, 3.4), yellow, f.x, y0 + 0.5, f.z + 3);
        see.rotation.x = 0.15;
        add(new THREE.BoxGeometry(0.4, 0.45, 0.4), red, f.x, y0 + 0.22, f.z + 3);
        break;
      }
      case "pota": {
        const y0 = world.groundY(f.x, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0, f.z);
        g.rotation.y = f.rot ?? 0;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), metal); pole.position.set(0, 1.7, -0.4);
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), white); board.position.set(0, 3.35, -0.2);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2), std("#e05a2a")); hoop.position.set(0, 3.05, 0.1);
        g.add(pole, board, hoop);
        g.traverse((o) => { o.castShadow = true; });
        group.add(g);
        break;
      }
      case "semsiye": {
        const y0 = f.town ? world.groundY(f.x, f.z) : Math.max(world.height(f.x, f.z), 0.3);
        add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5), white, f.x, y0 + 1.2, f.z, 0, false);
        add(new THREE.ConeGeometry(1.4, 0.5, 10), std(["#e05a4a", "#2f7fb5", "#f2c14e", "#3e8a86"][f.c % 4]), f.x, y0 + 2.4, f.z);
        break;
      }
      case "sezlong": {
        const y0 = Math.max(world.height(f.x, f.z), 0.3);
        add(new THREE.BoxGeometry(0.7, 0.1, 1.9), white, f.x, y0 + 0.3, f.z, f.rot);
        break;
      }
      case "cankurtaran": {
        const y0 = Math.max(world.height(f.x, f.z), 0.3);
        for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood, f.x + dx, y0 + 1.3, f.z + dz, 0, false);
        add(new THREE.BoxGeometry(2, 0.15, 2), wood, f.x, y0 + 2.6, f.z);
        add(new THREE.BoxGeometry(2.2, 0.1, 2.2), std("#d8433d"), f.x, y0 + 4.2, f.z);
        break;
      }
    }
  }
  for (const batch of [benchSeat, benchBack, benchLegs, tables, tableLegs, chairs, chairBacks, chairLegs, chairBackLegs, bins, binPoles, containers]) group.add(batch.build());
  group.userData.fenerLamps = fenerLamps;
  return group;
}
