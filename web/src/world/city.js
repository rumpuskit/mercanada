// Binalar, pencereler, sokak lambaları ve özel parçalar (çeşme, iskele, vapur, fener...).
// Aynı biçimdeki her şey tek bir InstancedMesh ile çizilir; telefonda da akıcı kalsın diye.
import * as THREE from "three";
import { FLAT_Y, FLOOR_H } from "./layout.js";
import * as P from "./palette.js";

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

/** Bina koordinatından dünya koordinatına: yerel (lx, ly, lz), bina merkezine ve dönüşüne göre. */
function local(b, lx, ly, lz) {
  const c = Math.cos(b.rot), sn = Math.sin(b.rot);
  return v.set(b.x + lx * c + lz * sn, FLAT_Y + ly, b.z - lx * sn + lz * c);
}

/** Üst üste eklenen kutular için küçük yardımcı: sonunda tek InstancedMesh üretir. */
class Batch {
  constructor(geometry, material, { shadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
    this.shadow = shadow;
  }

  add(pos, rot, scale, color) {
    q.setFromAxisAngle(UP, rot);
    this.items.push({ m: new THREE.Matrix4().compose(pos.clone(), q.clone(), scale.clone()), color: color && new THREE.Color(color) });
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
    return mesh;
  }
}

function prismGeometry() {
  // Tabanı 1x1, yüksekliği 1 olan üçgen çatı; mahya x ekseni boyunca.
  const g = new THREE.BufferGeometry();
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, // ön eğim
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, // arka eğim
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, // sol üçgen
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, // sağ üçgen
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

export function buildCity(world) {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const walls = new Batch(box, std(0xffffff));
  const roofs = new Batch(prismGeometry(), std(0xffffff, { flatShading: true }));
  const slabs = new Batch(box, std(0xffffff));
  const doors = new Batch(box, std(0x8a6a5a), { shadow: false });
  const trims = new Batch(box, std(0xffffff), { shadow: false });
  const windowGeo = new THREE.PlaneGeometry(1, 1);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const windows = new Batch(windowGeo, windowMat, { shadow: false });
  const windowOwners = []; // pencere -> {slot} (konut) veya {workplace: true}

  for (const b of world.buildings) {
    const h = b.floors * FLOOR_H;
    walls.add(local(b, 0, 0, 0), b.rot, s.set(b.w, h, b.d), b.wall);
    if (b.roofType === "gable") {
      roofs.add(local(b, 0, h, 0), b.rot, s.set(b.w + 1.2, Math.min(4.5, b.d * 0.42), b.d + 1.4), b.roof);
    } else {
      slabs.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.6, 0.7, b.d + 0.6), b.roof);
    }
    doors.add(local(b, 0, 0, b.d / 2), b.rot, s.set(1.8, 2.5, 0.3));

    // Pencereler: konutta her daire için önde ve arkada birer pencere.
    const perFloor = b.daireler ? Math.ceil(b.daireler / b.floors) : Math.max(2, Math.round(b.w / 4));
    const total = b.daireler ?? perFloor * b.floors;
    for (let k = 0; k < total; k++) {
      const floor = Math.floor(k / perFloor), col = k % perFloor;
      if (floor === 0 && b.daireler == null && Math.abs((col + 0.5) / perFloor - 0.5) < 0.2) continue;
      const lx = -b.w / 2 + (col + 0.5) * (b.w / perFloor);
      const ly = floor * FLOOR_H + (floor === 0 && b.daireler ? 1.1 : 1.6) + 0.1;
      const owner = b.daireler ? { slot: b.slot0 + k } : { workplace: b.kind, seed: k };
      for (const side of [1, -1]) {
        const doorClash = side === 1 && floor === 0 && Math.abs(lx) < 1.6;
        const x = doorClash ? lx + (lx >= 0 ? 1.8 : -1.8) : lx;
        windows.add(local(b, x, ly + 0.8, side * (b.d / 2 + 0.06)), b.rot + (side === 1 ? 0 : Math.PI), s.set(1.5, 1.6, 1), P.WINDOW_DAY);
        windowOwners.push(owner);
      }
    }

    const st = b.style;
    if (st?.awning) trims.add(local(b, 0, 3.0, b.d / 2 + 1.1), b.rot, s.set(b.w * 0.8, 0.4, 2.2), st.awning);
    if (st?.tower) {
      walls.add(local(b, 0, h, 0), b.rot, s.set(4.5, 9, 4.5), b.wall);
      roofs.add(local(b, 0, h + 9, 0), b.rot, s.set(5.2, 3.5, 5.2), b.roof);
      trims.add(local(b, 0, h + 5.5, 2.3), b.rot, s.set(2.6, 2.6, 0.2), "#fbf8f4");
    }
    if (st?.columns) for (let i = 0; i < 4; i++) trims.add(local(b, -6 + i * 4, 0, b.d / 2 + 1.2), b.rot, s.set(0.9, h - 0.2, 0.9), "#fbf8f4");
    if (st?.sign) {
      trims.add(local(b, 0, h - 2.2, b.d / 2 + 0.1), b.rot, s.set(3, 0.9, 0.2), st.sign);
      trims.add(local(b, 0, h - 3.25, b.d / 2 + 0.1), b.rot, s.set(0.9, 3, 0.2), st.sign);
    }
  }

  // Sokak lambaları: caddeler boyunca.
  const lampPoles = new Batch(new THREE.CylinderGeometry(0.18, 0.22, 1, 6).translate(0, 0.5, 0), std("#5b6370"), { shadow: false });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lampHeads = new Batch(new THREE.SphereGeometry(0.55, 8, 6), lampMat, { shadow: false });
  for (const road of world.roads) {
    if (road.width < 8) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 10; t < len - 4; t += 26) {
        const x = ax + ux * t - uz * (road.width / 2 + 1), z = az + uz * t + ux * (road.width / 2 + 1);
        if (world.isLand(x, z)) {
          const y = world.height(x, z);
          lampPoles.add(v.set(x, y, z), 0, s.set(1, 6, 1));
          lampHeads.add(v.set(x, y + 6.2, z), 0, s.set(1, 1, 1), "#cfd6de");
        }
      }
    }
  }

  const meshes = { walls: walls.build(), roofs: roofs.build(), slabs: slabs.build(), doors: doors.build(), trims: trims.build(), windows: windows.build(), lampPoles: lampPoles.build(), lampHeads: lampHeads.build() };
  for (const mesh of Object.values(meshes)) group.add(mesh);
  group.add(buildFeatures(world));
  return { group, windows: meshes.windows, windowOwners, lampHeads: meshes.lampHeads };
}

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
  const waterMat = new THREE.MeshStandardMaterial({ color: "#7fd3e6", roughness: 0.1 });
  const wood = std("#b98f6a");
  const white = std("#fbf8f4");
  const fenerLamps = [];

  for (const f of world.features) {
    switch (f.type) {
      case "cesme": {
        add(new THREE.CylinderGeometry(7, 7.5, 1.2, 20), std("#e8ddd0"), f.x, FLAT_Y + 0.6, f.z);
        add(new THREE.CylinderGeometry(6.3, 6.3, 0.2, 20), waterMat, f.x, FLAT_Y + 1.15, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.8, 1.1, 4, 10), std("#e8ddd0"), f.x, FLAT_Y + 2.2, f.z);
        add(new THREE.CylinderGeometry(2.4, 1.2, 0.8, 14), std("#e8ddd0"), f.x, FLAT_Y + 4.2, f.z);
        break;
      }
      case "gol":
        add(new THREE.CircleGeometry(f.r, 24).rotateX(-Math.PI / 2), waterMat, f.x, FLAT_Y + 0.12, f.z, 0, false);
        break;
      case "havuz":
        add(new THREE.BoxGeometry(f.w + 2, 0.5, f.d + 2), white, f.x, FLAT_Y + 0.25, f.z);
        add(new THREE.BoxGeometry(f.w, 0.2, f.d), waterMat, f.x, FLAT_Y + 0.45, f.z, 0, false);
        break;
      case "tezgah":
        add(new THREE.BoxGeometry(8, 2, 4), wood, f.x, FLAT_Y + 1, f.z);
        add(new THREE.BoxGeometry(9.5, 0.4, 5.5), std(f.c), f.x, FLAT_Y + 4, f.z);
        for (const dx of [-4, 4]) add(new THREE.BoxGeometry(0.3, 4, 0.3), wood, f.x + dx, FLAT_Y + 2, f.z + 2.4, 0, false);
        break;
      case "iskele": {
        add(new THREE.BoxGeometry(f.w, 0.6, f.len), wood, f.x, 1.3, f.z + f.len / 2);
        for (let t = 4; t < f.len; t += 8) for (const dx of [-f.w / 2 + 0.4, f.w / 2 - 0.4]) add(new THREE.CylinderGeometry(0.35, 0.35, 5, 6), std("#8a6a5a"), f.x + dx, -1.4, f.z + t, 0, false);
        break;
      }
      case "vapur": {
        const hull = add(new THREE.BoxGeometry(10, 3, 30), white, f.x, 1.2, f.z);
        add(new THREE.BoxGeometry(10.2, 0.8, 30.2), std("#e05a5a"), f.x, 0.4, f.z, 0, false);
        add(new THREE.BoxGeometry(8, 3, 14), std("#eef3f7"), f.x, 4.2, f.z + 2);
        add(new THREE.CylinderGeometry(1.3, 1.5, 4, 10), std("#f2c14e"), f.x, 7.5, f.z - 2);
        hull.userData.bob = 0.3;
        break;
      }
      case "tekne": {
        const sc = f.big ? 1.6 : 1;
        add(new THREE.BoxGeometry(4 * sc, 1.6 * sc, 10 * sc), std(f.big ? "#4a7fd1" : "#fbf8f4"), f.x, 0.5, f.z, f.rot);
        add(new THREE.BoxGeometry(3 * sc, 2 * sc, 3 * sc), std(f.big ? "#fbf8f4" : "#4a7fd1"), f.x, 2 * sc, f.z, f.rot);
        break;
      }
      case "vinc": {
        add(new THREE.BoxGeometry(1.4, 22, 1.4), std("#f2c14e"), f.x, FLAT_Y + 11, f.z);
        add(new THREE.BoxGeometry(18, 1.2, 1.2), std("#f2c14e"), f.x - 6, FLAT_Y + 21.5, f.z);
        break;
      }
      case "fener": {
        const y0 = world.height(f.x, f.z);
        add(new THREE.CylinderGeometry(3.2, 3.6, 2, 12), white, f.x, y0 + 1, f.z);
        for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(2.6 - i * 0.25, 2.85 - i * 0.25, 4, 12), std(i % 2 ? "#e05a5a" : "#fbf8f4"), f.x, y0 + 4 + i * 4, f.z);
        const lamp = add(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 10), new THREE.MeshBasicMaterial({ color: "#fff3c4", toneMapped: false }), f.x, y0 + 19.2, f.z, 0, false);
        add(new THREE.ConeGeometry(2.4, 2.4, 10), std("#e05a5a"), f.x, y0 + 21.6, f.z);
        fenerLamps.push(lamp);
        break;
      }
      case "semsiye": {
        const y0 = Math.max(world.height(f.x, f.z), 0.4);
        add(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 5), white, f.x, y0 + 2.2, f.z, 0, false);
        add(new THREE.ConeGeometry(3.2, 1.4, 8), std(f.c), f.x, y0 + 4.6, f.z);
        add(new THREE.BoxGeometry(2, 0.3, 4), std("#fbf8f4"), f.x + 2.5, y0 + 0.3, f.z + 1, 0.3, false);
        break;
      }
    }
  }
  group.userData.fenerLamps = fenerLamps;
  return group;
}
