class_name ResidentSim
## Bir sakinin hayatı tohumdan (seed) ve günden hesaplanır; sunucuda kimsenin hayatı tutulmaz.
## Sakin sözlüğü: {handle, seed, slot, arrived_day, overrides?}. overrides yorumdan gelen isteklerdir
## (ör. {"meslek": "balikci", "evcil": "Kedi"}).
## Python karşılığı: server/mercanada_sim/sim.py. Kural değişirse ikisi birlikte değişmeli.

const PLACE_HOME := "ev"
const PLACE_WORK := "is"


static func _pick_weighted(items: Array, roll: int) -> int:
	var total := 0
	for item in items:
		total += int(item.agirlik)
	var x := roll % total
	for i in items.size():
		x -= int(items[i].agirlik)
		if x < 0:
			return i
	return items.size() - 1


static func _find(items: Array, id: String) -> int:
	for i in items.size():
		if items[i].id == id:
			return i
	return -1


static func _override(r: Dictionary, key: String) -> String:
	return str(r.get("overrides", {}).get(key, ""))


static func job(r: Dictionary) -> Dictionary:
	var jobs: Array = Catalog.data().meslekler
	var i := _find(jobs, _override(r, "meslek"))
	if i < 0:
		i = _pick_weighted(jobs, MHash.roll(r.seed, "meslek"))
	return jobs[i]


static func workplace(r: Dictionary) -> Dictionary:
	var kind: String = job(r).yer
	var names: Array = Catalog.data().isyerleri[kind]
	var index := MHash.roll(r.seed, "isyeri") % names.size()
	return {"kind": kind, "index": index, "name": names[index]}


static func tenure(r: Dictionary, day: int) -> int:
	return maxi(0, day - int(r.arrived_day))


## Terfiler kıdemle gelir; herkes aynı gün terfi almasın diye 0-6 gün kaydırılır.
static func rank(r: Dictionary, day: int) -> int:
	var shift := MHash.roll(r.seed, "terfi") % 7
	var t := tenure(r, day)
	var k := 0
	for threshold in Catalog.data().terfi_gunleri:
		if t >= int(threshold) + shift:
			k += 1
	return k


static func title(r: Dictionary, day: int) -> String:
	var ladder: Array = job(r).kademeler
	return ladder[mini(rank(r, day), ladder.size() - 1)]


static func hobby(r: Dictionary) -> Dictionary:
	var hobbies: Array = Catalog.data().hobiler
	var i := _find(hobbies, _override(r, "hobi"))
	if i < 0:
		i = MHash.roll(r.seed, "hobi") % hobbies.size()
	return hobbies[i]


## Evcil hayvan yoksa "" döner. Sahiplenme gelişten 5-29 gün sonra olur.
static func pet(r: Dictionary, day: int) -> String:
	var requested := _override(r, "evcil")
	if requested != "":
		return requested
	if MHash.roll(r.seed, "evcil") % 100 >= int(Catalog.data().evcil_orani):
		return ""
	if tenure(r, day) < 5 + MHash.roll(r.seed, "evcil_gun") % 25:
		return ""
	var pets: Array = Catalog.data().evcil_hayvanlar
	return pets[MHash.roll(r.seed, "evcil_tur") % pets.size()]


## Görünüş cinsiyetten bağımsız; her parça katalogdaki seçenek sayısı içinde bir indeks.
static func look(r: Dictionary) -> Dictionary:
	var result := {}
	var options: Dictionary = Catalog.data().gorunus
	for key in options:
		result[key] = MHash.roll(r.seed, "gorunus_" + key) % int(options[key])
	result["boy"] = 92 + MHash.roll(r.seed, "boy") % 17
	return result


static func works_on(r: Dictionary, day: int) -> bool:
	var weekday := CityClock.weekday(day)
	if not bool(job(r).hafta_sonu):
		return weekday < 5
	# Hafta sonu da açık iş yerlerinde çalışanların haftada iki izin günü var.
	var off := MHash.roll(r.seed, "izin") % 7
	return weekday != off and weekday != (off + 3) % 7


## Günün planı: dakika aralıklarından oluşan kesintisiz liste (0-1440).
## Her parça: {bas, son, ne, yer}; yolculukta yer yerine nereden/nereye.
static func day_plan(r: Dictionary, day: int) -> Array:
	var s: int = r.seed
	var commute := 15 + MHash.roll(s, "yol") % 20
	var hobby_place: String = "hobi:" + hobby(r).yer
	var plan: Array = []

	var sleep := 1350 + MHash.roll(s, "uyku", day) % 80
	if works_on(r, day):
		var shift: Dictionary = Catalog.data().vardiyalar[job(r).vardiya]
		var start := int(shift.bas)
		var end := int(shift.son)
		if job(r).vardiya == "erken":
			sleep = 1290 + MHash.roll(s, "uyku", day) % 60
		var wake := start - commute - 45 - MHash.roll(s, "uyan", day) % 30
		_add(plan, wake, "uyku", PLACE_HOME)
		_add(plan, start - commute, "ev", PLACE_HOME)
		_travel(plan, commute, PLACE_HOME, PLACE_WORK)
		_add(plan, end, "is", PLACE_WORK)
		var outing := _evening_place(s, day, hobby_place)
		var duration := 60 + MHash.roll(s, "sure", day) % 90
		if outing != "" and end + 3 * commute + duration <= sleep - 10:
			_travel(plan, commute, PLACE_WORK, outing)
			_add(plan, _end(plan) + duration, _activity_of(outing), outing)
			_travel(plan, commute, outing, PLACE_HOME)
		else:
			_travel(plan, commute, PLACE_WORK, PLACE_HOME)
	else:
		var wake := 450 + MHash.roll(s, "uyan", day) % 120
		_add(plan, wake, "uyku", PLACE_HOME)
		_add(plan, maxi(wake + 60, 600) + MHash.roll(s, "cikis", day) % 60, "ev", PLACE_HOME)
		_travel(plan, commute, PLACE_HOME, hobby_place)
		_add(plan, _end(plan) + 90 + MHash.roll(s, "sure", day) % 90, "hobi", hobby_place)
		_travel(plan, commute, hobby_place, PLACE_HOME)
		var evening := 1140 + MHash.roll(s, "aksam_saat", day) % 60
		if MHash.roll(s, "aksam", day) % 100 < 50 and evening + 60 + commute <= sleep - 10:
			_add(plan, evening - commute, "ev", PLACE_HOME)
			_travel(plan, commute, PLACE_HOME, "meydan")
			_add(plan, _end(plan) + 60 + MHash.roll(s, "meydan_sure", day) % 60, "meydan", "meydan")
			_travel(plan, commute, "meydan", PLACE_HOME)
	_add(plan, maxi(sleep, _end(plan)), "ev", PLACE_HOME)
	_add(plan, 1440, "uyku", PLACE_HOME)
	return plan


static func _end(plan: Array) -> int:
	return 0 if plan.is_empty() else plan[-1].son


static func _add(plan: Array, until: int, ne: String, yer: String) -> void:
	var start := _end(plan)
	if until > start:
		plan.append({"bas": start, "son": until, "ne": ne, "yer": yer})


static func _travel(plan: Array, commute: int, from: String, to: String) -> void:
	var start := _end(plan)
	plan.append({"bas": start, "son": start + commute, "ne": "yol", "nereden": from, "nereye": to})


## İş çıkışı: %40 hobi, %25 meydan, gerisi doğrudan ev ("").
static func _evening_place(s: int, day: int, hobby_place: String) -> String:
	var x := MHash.roll(s, "aksam", day) % 100
	if x < 40:
		return hobby_place
	if x < 65:
		return "meydan"
	return ""


static func _activity_of(place: String) -> String:
	return "hobi" if place.begins_with("hobi:") else place


## Verilen dakikadaki parça; yolculukta "t" ilerleme oranıdır (0-1).
static func activity_at(plan: Array, minute: float) -> Dictionary:
	for seg in plan:
		if minute < seg.son:
			if seg.ne == "yol":
				var result: Dictionary = seg.duplicate()
				result["t"] = clampf((minute - seg.bas) / float(seg.son - seg.bas), 0.0, 1.0)
				return result
			return seg
	return plan[-1]
