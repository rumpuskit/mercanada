// Gökyüzü, güneş/ay ışığı ve gün-gece geçişi. Güneş Türkiye saatine göre doğar ve batar.
import * as THREE from "three";
import * as P from "./palette.js";

// Ekim sonu, UTC+3: güneş yaklaşık 07:45'te doğar, 18:15'te batar.
const SUNRISE = 465;
const SUNSET = 1095;

export function createSky(scene) {
  const uniforms = {
    top: { value: P.SKY.day.top.clone() },
    horizon: { value: P.SKY.day.horizon.clone() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    glow: { value: new THREE.Color("#fff1d6") },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(15000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 glow;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float sun = max(dot(vDir, sunDir), 0.0);
          col += glow * (pow(sun, 8.0) * 0.35 + pow(sun, 600.0) * 1.2);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight("#dff1ff", "#c9b99a", 1.4);
  const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
  sun.castShadow = true;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 1.2;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(P.SKY.day.horizon.clone(), 1600, 6000);

  const c1 = new THREE.Color(), c2 = new THREE.Color();
  return {
    dome, sun, hemi,
    /** Dakikaya göre ışıkları ayarlar; 0 (gece) - 1 (gündüz) arası aydınlık döner. */
    update(minute, focus) {
      const dayLen = SUNSET - SUNRISE;
      const t = (minute - SUNRISE) / dayLen; // 0 doğuş, 1 batış
      const elev = Math.sin(Math.PI * t) * 0.72; // radyan, öğlen ~41°
      const azim = Math.PI * (0.15 + 0.7 * t);
      const light = THREE.MathUtils.smoothstep(elev, -0.12, 0.18);
      const dusk = Math.exp(-(((elev - 0.02) / 0.12) ** 2)) * (t > -0.1 && t < 1.1 ? 1 : 0);

      const dir = new THREE.Vector3(Math.cos(azim), Math.max(Math.sin(elev), 0.08), Math.sin(azim) * 0.55 + 0.45).normalize();
      uniforms.sunDir.value.copy(dir);
      c1.copy(P.SKY.night.top).lerp(P.SKY.day.top, light).lerp(P.SKY.sunset.top, dusk * 0.6);
      c2.copy(P.SKY.night.horizon).lerp(P.SKY.day.horizon, light).lerp(P.SKY.sunset.horizon, dusk * 0.85);
      uniforms.top.value.copy(c1);
      uniforms.horizon.value.copy(c2);
      uniforms.glow.value.set(light > 0.05 ? "#fff1d6" : "#000000");
      scene.fog.color.copy(c2);

      // Gece ay ışığı: güneşin tersinden, soluk mavi.
      const moon = light < 0.05;
      const lightDir = moon ? new THREE.Vector3(-0.4, 0.8, 0.3).normalize() : dir;
      sun.position.copy(focus).addScaledVector(lightDir, 1000);
      sun.target.position.copy(focus);
      sun.color.set(moon ? "#9fb4ff" : "#fff4e0").lerp(new THREE.Color("#ffb37a"), moon ? 0 : dusk * 0.7);
      sun.intensity = moon ? 0.9 : 0.4 + 2.4 * light;
      hemi.intensity = 0.75 + 0.65 * light;
      hemi.color.set("#dff1ff").lerp(new THREE.Color("#8090cc"), 1 - light);
      hemi.groundColor.set("#c9b99a").lerp(new THREE.Color("#3a3f5e"), 1 - light);
      return light;
    },
  };
}
