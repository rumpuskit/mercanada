// Harita ve gezinme: mini harita (dokununca oraya gider), yer kısayolları, yakınlaştırma ve pusula.
const $ = (id) => document.getElementById(id);

export function createMapUI({ world, camera, controls, flyTo }) {
  const { x0, x1, z0, z1 } = world.bounds;
  const pad = 140;
  const wx0 = x0 - pad, wz0 = z0 - pad, ww = x1 - x0 + 2 * pad, wd = z1 - z0 + 2 * pad + 160;

  // Taban harita: kara, kumsal, yollar, binalar (bir kez çizilir).
  const base = document.createElement("canvas");
  const S = Math.min(1, 900 / Math.max(ww, wd)); // piksel / metre
  base.width = Math.ceil(ww * S);
  base.height = Math.ceil(wd * S);
  const b = base.getContext("2d");
  b.fillStyle = "#7cc3d6";
  b.fillRect(0, 0, base.width, base.height);
  const step = 4 / S;
  for (let z = wz0; z < wz0 + wd; z += step) {
    for (let x = wx0; x < wx0 + ww; x += step) {
      const h = world.rawHeight(x, z);
      if (h <= 0.1) continue;
      b.fillStyle = h < 1.15 && world.sdf(x, z) > world.margin(x, z) - 32 ? "#ead7a6" : h > 9 ? "#8db36b" : "#a5cf86";
      b.fillRect((x - wx0) * S, (z - wz0) * S, step * S + 0.6, step * S + 0.6);
    }
  }
  b.lineCap = "round";
  b.lineJoin = "round";
  for (const road of world.roads) {
    b.strokeStyle = road.carriage > 0 ? "#ffffff" : road.type === "patika" ? "#c9a878" : "#f4ead8";
    b.lineWidth = Math.max(1, road.width * S * (road.carriage > 0 ? 1.4 : 1));
    b.beginPath();
    road.points.forEach(([x, z], i) => (i ? b.lineTo : b.moveTo).call(b, (x - wx0) * S, (z - wz0) * S));
    b.stroke();
  }
  b.fillStyle = "#c98f7a";
  for (const bd of world.buildings) {
    b.save();
    b.translate((bd.x - wx0) * S, (bd.z - wz0) * S);
    b.rotate(-bd.rot);
    b.fillRect((-bd.w / 2) * S, (-bd.d / 2) * S, bd.w * S, bd.d * S);
    b.restore();
  }

  const canvas = $("minimap-canvas");
  const ctx = canvas.getContext("2d");
  const toWorld = (px, pz) => {
    const r = canvas.getBoundingClientRect();
    const view = fit();
    return [view.x + ((px - r.left) / r.width) * view.w, view.z + ((pz - r.top) / r.height) * view.h];
  };
  // Haritada gösterilen alan: tüm ada (canvas oranına göre).
  function fit() {
    const ar = canvas.width / canvas.height;
    let w = ww, h = wd;
    if (w / h > ar) h = w / ar; else w = h * ar;
    return { x: wx0 + ww / 2 - w / 2, z: wz0 + wd / 2 - h / 2, w, h };
  }

  function draw() {
    const dpr = Math.min(2, devicePixelRatio);
    const r = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(r.width * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    const view = fit();
    const k = canvas.width / view.w;
    ctx.fillStyle = "#7cc3d6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, (wx0 - view.x) * k, (wz0 - view.z) * k, ww * k, wd * k);
    // Kameranın baktığı yer ve yönü.
    const t = controls.target;
    const px = (t.x - view.x) * k, pz = (t.z - view.z) * k;
    const dir = Math.atan2(t.x - camera.position.x, t.z - camera.position.z);
    const dist = camera.position.distanceTo(t);
    const span = Math.max(10, dist * 0.9) * k;
    ctx.fillStyle = "rgba(224,96,122,0.25)";
    ctx.strokeStyle = "rgba(224,96,122,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - Math.sin(dir) * span * 0.6, pz - Math.cos(dir) * span * 0.6);
    ctx.lineTo(px + Math.sin(dir + 0.6) * span, pz + Math.cos(dir + 0.6) * span);
    ctx.lineTo(px + Math.sin(dir - 0.6) * span, pz + Math.cos(dir - 0.6) * span);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, pz, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#e0607a";
    ctx.fill();
  }

  canvas.addEventListener("click", (e) => {
    const [x, z] = toWorld(e.clientX, e.clientY);
    flyTo(x, Math.max(0, world.height(x, z)), z, Math.max(120, camera.position.distanceTo(controls.target)));
  });
  $("minimap-toggle").addEventListener("click", () => $("minimap").classList.toggle("open"));

  // Yer kısayolları (yalnızca adada açılmış olanlar).
  const prom = world.promenade, park = world.plazas.find((q) => q.kind === "park"), tarla = world.workplaces.tarla?.find(Boolean);
  const places = [
    ["Meydan", 0, 0, 90],
    ["İskele", 0, world.coastPoint(0, 60, 0, 1)[1] + 10, 110],
    prom && ["Sahil", ...prom[Math.floor(prom.length / 2)], 90],
    park && ["Park", (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 120],
    ["Plaj", ...world.places.plaj.anchors[4], 110],
    ["Tepe", ...world.places.tepe.anchors[0], 120],
    ["Fener", world.fener.x, world.fener.z, 90],
    tarla && ["Tarlalar", ...tarla.anchor, 160],
    ...world.labels.filter((l) => /Mahallesi$/.test(l.text)).map((l) => [l.text.replace(" Mahallesi", ""), l.x, l.z, 220]),
  ].filter(Boolean);
  const chips = $("places");
  chips.replaceChildren(...places.map(([name, x, z, d]) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.addEventListener("click", () => flyTo(x, Math.max(0, world.height(x, z)), z, d));
    return btn;
  }));

  // Yakınlaştırma ve pusula.
  const zoom = (f) => {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    const len = off.length();
    if (len < controls.minDistance || len > controls.maxDistance) return;
    flyTo(controls.target.x, controls.target.y, controls.target.z, len, off);
  };
  $("zoom-in").addEventListener("click", () => zoom(0.6));
  $("zoom-out").addEventListener("click", () => zoom(1.6));
  $("compass").addEventListener("click", () => {
    const off = camera.position.clone().sub(controls.target);
    const flat = Math.hypot(off.x, off.z);
    off.set(0, off.y, flat); // kuzey yukarıda: kamera güneyden bakar
    flyTo(controls.target.x, controls.target.y, controls.target.z, off.length(), off);
  });

  let last = 0;
  return {
    update(now) {
      const needle = $("compass-needle");
      const dir = Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z);
      needle.style.transform = `rotate(${Math.PI - dir}rad)`;
      if (now - last < 0.12) return;
      last = now;
      if (canvas.offsetWidth > 0) draw();
    },
  };
}
