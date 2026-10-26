// Binalar ve kent eşyası. Ölçüler gerçektir (metre).
// Aynı parçalar (pencere, balkon, çatı...) tek bir InstancedMesh ile çizilir; telefonda da akıcı kalsın diye.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLAT_Y, FLOOR_H, playgroundItems, unitLayout } from "./layout.js";
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
      railPanels: new Batch(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: T.railing(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5, color: "#3a3f47" }), { shadow: false }),
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
  // Duvar ve taş taban zeminin 0,8 m altından başlar: arazideki küçük iniş çıkışlar binanın dibinde
  // boşluk ya da titreşen kesişme bırakmaz.
  B.walls.add(local(b, 0, -0.8, 0), b.rot, s.set(b.w, h + 0.8, b.d), b.wall);
  B.plinth.add(local(b, 0, -0.8, 0), b.rot, s.set(b.w + 0.12, 1.4, b.d + 0.12));
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
    // Apartman: ortada merdiven çekirdeği, iki yanında daireler (unitLayout). Her dairenin önde balkonlu
    // ya da düz penceresi, arkada penceresi var; çekirdeğin önünde her katta merdiven penceresi.
    const plan = unitLayout(b);
    const cumbaUnit = b.cumba ? plan.units[0] : null;
    for (let k = 0; k < b.daireler; k++) {
      const floor = Math.floor(k / b.perFloor), col = k % b.perFloor;
      if (floor >= floors) continue;
      const unit = plan.units[col];
      const fx = unit.cx;
      const ly = floor * FLOOR_H;
      const owner = { slot: b.slot0 + k };
      if (cumbaUnit === unit && floor > 0) {
        // Cumbanın kendi penceresi var.
      } else if (b.balconies && floor > 0) {
        addWindow(b, fx - 0.7, ly + 0.25, 1, 1.0, 2.15, owner);
        addWindow(b, fx + 0.9, ly + 0.95, 1, 1.0, 1.35, owner);
        B.slabs.add(local(b, fx, ly - 0.05, b.d / 2 + 0.6), b.rot, s.set(3.6, 0.16, 1.2));
        // Korkuluk: üstte küpeşte, altında ince parmaklıklar (saydam dokulu panel).
        B.rails.add(local(b, fx, ly + 1.0, b.d / 2 + 1.17), b.rot, s.set(3.62, 0.05, 0.06));
        B.railPanels.add(local(b, fx, ly + 0.55, b.d / 2 + 1.17), b.rot, s.set(3.6, 0.9, 1));
        for (const e of [-1.79, 1.79]) {
          B.rails.add(local(b, fx + e, ly + 1.0, b.d / 2 + 0.6), b.rot, s.set(0.05, 0.05, 1.15));
          B.railPanels.add(local(b, fx + e, ly + 0.55, b.d / 2 + 0.6), b.rot + Math.PI / 2, s.set(1.12, 0.9, 1));
        }
      } else {
        addWindow(b, fx, ly + 0.95, 1, 1.4, 1.4, owner);
      }
      addWindow(b, fx, ly + (plan.corridor ? 1.3 : 0.95), -1, plan.corridor ? 0.9 : 1.2, plan.corridor ? 0.9 : 1.35, owner);
    }
    // Merdiven penceresi (çekirdeğin önünde, kat aralarında) ve yanlarda birer pencere.
    for (let f = 0; f < floors; f++) {
      if (f > 0) addWindow(b, 0, f * FLOOR_H - 0.6, 1, 0.8, 1.2, { workplace: "merdiven", seed: f });
      for (const side of [-1, 1]) {
        const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
        addWindow(fake, -side * 2.4, f * FLOOR_H + 1.0, 1, 0.9, 1.1, { workplace: "yan", seed: f });
      }
    }
    // Cumba: üst katlarda sokağa taşan çıkma (Türk evlerinin tipik ayrıntısı).
    if (cumbaUnit) {
      for (let f = 1; f < floors; f++) {
        B.walls.add(local(b, cumbaUnit.cx, f * FLOOR_H + 0.1, b.d / 2 + 0.45), b.rot, s.set(3.4, FLOOR_H - 0.25, 0.9), b.wall);
        addWindow({ ...b, d: b.d + 1.8 }, cumbaUnit.cx, f * FLOOR_H + 0.95, 1, 2.2, 1.4, { slot: b.slot0 + f * b.perFloor });
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
  if (st.glass) {
    // Cam bina girişi: döner kapı ve saçak.
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.12), b.rot, s.set(2.4, 2.6, 0.1)), y: 0.15, z: b.d / 2 + 0.12, w: 2.4, h: 2.6 };
    B.slabs.add(local(b, 0, 3.0, b.d / 2 + 1.2), b.rot, s.set(5, 0.18, 2.4));
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
  const features = buildFeatures(world);
  group.add(features);
  group.add(buildFrontPaths(world));
  const batches = kitBatches(K);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    tick: (t) => features.userData.tick(t),
    setFlood: (n) => features.userData.setFlood(n),
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

/** Yumuşak ışık halkası dokusu (parlama için). */
function glareTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// --- apartman önü patikaları: kaldırımdan kapıya, her binada farklı ---

function buildFrontPaths(world) {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const gravel = new Batch(box, std(0xffffff, { roughness: 1 }), { shadow: false });
  const stone = new Batch(box, std(0xffffff, { roughness: 0.9 }), { shadow: false });
  const hedge = new Batch(new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.7, 1).translate(0, 0.3, 0), std(0xffffff, { roughness: 1, flatShading: true }));
  const flowers = new Batch(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), { shadow: false });
  const GRAVELS = ["#cdbb9c", "#bfae94", "#d6c7ad", "#b8a68a"];
  const STONES = ["#d9d4ca", "#c9c2b6", "#e2dccf", "#bdb5a8"];
  const HEDGES = ["#4f7d3e", "#5c8a47", "#476f38"];
  const BLOOMS = ["#e05a6a", "#f2c230", "#f4f1ea", "#9a6ad8", "#f28c5a"];
  const rnd = (seed, n) => ((Math.imul(seed * 2654435761 + n * 40503, 2246822519) >>> 0) % 10000) / 10000;
  for (const b of world.buildings) {
    if (!b.daireler || !b.yard) continue;
    const seed = b.pathSeed ?? 1;
    const y0 = b.d / 2, y1 = b.d / 2 + b.yard + 0.15; // bina önünden kaldırım kenarına (yerel z)
    const L = y1 - y0;
    const kind = Math.floor(rnd(seed, 1) * 4);
    const w = 1.2 + rnd(seed, 2) * 0.7;
    const slab = (lx, lz, sw, sd, color, batch, rot = 0) => batch.add(local(b, lx, -0.06, lz), b.rot + rot, s.set(sw, 0.1, sd), color);
    if (kind === 0) {
      slab(0, (y0 + y1) / 2, w, L, GRAVELS[Math.floor(rnd(seed, 3) * 4)], gravel);
    } else if (kind === 1) {
      // Basamak taşları: hafif yana kayan, biraz dönük.
      const n = Math.max(2, Math.floor(L / 0.75));
      for (let i = 0; i < n; i++) {
        const lz = y0 + 0.4 + (i * (L - 0.6)) / Math.max(1, n - 1);
        slab((i % 2 ? 0.15 : -0.15) + (rnd(seed, 10 + i) - 0.5) * 0.1, lz, 0.75, 0.5, STONES[i % 4], stone, (rnd(seed, 20 + i) - 0.5) * 0.4);
      }
    } else if (kind === 2) {
      // Taş döşeme, iki yanında ince bordür.
      slab(0, (y0 + y1) / 2, w, L, STONES[Math.floor(rnd(seed, 3) * 4)], stone);
      for (const e of [-1, 1]) slab(e * (w / 2 + 0.07), (y0 + y1) / 2, 0.12, L, "#9e978b", stone);
    } else {
      // Kıvrılan çakıl yol: kapıdan biraz ilerleyip yana kayar.
      const sx = (rnd(seed, 4) < 0.5 ? -1 : 1) * (1.0 + rnd(seed, 5) * 1.2);
      const mid = y0 + L * 0.45;
      const color = GRAVELS[Math.floor(rnd(seed, 3) * 4)];
      slab(0, (y0 + mid) / 2, w, mid - y0 + 0.2, color, gravel);
      const dx = sx, dz = y1 - mid;
      const len = Math.hypot(dx, dz);
      slab(sx / 2, (mid + y1) / 2, w, len + 0.2, color, gravel, Math.atan2(dx, dz));
    }
    // Bazı bahçelerde yolun iki yanında çit ve çiçekler.
    if (rnd(seed, 6) < 0.6) {
      const n = Math.floor(L / 0.9);
      for (const e of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const lz = y0 + 0.5 + i * 0.9, lx = e * (w / 2 + 0.6 + rnd(seed, 30 + i) * 0.3);
          if (rnd(seed, 40 + i + e) < 0.65) hedge.add(local(b, lx, 0, lz), b.rot, s.set(0.9, 0.8 + rnd(seed, 50 + i) * 0.5, 0.9), HEDGES[(i + seed) % 3]);
          else for (let f = 0; f < 3; f++) flowers.add(local(b, lx + (f - 1) * 0.2, 0.15, lz + (f % 2) * 0.15), 0, s.set(1, 1, 1), BLOOMS[(seed + f + i) % 5]);
        }
      }
    }
  }
  const group = new THREE.Group();
  for (const batch of [gravel, stone, hedge, flowers]) group.add(batch.build());
  return group;
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
  // Stadyum ışıkları: gece yanan mercekler ve parlama (setFlood ile).
  const floodPole = std("#8a929c", { metalness: 0.6, roughness: 0.45 });
  const floodHousing = std("#3a3f47", { metalness: 0.5, roughness: 0.5 });
  const floodLens = new THREE.MeshStandardMaterial({ color: "#c9d2dc", roughness: 0.15, metalness: 0.2, emissive: new THREE.Color("#f4f7ff"), emissiveIntensity: 0 });
  const floodGlareMat = new THREE.SpriteMaterial({ map: glareTexture(), color: "#eef3ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
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
  const fountains = [];
  for (const f of world.features) {
    switch (f.type) {
      case "cesme": {
        // Meydan çeşmesi: sekizgen büyük havuz, oymalı kenar, üç kademeli çanak, fıskiyeler ve
        // havuza dökülen su perdeleri; çevresinde çiçek tarhları.
        const y = world.groundY(f.x, f.z);
        const marble = std("#ece6da", { roughness: 0.55 });
        const rimMat = std("#d9cfbf", { roughness: 0.6 });
        const gold = std("#c9a24a", { metalness: 0.7, roughness: 0.3 });
        const pool = new THREE.MeshStandardMaterial({ color: "#5fc2d6", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
        const spray = new THREE.MeshStandardMaterial({ color: "#e8f8fc", roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
        const R = 7.6;
        add(new THREE.CylinderGeometry(R, R + 0.3, 0.75, 8), marble, f.x, y + 0.37, f.z, Math.PI / 8);
        add(new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.14, 8), rimMat, f.x, y + 0.8, f.z, Math.PI / 8);
        add(new THREE.CylinderGeometry(R - 0.45, R - 0.45, 0.06, 32), pool, f.x, y + 0.66, f.z, 0, false);
        // Kenarda sekiz küçük kaide ve üzerlerinde topuz.
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
          const px = f.x + Math.cos(a) * (R + 0.05), pz = f.z + Math.sin(a) * (R + 0.05);
          add(new THREE.BoxGeometry(0.7, 0.5, 0.7), marble, px, y + 1.1, pz, -a);
          add(new THREE.SphereGeometry(0.28, 12, 8), marble, px, y + 1.55, pz);
        }
        // Orta ayak ve kademeler.
        add(new THREE.CylinderGeometry(1.1, 1.5, 0.6, 16), marble, f.x, y + 0.95, f.z);
        add(new THREE.CylinderGeometry(0.55, 0.8, 1.6, 16), marble, f.x, y + 2.0, f.z);
        add(new THREE.CylinderGeometry(3.4, 1.0, 0.55, 24), marble, f.x, y + 2.95, f.z);
        add(new THREE.CylinderGeometry(3.1, 3.1, 0.06, 24), pool, f.x, y + 3.2, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 12), marble, f.x, y + 3.9, f.z);
        add(new THREE.CylinderGeometry(1.8, 0.6, 0.4, 20), marble, f.x, y + 4.75, f.z);
        add(new THREE.CylinderGeometry(1.6, 1.6, 0.05, 20), pool, f.x, y + 4.93, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), marble, f.x, y + 5.4, f.z);
        add(new THREE.SphereGeometry(0.32, 14, 10), gold, f.x, y + 6.0, f.z);
        // Su perdeleri: çanakların kenarından aşağı dökülen ince silindirler (dalgalanır).
        const curtains = [
          add(new THREE.CylinderGeometry(3.25, 3.45, 2.25, 32, 1, true), spray, f.x, y + 1.85, f.z, 0, false),
          add(new THREE.CylinderGeometry(1.7, 1.9, 1.55, 24, 1, true), spray, f.x, y + 4.0, f.z, 0, false),
        ];
        // Tepedeki fıskiye ve havuz kenarından içe doğru kavis yapan sekiz su kemeri.
        const jet = add(new THREE.ConeGeometry(0.28, 2.4, 10, 1, true), spray, f.x, y + 7.3, f.z, 0, false);
        jet.rotation.x = Math.PI;
        const arcs = [];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const p0 = new THREE.Vector3(f.x + Math.cos(a) * (R - 0.5), y + 0.9, f.z + Math.sin(a) * (R - 0.5));
          const p2 = new THREE.Vector3(f.x + Math.cos(a) * 3.6, y + 0.7, f.z + Math.sin(a) * 3.6);
          const p1 = p0.clone().lerp(p2, 0.5).setY(y + 3.6);
          const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 16, 0.07, 6, false);
          const m = new THREE.Mesh(tube, spray);
          group.add(m);
          arcs.push(m);
        }
        fountains.push({ curtains, jet, arcs, pool });
        // Çevresinde sekiz çiçek tarhı (yürüyüş halkasının dışında, bankların arasında).
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const px = f.x + Math.cos(a) * 18.5, pz = f.z + Math.sin(a) * 18.5;
          add(new THREE.CylinderGeometry(1.5, 1.6, 0.4, 12), rimMat, px, y + 0.2, pz);
          add(new THREE.CylinderGeometry(1.35, 1.35, 0.1, 12), std("#5b4636"), px, y + 0.4, pz, 0, false);
          for (let j = 0; j < 9; j++) {
            const b2 = (j / 9) * Math.PI * 2;
            const r = j === 0 ? 0 : 0.8;
            add(new THREE.IcosahedronGeometry(0.22, 0), std(["#e05a6a", "#f2c230", "#9a6ad8", "#f4f1ea", "#f28c5a"][(j + k) % 5], { flatShading: true }), px + Math.cos(b2) * r, y + 0.6, pz + Math.sin(b2) * r, 0, false);
          }
        }
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
        // Stadyum ışık direği: konik direk, bakım merdiveni, platform ve korkuluk; çerçevede 4×3
        // projektör sahanın ortasına eğik bakar. Gece yanar, uzaktan parlama görünür.
        const y0 = world.groundY(f.x, f.z);
        const H = 24, facing = Math.atan2(145 - f.x, -84 - f.z);
        add(new THREE.CylinderGeometry(0.28, 0.6, H, 12), floodPole, f.x, y0 + H / 2, f.z);
        add(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 12), stone, f.x, y0 + 0.3, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0 + H, f.z);
        g.rotation.y = facing;
        group.add(g);
        const put = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m; };
        // Merdiven (direğin arkasında), platform ve korkuluk.
        for (const sx of [-0.22, 0.22]) put(new THREE.BoxGeometry(0.05, H - 1, 0.05), floodPole, sx, -(H - 1) / 2 - 0.5, -0.75, false);
        for (let y = 1; y < H - 1; y += 0.6) put(new THREE.BoxGeometry(0.44, 0.03, 0.03), floodPole, 0, -y, -0.75, false);
        put(new THREE.BoxGeometry(4.8, 0.12, 1.6), floodPole, 0, 0.1, 0.1);
        for (const [x, z, w, d] of [[0, 0.88, 4.8, 0.04], [0, -0.68, 4.8, 0.04], [-2.4, 0.1, 0.04, 1.6], [2.4, 0.1, 0.04, 1.6]]) {
          put(new THREE.BoxGeometry(w, 0.04, d), floodPole, x, 1.1, z, false);
          put(new THREE.BoxGeometry(w, 0.03, d), floodPole, x, 0.6, z, false);
        }
        for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) for (const z of [-0.68, 0.88]) put(new THREE.BoxGeometry(0.04, 1.0, 0.04), floodPole, x, 0.6, z, false);
        // Projektör çerçevesi: platformun üstünde, sahaya doğru öne eğik.
        const frame = new THREE.Group();
        frame.position.set(0, 2.9, 0.4);
        frame.rotation.x = 0.42;
        g.add(frame);
        for (const y of [-1.35, 1.35]) { const m = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), floodPole); m.position.y = y; frame.add(m); }
        for (const x of [-2.3, 2.3]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), floodPole); m.position.x = x; frame.add(m); }
        const sup = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), floodPole);
        sup.position.set(0, 1.4, 0.2); g.add(sup);
        for (let r = 0; r < 3; r++) {
          for (let k = 0; k < 4; k++) {
            const x = -1.65 + k * 1.1, y = -0.9 + r * 0.9;
            const house = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), floodHousing);
            house.position.set(x, y, -0.05);
            house.castShadow = true;
            frame.add(house);
            const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.56), floodLens);
            lens.position.set(x, y, 0.205);
            frame.add(lens);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.04, 0.22), floodHousing);
            visor.position.set(x, y + 0.36, 0.3);
            frame.add(visor);
          }
        }
        // Parlama: gece projektörlerin önünde yumuşak bir ışık halkası.
        const glare = new THREE.Sprite(floodGlareMat);
        glare.scale.set(9, 7, 1);
        glare.position.set(0, 0, 0.6);
        frame.add(glare);
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
        // Her park farklı: aletler, yerleşim, renkler tohumdan.
        const y0 = world.groundY(f.x, f.z);
        const PAL = [["#d8433d", "#e8b93a", "#2f6fb5"], ["#3e8a86", "#f28c28", "#f4f1ea"], ["#8a62d1", "#7fae45", "#e05a6a"], ["#2f4a6d", "#e8b93a", "#d98ca0"], ["#6f7d4a", "#c8312f", "#8fb6d9"]];
        for (const it of playgroundItems(f)) {
          const [c1, c2, c3] = PAL[it.c].map((c) => std(c));
          const g = new THREE.Group();
          g.position.set(it.x, y0, it.z);
          g.rotation.y = it.rot;
          const put = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
          const post = (x, z, hgt, mat = metal) => put(new THREE.CylinderGeometry(0.06, 0.06, hgt, 8), mat, x, hgt / 2, z);
          switch (it.kind) {
            case "kule": {
              for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) post(x, z, 2.9, c1);
              put(new THREE.BoxGeometry(1.8, 0.1, 1.8), wood, 0, 1.4, 0);
              put(new THREE.ConeGeometry(1.45, 1.0, 4), c2, 0, 3.4, 0).rotation.y = Math.PI / 4;
              for (const z of [-0.85, 0.85]) put(new THREE.BoxGeometry(1.7, 0.5, 0.05), c3, 0, 1.75, z);
              const sl = put(new THREE.BoxGeometry(0.7, 0.08, 3.0), c2, 2.0, 0.75, 0, 0, -0.5);
              sl.rotation.set(0, Math.PI / 2, 0); sl.rotateX(0.5);
              for (let k = 0; k < 5; k++) put(new THREE.BoxGeometry(0.6, 0.05, 0.08), metal, -1.1, 0.25 + k * 0.28, 0);
              for (const z of [-0.3, 0.3]) put(new THREE.BoxGeometry(0.05, 1.5, 0.05), metal, -1.1, 0.75, z);
              break;
            }
            case "salincak": {
              const n = 2 + (it.c % 2);
              for (const x of [-it.w / 2 + 0.2, it.w / 2 - 0.2]) {
                put(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), c1, x, 1.25, -0.5, 0.35);
                put(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), c1, x, 1.25, 0.5, -0.35);
              }
              put(new THREE.CylinderGeometry(0.07, 0.07, it.w, 8), c1, 0, 2.45, 0, 0, Math.PI / 2);
              for (let k = 0; k < n; k++) {
                const x = -it.w / 2 + ((k + 1) * it.w) / (n + 1);
                for (const dx of [-0.2, 0.2]) put(new THREE.CylinderGeometry(0.012, 0.012, 1.95, 4), metal, x + dx, 1.45, 0);
                put(new THREE.BoxGeometry(0.5, 0.05, 0.22), c2, x, 0.48, 0);
              }
              break;
            }
            case "tahterevalli": {
              put(new THREE.BoxGeometry(0.3, 0.45, 0.4), c1, 0, 0.22, 0);
              const beam = put(new THREE.BoxGeometry(3.4, 0.08, 0.3), c2, 0, 0.5, 0, 0, 0.14);
              void beam;
              for (const x of [-1.5, 1.5]) put(new THREE.BoxGeometry(0.06, 0.3, 0.3), metal, x, 0.5 + x * 0.14 + 0.2, 0);
              break;
            }
            case "yayli": {
              for (let k = 0; k < 2; k++) {
                const x = -0.8 + k * 1.6;
                put(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), metal, x, 0.25, 0);
                put(new THREE.SphereGeometry(0.35, 10, 8).scale(1.3, 0.8, 0.7), k ? c2 : c3, x, 0.7, 0);
                put(new THREE.SphereGeometry(0.18, 8, 6), k ? c2 : c3, x + 0.45, 0.95, 0);
              }
              break;
            }
            case "kum": {
              for (const [x, z, w2, d2] of [[0, -1.6, 3.4, 0.2], [0, 1.6, 3.4, 0.2], [-1.6, 0, 0.2, 3.4], [1.6, 0, 0.2, 3.4]]) put(new THREE.BoxGeometry(w2, 0.3, d2), wood, x, 0.15, z);
              put(new THREE.BoxGeometry(3.0, 0.18, 3.0), std("#e9d5a6"), 0, 0.09, 0);
              put(new THREE.ConeGeometry(0.3, 0.25, 8), std("#e05a6a"), 0.6, 0.3, -0.4);
              put(new THREE.BoxGeometry(0.25, 0.2, 0.25), std("#2f6fb5"), -0.7, 0.28, 0.5);
              break;
            }
            case "kubbe": {
              const dome = put(new THREE.IcosahedronGeometry(1.7, 1), new THREE.MeshStandardMaterial({ color: PAL[it.c][0], wireframe: true }), 0, 0.2, 0);
              dome.scale.y = 0.9;
              break;
            }
            case "atlikarinca": {
              put(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), c1, 0, 0.35, 0);
              put(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), metal, 0, 0.9, 0);
              for (let k = 0; k < 4; k++) {
                const a = (k / 4) * Math.PI * 2;
                put(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), c2, Math.cos(a) * 0.7, 1.15, Math.sin(a) * 0.7, Math.sin(a) * 1.2, -Math.cos(a) * 1.2);
              }
              break;
            }
            case "tirmanma": {
              for (const x of [-2, 2]) for (const z of [-0.5, 0.5]) post(x, z, 2.1, c1);
              for (let k = 0; k < 9; k++) put(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), metal, -1.8 + k * 0.45, 2.05, 0, Math.PI / 2);
              for (const z of [-0.5, 0.5]) put(new THREE.CylinderGeometry(0.05, 0.05, 4.0, 8), c2, 0, 2.1, z, 0, Math.PI / 2);
              break;
            }
          }
          group.add(g);
        }
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
  group.userData.setFlood = (n) => {
    floodLens.emissiveIntensity = 3.2 * n;
    floodGlareMat.opacity = 0.75 * n;
  };
  group.userData.tick = (t) => {
    for (const fo of fountains) {
      fo.curtains.forEach((c, i) => { c.scale.set(1 + Math.sin(t * 3 + i) * 0.015, 1, 1 + Math.cos(t * 3 + i) * 0.015); c.material.opacity = 0.45 + 0.1 * Math.sin(t * 5); });
      fo.jet.scale.set(1, 0.9 + 0.12 * Math.sin(t * 4.3), 1);
      fo.arcs.forEach((a, i) => { a.scale.y = 0.94 + 0.06 * Math.sin(t * 3.7 + i); });
    }
  };
  return group;
}
