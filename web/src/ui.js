// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Kendini bul" araması, sakin kartı ve ev içi görünümü.
import * as sim from "./sim.js";
import { HOME_LABELS, homeActivity } from "./world/life.js";
import { TIKTOK, TIKTOK_URL, nextMove } from "./config.js";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const PLACE_NAMES = {
  meydan: "Meydan", iskele: "Balık iskelesi", park: "Park", sahil_yolu: "Sahil yolu", plaj: "Plaj",
  tepe: "Tepe", fener: "Fener", kahvehane: "Kahvehane", pazar: "Pazar", saha: "Futbol sahası",
};
// Buluşma yerinde ne yapıyor (yer anahtarına göre).
const OUT_LABELS = {
  meydan: "Meydanda, arkadaşlarıyla", park: "Parkta geziniyor", sahil_yolu: "Sahil yolunda yürüyüşte",
  kahvehane: "Kahvehanede", pazar: "Pazarda alışverişte", saha: "Futbol sahasında",
};

const fmt = new Intl.NumberFormat("tr-TR");
const $ = (id) => document.getElementById(id);
// Sakinin görünen adı: adını gizlemek isteyenler "Gizli komşu" olarak görünür.
export const at = (r) => (r.hidden ? "Gizli komşu" : "@" + r.handle);

export function createUI({ residents, people, world, dollhouse, stories, traffic, follow, setSpeed, flyTo, speed, today, minute, waiting = 0, listError = null }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  if (TIKTOK_URL) $("cta").href = TIKTOK_URL;
  else {
    // Hesap henüz açılmadı: bağlantı yok, yalnız haber.
    $("cta").removeAttribute("href");
    $("cta").textContent = "TikTok hesabımız çok yakında açılıyor";
  }
  // İskelede bekleyenler: takip etmiş, sıradaki taşınmayı bekleyenler. Dokununca iskeleye uçar.
  if (waiting > 0 && world.ferryPier) {
    const btn = $("waiting");
    btn.hidden = false;
    btn.textContent = `🧳 ${fmt.format(waiting)} kişi iskelede · taşınma ${nextMove()}`;
    btn.addEventListener("click", () => {
      const P0 = world.ferryPier;
      flyTo(0, P0.top, P0.z0 + 14, 45);
    });
  }
  // Sıradaki gelişim adımı: kaç sakin daha gelince ne açılacak; çubuk bir önceki adımdan bu yana ilerleme.
  // Dokununca yerine (şantiyeye) uçar.
  const ns = world.nextStage;
  if (ns) {
    const btn = $("next");
    const need = Math.max(1, ns.nufus - residents.length);
    const prev = Math.max(0, ...sim.cat().gelisim.map((g) => g.nufus).filter((n) => n < ns.nufus));
    btn.hidden = false;
    $("next-name").textContent = ns.name;
    $("next-need").textContent = waiting >= need ? `${nextMove()} taşınmasında` : `${fmt.format(need)} sakin daha`;
    // Adımın başında da çubuk görünsün (en az %4).
    $("next-bar").style.width = `${Math.round(Math.min(1, Math.max(0.04, (residents.length - prev) / (ns.nufus - prev))) * 100)}%`;
    if (ns.at) btn.addEventListener("click", () => flyTo(ns.at[0], world.groundY(ns.at[0], ns.at[1]), ns.at[1], 110));
  }
  let selected = null;
  let mode = null; // "sakin" | "bina" | "arac" | "yer"
  let vehicle = null; // seçili aracın kaydı
  let place = null; // içi açılmayan bina
  let tab = "simdi";
  for (const btn of document.querySelectorAll("#card-tabs button")) {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      for (const b of document.querySelectorAll("#card-tabs button")) b.classList.toggle("on", b === btn);
      render();
    });
  }

  for (const btn of document.querySelectorAll("#speed button")) {
    btn.classList.toggle("on", Number(btn.dataset.speed) === speed);
    btn.addEventListener("click", () => {
      setSpeed(Number(btn.dataset.speed));
      for (const b of document.querySelectorAll("#speed button")) b.classList.toggle("on", b === btn);
    });
  }

  function placeLabel(i, yer) {
    if (yer === "ev") return "Ev";
    if (yer === "is") return people.works[i].loc.name;
    if (yer.startsWith("mahalle:")) return "Mahallesinin çay bahçesi";
    return PLACE_NAMES[yer.replace("hobi:", "")] ?? yer;
  }

  /** Yolculuğun gerçek varış yeri: "meydan" planı saate göre farklı yerlere dağılır. */
  function destOf(i, seg) {
    if (seg.nereye !== "meydan") return seg.nereye;
    const k = people.plans[i].findIndex((q) => q.bas === seg.son);
    return k >= 0 ? people._placeOf(i, k) ?? "meydan" : "meydan";
  }

  function nowText(i) {
    const seg = people.activities[i];
    if (!seg) return "";
    switch (seg.ne) {
      case "uyku":
      case "ev": {
        const act = homeActivity(residents[i].seed, seg, minute(), today(), people.hobbies[i].id, people.homeWork?.[i]);
        return (seg.ne === "ev" ? "Evde · " : "") + HOME_LABELS[act];
      }
      case "is": {
        const j = people.works[i].job;
        if (j === "ogrenci") return "Anakarada, üniversitede";
        if (j === "anakara") return "Anakarada, işte";
        return `İşte · ${people.works[i].loc.name}`;
      }
      case "yol": {
        const d = destOf(i, seg);
        if (d === "is" && people.works[i].wp.kind === "anakara") return seg.nereden === "ev" ? "Vapura yetişmeye gidiyor" : "Vapurdan indi, eve dönüyor";
        return `Yolda → ${placeLabel(i, d)}`;
      }
      case "hobi": return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
      case "meydan": {
        const pl = people.currentPlace[i] ?? "meydan";
        return pl.startsWith("mahalle:") ? "Mahallesinin çay bahçesinde, komşularıyla" : OUT_LABELS[pl] ?? "Çarşıda, arkadaşlarıyla";
      }
      default: return seg.ne;
    }
  }

  function facts(rows) {
    $("card-facts").replaceChildren(...rows.flatMap(([k, v, onClick]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      if (onClick) { dd.classList.add("link"); dd.addEventListener("click", onClick); }
      return [dt, dd];
    }));
  }

  const link = (j) => [at(residents[j]), () => select(j)];

  function renderPerson() {
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    $("card-handle").textContent = at(r);
    icon(r.hidden ? "?" : r.handle[0].toLocaleUpperCase("tr"), `hsl(${r.seed % 360} 62% 58%)`);
    // İş yerinin adı yalnızca gerçek bir iş yeri varsa (emekli ve evden çalışanlarda yok).
    const wk = people.works[selected];
    $("card-title").textContent = wk.wp.kind === "ev" ? (wk.job === "emekli" ? "Emekli" : `${sim.title(r, day)} · evinden çalışıyor`) : `${sim.title(r, day)} · ${wk.loc.name}`;
    // Asıl mesleğinin iş yeri adada henüz yoksa: hangi yer açılınca ne olacağı.
    const dream = sim.dreamJob(r);
    $("card-dream").hidden = dream.id === wk.job;
    if (dream.id !== wk.job) {
      const opens = sim.cat().isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0];
      const t = dream.kademeler[Math.min(sim.rank(r, day), dream.kademeler.length - 1)];
      $("card-dream").textContent = `🏗️ ${opens[1]} açılınca ${t.toLocaleLowerCase("tr")} olacak (${fmt.format(opens[0])}. sakinde)`;
    }
    $("card-now").textContent = nowText(selected);
    $("card-tabs").hidden = false;
    $("card-traits").replaceChildren();
    const f = follow.get();
    followActions(f?.kind === "sakin" && f.i === selected ? f.view : null, { kind: "sakin", i: selected }, "👁 Gözünden bak");
    if (tab === "bugun") {
      const homeLabel = (k) => {
        const seg = people.plans[selected][k];
        const act = homeActivity(r.seed, seg, seg.bas + 1, day, people.hobbies[selected].id, people.homeWork?.[selected]);
        return "Evde · " + HOME_LABELS[act].toLocaleLowerCase("tr");
      };
      const placeName = (yer) => placeLabel(selected, yer);
      facts(stories.today(selected, placeName, homeLabel));
      return;
    }
    if (tab === "hikaye") {
      $("card-traits").replaceChildren(...stories.traits(selected).map((x) => {
        const span = document.createElement("span");
        span.textContent = x;
        return span;
      }));
      const rows = [];
      const f = stories.friend[selected];
      if (f >= 0) rows.push(["Can dostu", ...link(f)]);
      const pet = stories.petName(selected);
      if (pet) rows.push(["Evcil", `${pet.kind} · ${pet.name}`]);
      const nb = stories.neighbors(selected).slice(0, 3);
      nb.forEach((j, n) => rows.push([n === 0 ? "Komşular" : "", ...link(j)]));
      const cw = stories.coworkers(selected).slice(0, 3);
      cw.forEach((j, n) => rows.push([n === 0 ? "İş arkadaşları" : "", ...link(j)]));
      for (const e of stories.timeline(selected).slice(0, 8)) rows.push([e.date, e.text]);
      facts(rows);
      return;
    }
    const pet = sim.pet(r, day);
    facts([
      ["Adres", sim.addressText(r.slot)],
      ["Hobi", people.hobbies[selected].ad],
      ["Evcil", pet || "Henüz yok"],
      ["Adada", t === 0 ? "Bugün geldi" : `${fmt.format(t)} gündür`],
      ["Ulaşım", (people.hasCar[selected] ? "Kendi arabası" : world.vehicles ? "Otobüs ve yürüyüş" : "Yürüyerek (adada henüz araç yok)") + (people.works[selected].wp.kind === "anakara" ? " · işe vapurla" : "")],
      // İstekler videolarımızın yorumlarından okunur (sunucuda istekler.py; biçim orada).
      ...(TIKTOK && !r.hidden ? [["Sen misin?", "Videomuza “meslek: balıkçı”, “hobi: tavla”, “evcil: kedi” ya da “adımı gizle” yaz; sonraki taşınmada işlenir."]] : []),
    ]);
  }

  function renderBuilding() {
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const b = dollhouse.building;
    if (!b.daireler) {
      $("card-handle").textContent = dollhouse.workName ?? "Dükkân";
      $("card-title").textContent = `${b.address ?? ""} · ${dollhouse.floor + 1}. kat`;
      // Yalnızca şu an bu katta çalışanlar (izinli, yolda ya da evde olanlar listelenmez).
      const rows = [];
      let total = 0;
      for (const [i] of dollhouse.workSpots) {
        total++;
        if (people.activities[i]?.ne !== "is") continue;
        rows.push([sim.title(residents[i], today()), at(residents[i]), () => select(i)]);
      }
      $("card-now").textContent = rows.length ? `Şu an ${rows.length} kişi çalışıyor (bu katın kadrosu ${total})` : total ? `Şu an kimse çalışmıyor (kadro ${total})` : "Bu katta çalışan yok";
      facts(rows.slice(0, 12));
      if (rows.length > 12) facts([...rows.slice(0, 12), ["", `ve ${rows.length - 12} kişi daha`]]);
      return;
    }
    const p = sim.addressParts(b.slot0);
    $("card-handle").textContent = `${sim.sokakName(p.mahalle, p.sokak)} No ${p.bina * 2 + 1}`;
    $("card-title").textContent = `${sim.mahalleName(p.mahalle)}, Mercanada · ${b.floors} katlı apartman`;
    $("card-now").textContent = `${dollhouse.floor + 1}. kat`;
    const rows = [];
    for (let c = 0; c < b.perFloor; c++) {
      const k = dollhouse.floor * b.perFloor + c;
      if (k >= b.daireler) continue;
      const i = people.slotToIndex.get(b.slot0 + k);
      if (i == null) rows.push([`Daire ${k + 1}`, "Boş, yeni sakinini bekliyor"]);
      else rows.push([`Daire ${k + 1}`, `${at(residents[i])} · ${nowText(i)}`, () => select(i)]);
    }
    facts(rows);
  }

  function render() {
    $("floorbar").hidden = !dollhouse.isOpen();
    if (dollhouse.isOpen()) $("floor-label").textContent = `${dollhouse.floor + 1}. kat`;
    pending = [];
    if (mode === "sakin" && selected != null) renderPerson();
    else if (mode === "bina" && dollhouse.isOpen()) renderBuilding();
    else if (mode === "arac" && vehicle) renderVehicle();
    else if (mode === "yer" && place) renderPlace();
    flushActions();
  }

  const KIND_NAMES = { car: "Otomobil", taxi: "Taksi", bus: "Otobüs", ambulans: "Ambulans", itfaiye: "İtfaiye aracı", cop: "Çöp kamyonu" };
  const KIND_ICONS = { car: "🚗", taxi: "🚕", bus: "🚌", ambulans: "🚑", itfaiye: "🚒", cop: "🚛" };
  const PLACE_ICONS = { cami: "🕌", liman: "⛴", ambar: "📦", tersane: "⚓", kulube: "🎣", ahir: "🐄", itfaiye: "🚒", garaj: "🚛", bufe: "🥤" };

  // Kart birkaç karede bir yeniden çizilir; düğmeler değişmediyse yerinde kalır (yoksa basılırken
  // DOM'dan kopar ve dokunuş boşa gider). Yalnızca tıklama işlevleri tazelenir.
  let pending = [];
  function action(label, onClick, primary = false) {
    pending.push({ label, onClick, primary });
  }

  function flushActions() {
    const box = $("card-actions");
    const sig = pending.map((a) => a.label + (a.primary ? "*" : "")).join("|");
    if (box.dataset.sig === sig) {
      [...box.children].forEach((b, n) => { b._onClick = pending[n].onClick; });
      return;
    }
    box.dataset.sig = sig;
    box.replaceChildren(...pending.map((a) => {
      const b = document.createElement("button");
      b.textContent = a.label;
      if (a.primary) b.classList.add("primary");
      b._onClick = a.onClick;
      b.addEventListener("click", () => b._onClick());
      return b;
    }));
  }

  function renderVehicle() {
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const r = vehicle;
    const live = r.key ? traffic.active.get(r.key) : null;
    $("card-handle").textContent = KIND_NAMES[r.kind] ?? "Araç";
    icon(KIND_ICONS[r.kind] ?? "🚗");
    const rows = [];
    if (r.kind === "bus") {
      const line = traffic.lines[r.line];
      $("card-title").textContent = `${line.name} · ${r.dep + 1}. sefer`;
      const n = live ? people.busSeat.get(live) ?? 0 : 0;
      $("card-now").textContent = live ? (live.v < 0.3 ? "Durakta / ışıkta bekliyor" : `${Math.round(live.v * 3.6)} km/sa`) : "Seferini tamamladı";
      rows.push(["Yolcu", `${n} kişi`], ["Durak", `${line.stops.length} durak, ${line.headway} dakikada bir`]);
    } else if (r.kind === "car" || r.kind === "taxi") {
      const owner = r.owner != null ? residents[r.owner] : null;
      $("card-title").textContent = r.kind === "taxi" ? "Mercanada Taksi" : owner ? `${at(owner)} adlı sakinin arabası` : "Otomobil";
      const done = r.key && !live; // yolculuk bitti, araç park yerinde
      $("card-now").textContent = r.parked ? "Park halinde" : live ? (live.parked ? "Park etti" : live.v < 0.3 ? "Bekliyor" : `${Math.round(live.v * 3.6)} km/sa`) : done ? (r.kind === "taxi" ? "Yolcusunu bıraktı" : "Park etti") : "Müşteri bekliyor";
      if (owner) rows.push([r.kind === "taxi" ? "Yolcu" : "Sahibi", at(owner), () => select(r.owner)]);
    } else {
      $("card-title").textContent = { ambulans: "Mercanada Hastanesi", itfaiye: "Mercanada İtfaiyesi", cop: "Belediye temizlik işleri" }[r.kind] ?? "";
      $("card-now").textContent = live ? ({ out: "Göreve gidiyor", wait: "Görevde", back: "Dönüyor" }[live.phase] ?? (live.v < 0.3 ? "Konteyner boşaltıyor" : "Toplama turunda")) : "Görevini tamamladı";
    }
    facts(rows);
    const f = follow.get();
    const on = f?.kind === "arac" && f.key === r.key;
    if (live && (!live.parked || on)) followActions(on ? f.view : null, { kind: "arac", key: r.key }, "🎥 Arkasından izle");
  }

  /** Dokununca takip kendiliğinden başlar; kartta yalnız bakış açısı seçilir (haritadan ya da gözünden). */
  function followActions(view, target, shoulderLabel) {
    if (view === "omuz") action("🗺 Haritaya dön", () => { follow.set(target, "harita"); render(); });
    else action(shoulderLabel, () => { follow.set(target, "omuz"); render(); });
  }

  /** Kart başlığındaki yuvarlak simge: harf (sakin) ya da emoji. */
  function icon(text, color = null) {
    const el = $("card-icon");
    el.textContent = text;
    el.style.background = color ?? "";
  }

  function renderPlace() {
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const names = { cami: "Cami", liman: "Vapur iskelesi", ambar: "Liman ambarı", tersane: "Tersane", kulube: "Balıkçı kulübesi", ahir: "Çiftlik", itfaiye: "İtfaiye istasyonu", garaj: "Belediye garajı", bufe: "Büfe" };
    const wp = Object.values(world.workplaces).flat().find((w) => w?.building === place);
    $("card-handle").textContent = wp?.name ?? names[place.kind] ?? "Bina";
    icon(PLACE_ICONS[place.kind] ?? "🏛");
    $("card-title").textContent = place.address ?? "";
    $("card-now").textContent = `${place.floors} katlı`;
    facts([]);
  }

  /** Araca dokununca: yoldaysa takip edilir, park halindeyse ona odaklanılır. */
  function selectVehicle(record) {
    if (!record) return;
    selected = null;
    mode = "arac";
    vehicle = record;
    dollhouse.close();
    const live = record.key ? traffic.active.get(record.key) : null;
    if (live && !live.parked) follow.set({ kind: "arac", key: record.key }, "harita");
    else {
      follow.set(null);
      const at = record.slot != null ? traffic.slots[record.slot] : live?.route.position(live.s);
      if (at) flyTo(at.x, world.groundY(at.x, at.z), at.z, 45);
    }
    showCard();
  }

  function showCard() {
    $("card").hidden = false;
    document.body.classList.add("kart-acik");
    render();
  }

  function flyToFloor() {
    const { target, front } = dollhouse.focus();
    const dir = front.clone().multiplyScalar(0.72).setY(0.7).normalize();
    const size = Math.max(dollhouse.building.w, dollhouse.building.d);
    flyTo(target.x, target.y, target.z, Math.max(innerWidth < innerHeight ? 34 : 19, size * (innerWidth < innerHeight ? 2.0 : 1.15)), dir);
  }

  function homeOf(i) {
    const slot = residents[i].slot;
    return world.buildings.find((b) => b.daireler && slot >= b.slot0 && slot < b.slot0 + b.daireler);
  }

  /** Sakini seçer; evdeyse evinin içini açar. */
  /** Sakini seçer ve takip eder (takip: false, takipteki kişi bir binaya girip çıkınca yalnız kartı tazelemek için). */
  function select(i, fly = true, takip = true) {
    selected = i;
    mode = "sakin";
    // Evdeyse ya da işteyse iç mekâna uçulur (takip yine sürer, yaklaşma uçuştan gelir); dışarıdaysa takip kamerayı getirir.
    if (takip) follow.set({ kind: "sakin", i }, "harita", { yaklas: false });
    const seg = people.activities[i];
    const atHome = seg && (seg.ne === "ev" || seg.ne === "uyku");
    const home = homeOf(i);
    const workB = seg?.ne === "is" && !people.works[i].loc.outdoor ? people.works[i].loc.building : null;
    if (workB && !["liman", "tersane"].includes(workB.kind)) {
      const floor = sim.roll(residents[i].seed, "kat") % workB.floors;
      if (dollhouse.building !== workB || dollhouse.floor !== floor) dollhouse.open(workB, floor);
      if (fly) flyToFloor();
    } else if (atHome && home) {
      const floor = Math.floor((residents[i].slot - home.slot0) / home.perFloor);
      if (dollhouse.building !== home || dollhouse.floor !== floor) dollhouse.open(home, floor);
      if (fly) flyToFloor();
    } else {
      dollhouse.close();
      if (takip) follow.set({ kind: "sakin", i }, "harita");
      else if (fly) {
        const [x, z] = people.focusPoint(i);
        flyTo(x, world.groundY(x, z), z, innerWidth < innerHeight ? 30 : 18);
      }
    }
    showCard();
  }

  /** Bir binaya dokununca: içini aç (iç mekânı olmayanlara yalnız odaklan). Takip biter. */
  function openBuilding(b) {
    if (!b) return;
    follow.set(null);
    if (["kulube", "ahir", "liman", "tersane", "ambar", "cami", "itfaiye", "garaj"].includes(b.kind)) {
      selected = null; mode = "yer"; place = b;
      dollhouse.close();
      flyTo(b.x, world.groundY(b.x, b.z), b.z, Math.max(45, Math.max(b.w, b.d) * 2.2));
      showCard();
      return;
    }
    selected = null;
    mode = "bina";
    dollhouse.open(b, dollhouse.building === b ? dollhouse.floor : 0);
    flyToFloor();
    showCard();
  }

  function changeFloor(delta) {
    if (!dollhouse.isOpen()) return;
    dollhouse.setFloor(dollhouse.floor + delta);
    mode = "bina";
    selected = null;
    flyToFloor();
    showCard();
  }

  function find(text) {
    const handle = sim.normalizeHandle(text);
    if (!handle) return;
    const i = byHandle.get(handle);
    if (i == null) {
      selected = null;
      mode = null;
      dollhouse.close();
      $("card").hidden = false;
      $("floorbar").hidden = true;
      $("card-handle").textContent = "@" + handle;
      $("card-title").textContent = "Bu kullanıcı adı henüz adada değil.";
      $("card-now").textContent = TIKTOK
        ? `TikTok'ta @${TIKTOK} hesabını takip ettiysen iskelede sıranı bekliyorsun: sıradaki taşınma ${nextMove()}. ` +
          "Etmediysen takip et, sen de taşın. (Bazı hesapları, ör. gizli hesapları, TikTok takipçi listesinde göstermiyor; onlar taşınamıyor.)"
        : "Ada henüz sakin kabul etmiyor: TikTok hesabımız çok yakında açılıyor.";
      $("card-facts").replaceChildren();
      $("card-tabs").hidden = true;
      $("card-traits").replaceChildren();
      return;
    }
    select(i);
  }

  function close() {
    selected = null;
    mode = null;
    vehicle = null;
    place = null;
    follow.set(null);
    dollhouse.close();
    $("card").hidden = true;
    document.body.classList.remove("kart-acik");
    $("floorbar").hidden = true;
  }

  $("card-close").addEventListener("click", close);
  $("floor-up").addEventListener("click", () => changeFloor(1));
  $("floor-down").addEventListener("click", () => changeFloor(-1));
  $("floor-exit").addEventListener("click", close);

  return {
    select,
    find,
    openBuilding,
    selectVehicle,
    close,
    selected: () => (mode === "sakin" ? selected : null),
    selectedVehicle: () => (mode === "arac" && !$("card").hidden ? vehicle : null),
    tick(unix, minuteNow, day, times) {
      // Gün doğumu/batımı yalnız geniş ekranda (telefonda saat kutusu kısa kalsın).
      const sun = times?.rise != null ? `<span class="sun"> · ☀ ${sim.formatMinute(times.rise)}–${sim.formatMinute(times.set)}</span>` : "";
      $("clock").innerHTML = `${sim.formatMinute(minuteNow)} · ${DAYS[sim.weekday(day)]}${sun}`;
      // Döküm benzetimden: işte, evde (uyuyanlar dahil) ve dışarıda (yolda, çarşıda, hobisinde).
      let work = 0, home = 0;
      for (const seg of people.activities) {
        if (!seg) continue;
        if (seg.ne === "is") work++;
        else if (seg.ne === "ev" || seg.ne === "uyku") home++;
      }
      const out = residents.length - work - home;
      // Toplam, dar ekranda gizlenir (satır kesilmesin).
      if (!residents.length) {
        $("stats").innerHTML = `<span class="bos"></span>`;
        $("stats").firstChild.textContent = listError === "none" ? "Sakin listesi şu an alınamadı" : waiting ? "🏝️ Ada ilk sakinlerini bekliyor" : "🏝️ Ada ilk sakinini bekliyor";
      } else {
        const chip = (ic, n, t, cls = "") => `<span class="chip ${cls}"><b>${ic} ${fmt.format(n)}</b><small>${t}</small></span>`;
        $("stats").innerHTML = chip("👥", residents.length, "sakin", "ana") + chip("💼", work, "işte") + chip("🏠", home, "evde") + chip("🚶", out, "dışarıda");
      }
      if (!$("card").hidden) render();
    },
  };
}
