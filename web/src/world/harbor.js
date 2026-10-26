// Liman yapıları: tahta iskeleler (döşeme, kazık, korkuluk, baba, fener direği), vapur ve tekneler.
// Tekneler ve vapur dalgayla hafifçe sallanır.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

const box = (w, h, d, x, y, z, color) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const cyl = (r0, r1, h, x, y, z, color, seg = 8) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), color);

function merged(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });

/** Tahta iskele: x merkez, z başlangıç (kıyı), +z yönünde len metre, w genişlik, döşeme üstü top. */
function pier(f, top) {
  const parts = [];
  const plank = 0.28, gap = 0.04;
  const woods = ["#a77e57", "#9b7350", "#b08760", "#8f6a49"];
  for (let z = 0; z < f.len; z += plank + gap) {
    parts.push(box(f.w, 0.08, plank, f.x, top - 0.04, f.z + z + plank / 2, woods[Math.floor(z * 7.3) % 4]));
  }
  // Kenar kirişleri ve kazıklar.
  for (const side of [-1, 1]) {
    parts.push(box(0.22, 0.32, f.len, f.x + side * (f.w / 2 - 0.11), top - 0.24, f.z + f.len / 2, "#7a5a3e"));
    for (let z = 1; z < f.len; z += 4) parts.push(cyl(0.16, 0.18, top + 4, f.x + side * (f.w / 2 - 0.2), (top - 4) / 2, f.z + z, "#5e4532", 7));
  }
  // Kirişler (enine).
  for (let z = 1; z < f.len; z += 4) parts.push(box(f.w, 0.18, 0.2, f.x, top - 0.21, f.z + z, "#6e5038"));
  const wood = merged(parts);
  const metal = [];
  if (f.w > 5) {
    // Büyük iskele: korkuluk, babalar ve fener direkleri.
    for (const side of [-1, 1]) {
      const x = f.x + side * (f.w / 2 - 0.08);
      for (let z = 2; z < f.len - 1; z += 2.5) metal.push(cyl(0.035, 0.035, 1.05, x, top + 0.52, f.z + z, "#2f3540", 6));
      metal.push(box(0.06, 0.05, f.len - 3, x, top + 1.05, f.z + f.len / 2 + 0.5, "#2f3540"));
      metal.push(box(0.04, 0.04, f.len - 3, x, top + 0.6, f.z + f.len / 2 + 0.5, "#2f3540"));
      for (let z = 6; z < f.len; z += 12) {
        metal.push(cyl(0.16, 0.2, 0.45, f.x + side * (f.w / 2 - 0.6), top + 0.22, f.z + z, "#25282e", 10));
        metal.push(cyl(0.24, 0.24, 0.08, f.x + side * (f.w / 2 - 0.6), top + 0.48, f.z + z, "#25282e", 10));
      }
      for (let z = 10; z < f.len; z += 20) {
        metal.push(cyl(0.06, 0.09, 3.4, f.x + side * (f.w / 2 - 0.6), top + 1.7, f.z + z, "#2f3540", 8));
        metal.push(colored(new THREE.CylinderGeometry(0.18, 0.13, 0.4, 6).translate(f.x + side * (f.w / 2 - 0.6), top + 3.6, f.z + z), "#fff3c4"));
      }
    }
  } else {
    // Balıkçı iskelesi: tek yanda basit tahta korkuluk.
    for (let z = 2; z < f.len; z += 3) parts.push(box(0.08, 0.9, 0.08, f.x - f.w / 2 + 0.05, top + 0.45, f.z + z, "#6e5038"));
  }
  const group = new THREE.Group();
  const w = new THREE.Mesh(wood, MAT);
  w.castShadow = w.receiveShadow = true;
  group.add(w);
  if (metal.length) {
    const m = new THREE.Mesh(merged(metal), METAL);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

/** Şehir hatları vapuru (50 m): siyah gövde, beyaz iki katlı üst yapı, pencere sıraları, baca, can simitleri. */
function ferry() {
  const parts = [];
  // Gövde: pruva ve kıçta daralan.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-5.5, -24); hullShape.lineTo(5.5, -24); hullShape.lineTo(5.6, 18); hullShape.quadraticCurveTo(5, 24, 0, 26);
  hullShape.quadraticCurveTo(-5, 24, -5.6, 18); hullShape.lineTo(-5.5, -24);
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 3.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.6, 0);
  parts.push(colored(hull, "#1f2226"));
  const deckShape = new THREE.Shape(hullShape.getPoints(24));
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 1.6, 0), "#f4f4f1"));
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 0.35, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 1.25, 0), "#b8312f"));
  // Üst yapı: iki kat.
  parts.push(box(9.4, 2.6, 34, 0, 4.5, -1, "#f6f6f3"));
  parts.push(box(8.2, 2.3, 18, 0, 7.0, 0, "#f6f6f3"));
  parts.push(box(9.6, 0.15, 35, 0, 5.85, -1, "#d9dde2"));
  parts.push(box(8.4, 0.15, 19, 0, 8.2, 0, "#d9dde2"));
  // Pencere sıraları (iki yan) ve kaptan köşkü camları.
  for (const side of [-1, 1]) {
    for (let z = -16; z <= 14; z += 2.2) parts.push(box(0.05, 1.0, 1.6, side * 4.71, 4.7, z, "#28323e"));
    for (let z = -7.5; z <= 7.5; z += 2.2) parts.push(box(0.05, 0.9, 1.6, side * 4.11, 7.2, z, "#28323e"));
  }
  parts.push(box(7.6, 0.9, 0.05, 0, 7.3, 9.02, "#28323e"));
  // Baca ve direk.
  parts.push(cyl(1.15, 1.3, 4.2, 0, 10.2, -3, "#f2f2ef", 14));
  parts.push(cyl(1.17, 1.17, 0.9, 0, 11.6, -3, "#1f2226", 14));
  parts.push(cyl(1.17, 1.17, 0.35, 0, 10.9, -3, "#e8b93a", 14));
  parts.push(cyl(0.08, 0.1, 6, 0, 11.2, 7, "#2f3540", 6));
  // Can simitleri.
  for (const side of [-1, 1]) for (const z of [-10, 0, 10]) parts.push(colored(new THREE.TorusGeometry(0.38, 0.1, 6, 12).rotateY(Math.PI / 2).translate(side * 4.75, 4.2, z + 1.1), "#f07a2a"));
  // Korkuluk (ana güverte, açık kısımlar).
  for (const side of [-1, 1]) parts.push(box(0.05, 0.05, 48, side * 5.45, 4.25, 0, "#c9ced4"));
  const g = new THREE.Mesh(merged(parts), MAT);
  g.castShadow = g.receiveShadow = true;
  return g;
}

/** Ahşap balıkçı teknesi: sivri pruva, kamara, direk. len metre. */
function boat(len, light) {
  const W = len * 0.34;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -len / 2); shape.lineTo(W / 2, -len / 2);
  shape.quadraticCurveTo(W / 2 + 0.1, len * 0.15, 0, len / 2);
  shape.quadraticCurveTo(-W / 2 - 0.1, len * 0.15, -W / 2, -len / 2);
  const parts = [
    colored(new THREE.ExtrudeGeometry(shape, { depth: len * 0.13, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -len * 0.05, 0), light ? "#f4f1ea" : "#2f5d8a"),
    colored(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, len * 0.07, 0), "#a77e57"),
    box(W * 0.62, len * 0.14, len * 0.24, 0, len * 0.15, -len * 0.12, light ? "#2f5d8a" : "#f4f1ea"),
    box(W * 0.64, 0.05, len * 0.06, 0, len * 0.16, len * 0.0 - 0.02, "#28323e"),
    cyl(0.04, 0.05, len * 0.5, 0, len * 0.32, len * 0.12, "#6e5038", 5),
    box(W + 0.05, 0.12, len * 0.92, 0, len * 0.065, -len * 0.02, light ? "#2f5d8a" : "#f4f1ea"),
  ];
  const g = new THREE.Mesh(merged(parts), MAT);
  g.castShadow = g.receiveShadow = true;
  return g;
}

export function buildHarbor(world) {
  const group = new THREE.Group();
  const floating = [];
  for (const f of world.features) {
    if (f.type === "iskele") group.add(pier(f, 1.53));
    else if (f.type === "vapur") {
      const m = ferry();
      m.position.set(f.x, 0.2, f.z);
      group.add(m);
      floating.push({ obj: m, base: 0.2, amp: 0.06, roll: 0.006, ph: 0.3 });
      // İskele köprüsü (vapurdan iskeleye).
      const plank = new THREE.Mesh(merged([box(2.2, 0.12, 4.2, 0, 0, 0, "#9aa1a8"), box(0.05, 0.9, 4.2, -1.08, 0.45, 0, "#2f3540"), box(0.05, 0.9, 4.2, 1.08, 0.45, 0, "#2f3540")]), METAL);
      plank.position.set(f.x - 7.2, 1.7, f.z - 4);
      plank.rotation.y = Math.PI / 2;
      group.add(plank);
    } else if (f.type === "tekne") {
      const len = f.len ?? 8;
      const m = boat(len, len < 10);
      m.position.set(f.x, 0.15, f.z);
      m.rotation.y = f.rot ?? 0;
      group.add(m);
      floating.push({ obj: m, base: 0.15, amp: 0.08 + 0.02 * (10 - Math.min(10, len)), roll: 0.04, ph: f.x * 0.13 + f.z * 0.07, rot: f.rot ?? 0 });
    }
  }
  group.userData.tick = (t) => {
    for (const b of floating) {
      b.obj.position.y = b.base + Math.sin(t * 0.9 + b.ph) * b.amp;
      b.obj.rotation.z = Math.sin(t * 0.7 + b.ph * 1.7) * b.roll;
      b.obj.rotation.x = Math.sin(t * 0.55 + b.ph) * b.roll * 0.5;
    }
  };
  return group;
}
