// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Kendini bul" araması, sakin kartı ve ev içi görünümü.
import * as sim from "./sim.js";
import { HOME_LABELS, homeActivity } from "./world/life.js";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const PLACE_NAMES = {
  meydan: "Meydan", iskele: "İskele", park: "Park", sahil_yolu: "Sahil yolu", plaj: "Plaj",
  tepe: "Tepe", fener: "Fener", kahvehane: "Kahvehane",
};

const fmt = new Intl.NumberFormat("tr-TR");
const $ = (id) => document.getElementById(id);

export function createUI({ residents, people, world, dollhouse, stories, setSpeed, flyTo, speed, today, minute }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  let selected = null;
  let mode = null; // "sakin" | "bina"
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
    return PLACE_NAMES[yer.replace("hobi:", "")] ?? yer;
  }

  function nowText(i) {
    const seg = people.activities[i];
    if (!seg) return "";
    switch (seg.ne) {
      case "uyku":
      case "ev": {
        const act = homeActivity(residents[i].seed, seg, minute(), today(), people.hobbies[i].id);
        return (seg.ne === "ev" ? "Evde · " : "") + HOME_LABELS[act];
      }
      case "is": return `İşte · ${people.works[i].loc.name}`;
      case "yol": return `Yolda → ${placeLabel(i, seg.nereye)}`;
      case "hobi": return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
      case "meydan": {
        const pl = people.currentPlace[i];
        return pl && pl !== "meydan" ? `Mahallesinin çay bahçesinde, komşularıyla` : "Çarşıda, arkadaşlarıyla";
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

  const link = (j) => ["@" + residents[j].handle, () => select(j)];

  function renderPerson() {
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    $("card-handle").textContent = "@" + r.handle;
    $("card-title").textContent = `${sim.title(r, day)} · ${people.works[selected].loc.name}`;
    $("card-now").textContent = nowText(selected);
    $("card-tabs").hidden = false;
    $("card-traits").replaceChildren();
    if (tab === "bugun") {
      const homeLabel = (k) => {
        const seg = people.plans[selected][k];
        const act = homeActivity(r.seed, seg, seg.bas + 1, day, people.hobbies[selected].id);
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
      ["Ulaşım", people.hasCar[selected] ? "Kendi arabası" : "Otobüs ve yürüyüş"],
    ]);
  }

  function renderBuilding() {
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const b = dollhouse.building;
    const p = sim.addressParts(b.slot0);
    $("card-handle").textContent = `${sim.sokakName(p.mahalle, p.sokak)} No ${p.bina * 2 + 1}`;
    $("card-title").textContent = `${sim.mahalleName(p.mahalle)} · ${b.floors} katlı apartman`;
    $("card-now").textContent = `${dollhouse.floor + 1}. kat`;
    const rows = [];
    for (let c = 0; c < b.perFloor; c++) {
      const k = dollhouse.floor * b.perFloor + c;
      if (k >= b.daireler) continue;
      const i = people.slotToIndex.get(b.slot0 + k);
      if (i == null) rows.push([`Daire ${k + 1}`, "Boş, yeni sakinini bekliyor"]);
      else rows.push([`Daire ${k + 1}`, `@${residents[i].handle} · ${nowText(i)}`, () => select(i)]);
    }
    facts(rows);
  }

  function render() {
    $("floorbar").hidden = !dollhouse.isOpen();
    if (dollhouse.isOpen()) $("floor-label").textContent = `${dollhouse.floor + 1}. kat`;
    if (mode === "sakin" && selected != null) renderPerson();
    else if (mode === "bina" && dollhouse.isOpen()) renderBuilding();
  }

  function showCard() {
    $("card").hidden = false;
    render();
  }

  function flyToFloor() {
    const { target, front } = dollhouse.focus();
    const dir = front.clone().multiplyScalar(0.72).setY(0.7).normalize();
    flyTo(target.x, target.y, target.z, innerWidth < innerHeight ? 34 : 19, dir);
  }

  function homeOf(i) {
    const slot = residents[i].slot;
    return world.buildings.find((b) => b.daireler && slot >= b.slot0 && slot < b.slot0 + b.daireler);
  }

  /** Sakini seçer; evdeyse evinin içini açar. */
  function select(i, fly = true) {
    selected = i;
    mode = "sakin";
    const seg = people.activities[i];
    const atHome = seg && (seg.ne === "ev" || seg.ne === "uyku");
    const home = homeOf(i);
    if (atHome && home) {
      const floor = Math.floor((residents[i].slot - home.slot0) / home.perFloor);
      if (dollhouse.building !== home || dollhouse.floor !== floor) dollhouse.open(home, floor);
      if (fly) flyToFloor();
    } else {
      dollhouse.close();
      if (fly) {
        const [x, z] = people.focusPoint(i);
        flyTo(x, world.groundY(x, z), z, innerWidth < innerHeight ? 30 : 18);
      }
    }
    showCard();
  }

  /** Bir apartmana dokununca: içini aç. */
  function openBuilding(b) {
    if (!b?.daireler) return;
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
      $("card-now").textContent = "Mercanada'yı takip et; ertesi sabah ilk vapurla gelirsin.";
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
    dollhouse.close();
    $("card").hidden = true;
    $("floorbar").hidden = true;
  }

  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    find($("search-input").value);
    $("search-input").blur();
  });
  $("card-close").addEventListener("click", close);
  $("floor-up").addEventListener("click", () => changeFloor(1));
  $("floor-down").addEventListener("click", () => changeFloor(-1));
  $("floor-exit").addEventListener("click", close);

  return {
    select,
    find,
    openBuilding,
    close,
    selected: () => (mode === "sakin" ? selected : null),
    tick(unix, minuteNow, day, times) {
      const sun = times?.rise != null ? ` · ☀ ${sim.formatMinute(times.rise)}–${sim.formatMinute(times.set)}` : "";
      $("clock").textContent = `${sim.formatMinute(minuteNow)} · ${DAYS[sim.weekday(day)]}${sun}`;
      $("stats").textContent = `${fmt.format(residents.length)} sakin · ${fmt.format(people.visibleCount)} dışarıda · ${world.mahalleler} mahalle`;
      if (!$("card").hidden) render();
    },
  };
}
