// Yaya rotaları: yol ağı (world.network) üzerinde en kısa yol. Meydanın dört girişi, çeşmenin
// çevresinden dolanan yaya bağlantılarıyla birbirine bağlanır.
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function polyLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Çoklu çizginin a'dan b'ye (uzaklık olarak) parçası; a > b ise ters yönde. */
function slice(pts, cum, a, b) {
  const at = (d) => {
    let j = 1;
    while (j < cum.length - 1 && cum[j] < d) j++;
    const u = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u];
  };
  const out = [at(a)];
  if (a < b) { for (let j = 0; j < cum.length; j++) if (cum[j] > a && cum[j] < b) out.push(pts[j]); }
  else { for (let j = cum.length - 1; j >= 0; j--) if (cum[j] < a && cum[j] > b) out.push(pts[j]); }
  out.push(at(b));
  return out;
}

export class Navigator {
  constructor(world) {
    this.world = world;
    const net = world.network;
    this.nodes = net.nodes;
    this.nodes.forEach((n, i) => { n.id = i; });
    this.edges = net.edges.map((e) => {
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + dist(e.pts[i - 1], e.pts[i]));
      return { a: e.a.id, b: e.b.id, pts: e.pts, cum, len: cum[cum.length - 1], road: e.road };
    });
    // Meydan girişleri arasında çeşmeyi dolanan bağlantılar.
    const plaza = world.plazas.find((p) => p.r);
    if (plaza) {
      const gates = this.nodes.filter((n) => Math.abs(dist(n.p, [plaza.x, plaza.z]) - plaza.r) < 2.5);
      for (let i = 0; i < gates.length; i++) {
        for (let j = i + 1; j < gates.length; j++) {
          const a0 = Math.atan2(gates[i].p[1] - plaza.z, gates[i].p[0] - plaza.x);
          let da = Math.atan2(gates[j].p[1] - plaza.z, gates[j].p[0] - plaza.x) - a0;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          const r = 11.5, steps = Math.max(2, Math.ceil(Math.abs(da) / 0.2));
          const pts = [gates[i].p];
          for (let k = 0; k <= steps; k++) pts.push([plaza.x + Math.cos(a0 + (da * k) / steps) * r, plaza.z + Math.sin(a0 + (da * k) / steps) * r]);
          pts.push(gates[j].p);
          const cum = [0];
          for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + dist(pts[k - 1], pts[k]));
          this.edges.push({ a: gates[i].id, b: gates[j].id, pts, cum, len: cum[cum.length - 1], road: null });
        }
      }
      this.plazaGates = gates;
      this.plaza = plaza;
    }
    this.adj = this.nodes.map(() => []);
    this.edges.forEach((e, k) => {
      this.adj[e.a].push(k);
      this.adj[e.b].push(k);
    });
    // Kenar parçaları için ızgara (bir noktanın hangi kenarda olduğunu bulmak için).
    this.grid = new Map();
    this.edges.forEach((e, k) => {
      if (!e.road) return;
      for (let i = 1; i < e.pts.length; i++) {
        const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i];
        for (let gx = Math.floor((Math.min(ax, bx) - 3) / 30); gx <= Math.floor((Math.max(ax, bx) + 3) / 30); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - 3) / 30); gz <= Math.floor((Math.max(az, bz) + 3) / 30); gz++) {
            const key = gx * 100003 + gz;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push([k, i]);
          }
        }
      }
    });
    this.cache = new Map();
  }

  /** Noktaya en yakın kenar ve kenar boyunca uzaklık (3 m içinde); yoksa null. */
  locate(p) {
    let best = null;
    for (const [k, i] of this.grid.get(Math.floor(p[0] / 30) * 100003 + Math.floor(p[1] / 30)) ?? []) {
      const e = this.edges[k];
      const a = e.pts[i - 1], b = e.pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
      const d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
      if (d < 3 && (!best || d < best.d)) best = { edge: k, along: e.cum[i - 1] + Math.sqrt(l2) * t, d };
    }
    return best;
  }

  _dijkstra(src) {
    const cached = this.cache.get(src);
    if (cached) return cached;
    const n = this.nodes.length;
    const D = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), via = new Int32Array(n).fill(-1);
    D[src] = 0;
    const heap = [[0, src]];
    while (heap.length) {
      // Küçük ağ: basit ikili yığın.
      let m = 0;
      for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[m][0]) m = i;
      const [d, u] = heap[m];
      heap[m] = heap[heap.length - 1];
      heap.pop();
      if (d > D[u]) continue;
      for (const k of this.adj[u]) {
        const e = this.edges[k];
        const v = e.a === u ? e.b : e.a;
        // Taşıt yolu boyunca yürümek biraz daha "pahalı": yayalar yaya yollarını tercih eder.
        const w = e.len * (e.road && e.road.carriage > 0 ? 1.08 : 1);
        if (d + w < D[v]) {
          D[v] = d + w; prev[v] = u; via[v] = k;
          heap.push([D[v], v]);
        }
      }
    }
    const res = { D, prev, via };
    if (this.cache.size > 400) this.cache.clear();
    this.cache.set(src, res);
    return res;
  }

  /** A'dan B'ye yol ağı üzerinden yürüyüş çizgisi (A ve B yol üstünde ya da 3 m yakınında). */
  route(A, B) {
    const la = this.locate(A), lb = this.locate(B);
    if (!la || !lb) return [A, B];
    const ea = this.edges[la.edge], eb = this.edges[lb.edge];
    if (la.edge === lb.edge) return slice(ea.pts, ea.cum, la.along, lb.along);
    let best = null;
    for (const [na, ca] of [[ea.a, la.along], [ea.b, ea.len - la.along]]) {
      const { D } = this._dijkstra(na);
      for (const [nb, cb] of [[eb.a, lb.along], [eb.b, eb.len - lb.along]]) {
        const total = ca + D[nb] + cb;
        if (!best || total < best.total) best = { total, na, nb };
      }
    }
    if (!best || !Number.isFinite(best.total)) return [A, B];
    const { prev, via } = this._dijkstra(best.na);
    const chain = [];
    for (let v = best.nb; v !== best.na; v = prev[v]) chain.push([via[v], v]);
    chain.reverse();
    const out = slice(ea.pts, ea.cum, la.along, best.na === ea.a ? 0 : ea.len);
    let at = best.na;
    for (const [k, v] of chain) {
      const e = this.edges[k];
      const seg = e.a === at ? e.pts : [...e.pts].reverse();
      out.push(...seg.slice(1));
      at = v;
    }
    out.push(...slice(eb.pts, eb.cum, best.nb === eb.a ? 0 : eb.len, lb.along).slice(1));
    return out;
  }
}

export { polyLength };
