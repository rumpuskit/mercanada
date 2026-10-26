// Baş üstü adları: kamera yeterince yaklaşınca en yakındaki sakinlerin başında @kullanıcıadı görünür.
import * as THREE from "three";

const MAX_TAGS = 36;
const SHOW_WITHIN = 55; // metre (kamera hedefine uzaklık)

function makeTexture(text, selected) {
  const px = 40;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `700 ${px}px "Nunito", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 36, h = px + 22;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `700 ${px}px "Nunito", system-ui, sans-serif`;
  ctx.fillStyle = selected ? "rgba(224,96,122,0.95)" : "rgba(20,26,40,0.62)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

export class NameTags {
  constructor(scene) {
    this.group = new THREE.Group();
    this.sprites = [];
    for (let i = 0; i < MAX_TAGS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, depthWrite: false, transparent: true }));
      s.visible = false;
      s.renderOrder = 12;
      this.sprites.push(s);
      this.group.add(s);
    }
    this.cache = new Map();
    scene.add(this.group);
  }

  _texture(handle, selected) {
    const key = (selected ? "!" : "") + handle;
    let t = this.cache.get(key);
    if (!t) {
      if (this.cache.size > 300) {
        for (const [k, v] of this.cache) { v.tex.dispose(); this.cache.delete(k); if (this.cache.size < 200) break; }
      }
      t = makeTexture("@" + handle, selected);
      this.cache.set(key, t);
    } else {
      this.cache.delete(key);
      this.cache.set(key, t);
    }
    return t;
  }

  /** hide: omuz görünümünde izlenen sakinin kendi etiketi gösterilmez. */
  update(camera, target, people, residents, selected, hide = null) {
    const camDist = camera.position.distanceTo(target);
    for (const s of this.sprites) s.visible = false;
    if (camDist > SHOW_WITHIN) return;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const near = [];
    const P = people.positions;
    for (let i = 0; i < residents.length; i++) {
      if (!people.visible[i] || i === hide) continue;
      const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - cz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 70 * 70) near.push([d, i]);
    }
    near.sort((a, b) => a[0] - b[0]);
    if (selected != null && selected !== hide && people.visible[selected] && !near.slice(0, MAX_TAGS).some(([, i]) => i === selected)) near.unshift([0, selected]);
    const fade = Math.min(1, (SHOW_WITHIN - camDist) / 12);
    near.slice(0, MAX_TAGS).forEach(([d2, i], k) => {
      const s = this.sprites[k];
      const { tex, aspect } = this._texture(residents[i].handle, i === selected);
      if (s.material.map !== tex) {
        s.material.map = tex;
        s.material.needsUpdate = true;
      }
      s.material.opacity = fade;
      const d = Math.sqrt(d2);
      const h = Math.max(0.28, d * 0.022);
      s.scale.set(h * aspect, h, 1);
      s.position.set(P[i * 3], P[i * 3 + 1] + people.colors[i].height + 0.35 + h * 0.5, P[i * 3 + 2]);
      s.visible = true;
    });
  }
}
