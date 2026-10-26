// Sokak lambalarının ışığı: ayrı bir yüzey (ve dolayısıyla titreşen üst üste binme) yerine, lambaların
// yukarıdan görünen ışık haritası zemin malzemelerinin gölgelendiricisine eklenir. Gece açılır.
import * as THREE from "three";

export function createLampLight(world, spots, materials, { wallMaterials = [] } = {}) {
  const pad = 60;
  const x0 = world.bounds.x0 - pad, z0 = world.bounds.z0 - pad;
  const w = world.bounds.x1 - world.bounds.x0 + 2 * pad, d = world.bounds.z1 - world.bounds.z0 + 2 * pad + 300;
  const scale = Math.min(1, 2048 / Math.max(w, d)); // piksel / metre
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(d * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";
  for (const s of spots) {
    // Işık armatürün altına, yola doğru düşer.
    const ox = s.deco ? 0 : Math.sin(s.dir) * 1.3, oz = s.deco ? 0 : Math.cos(s.dir) * 1.3;
    const px = (s.x + ox - x0) * scale, pz = (s.z + oz - z0) * scale;
    const r = (s.deco ? 7 : 11) * scale;
    const g = ctx.createRadialGradient(px, pz, 0, px, pz, r);
    g.addColorStop(0, "rgba(255,206,140,0.95)");
    g.addColorStop(0.45, "rgba(255,190,120,0.45)");
    g.addColorStop(1, "rgba(255,180,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, pz, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false; // tuval satırı 0 = z0

  const uniforms = {
    lampMap: { value: tex },
    lampRect: { value: new THREE.Vector4(x0, z0, w, d) },
    lampNight: { value: 0 },
    lampFloor: { value: world.flatY },
  };
  const patch = (material, wall) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLampWorld;")
        .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 lampWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lampWp = instanceMatrix * lampWp;
        #endif
        vLampWorld = (modelMatrix * lampWp).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
        varying vec3 vLampWorld;
        uniform sampler2D lampMap;
        uniform vec4 lampRect;
        uniform float lampNight;
        uniform float lampFloor;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        vec3 lampLight = texture2D(lampMap, (vLampWorld.xz - lampRect.xy) / lampRect.zw).rgb;
        float lampFall = ${wall ? "clamp(1.0 - (vLampWorld.y - lampFloor) / 7.0, 0.0, 1.0)" : "1.0"};
        totalEmissiveRadiance += lampLight * lampNight * lampFall * diffuseColor.rgb * ${wall ? "0.9" : "1.5"};`);
    };
    material.needsUpdate = true;
  };
  for (const m of materials) patch(m, false);
  for (const m of wallMaterials) patch(m, true);
  return {
    setNight(n) {
      uniforms.lampNight.value = n;
    },
  };
}
