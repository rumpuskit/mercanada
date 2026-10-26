// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Kendini bul" araması ve sakin kartı.
import * as sim from "./sim.js";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const PLACE_NAMES = {
  meydan: "Meydan", iskele: "İskele", park: "Park", sahil_yolu: "Sahil yolu", plaj: "Plaj",
  tepe: "Tepe", fener: "Fener", kahvehane: "Kahvehane",
};

const fmt = new Intl.NumberFormat("tr-TR");
const $ = (id) => document.getElementById(id);

export function createUI({ residents, people, world, setSpeed, flyTo, speed, today }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  let selected = null;

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
      case "uyku": return "Uyuyor";
      case "ev": return "Evde";
      case "is": return `İşte · ${people.works[i].loc.name}`;
      case "yol": return `Yolda → ${placeLabel(i, seg.nereye)}`;
      case "hobi": return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
      case "meydan": return "Meydanda, arkadaşlarıyla";
      default: return seg.ne;
    }
  }

  function renderCard() {
    if (selected == null) return;
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    const pet = sim.pet(r, day);
    $("card-handle").textContent = "@" + r.handle;
    $("card-title").textContent = `${sim.title(r, day)} · ${people.works[selected].loc.name}`;
    $("card-now").textContent = nowText(selected);
    const facts = [
      ["Adres", sim.addressText(r.slot)],
      ["Hobi", people.hobbies[selected].ad],
      ["Evcil", pet || "Henüz yok"],
      ["Adada", t === 0 ? "Bugün geldi" : `${fmt.format(t)} gündür`],
    ];
    $("card-facts").replaceChildren(...facts.flatMap(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      return [dt, dd];
    }));
  }

  function select(i, fly = true) {
    selected = i;
    $("card").hidden = false;
    renderCard();
    if (fly) {
      const [x, z] = people.focusPoint(i);
      flyTo(x, 0, z, innerWidth < innerHeight ? 260 : 130);
    }
  }

  function find(text) {
    const handle = sim.normalizeHandle(text);
    if (!handle) return;
    const i = byHandle.get(handle);
    if (i == null) {
      selected = null;
      $("card").hidden = false;
      $("card-handle").textContent = "@" + handle;
      $("card-title").textContent = "Bu kullanıcı adı henüz adada değil.";
      $("card-now").textContent = "Mercanada'yı takip et; ertesi sabah ilk vapurla gelirsin.";
      $("card-facts").replaceChildren();
      return;
    }
    select(i);
  }

  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    find($("search-input").value);
    $("search-input").blur();
  });
  $("card-close").addEventListener("click", () => {
    selected = null;
    $("card").hidden = true;
  });

  return {
    select,
    find,
    selected: () => selected,
    tick(unix, minute, day) {
      $("clock").textContent = `${sim.formatMinute(minute)} · ${DAYS[sim.weekday(day)]}`;
      $("stats").textContent = `${fmt.format(residents.length)} sakin · ${fmt.format(people.visibleCount)} dışarıda · ${world.mahalleler} mahalle`;
      renderCard();
    },
  };
}
