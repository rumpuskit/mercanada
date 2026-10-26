class_name Address
## Sıra numarasından (slot) adres: ada → mahalle → sokak → bina → daire.
## Sakinler geliş sırasıyla numara aldığı için aynı hafta gelenler aynı mahallede yaşar.


static func parts(slot: int) -> Dictionary:
	var per_bina := Catalog.cap("daire_per_bina")
	var per_sokak := per_bina * Catalog.cap("bina_per_sokak")
	var per_mahalle := per_sokak * Catalog.cap("sokak_per_mahalle")
	var mahalle := slot / per_mahalle
	var in_mahalle := slot % per_mahalle
	return {
		"ada": mahalle / Catalog.cap("mahalle_per_ada"),
		"mahalle": mahalle,
		"sokak": in_mahalle / per_sokak,
		"bina": (in_mahalle % per_sokak) / per_bina,
		"daire": in_mahalle % per_bina,
	}


static func ada_name(ada: int) -> String:
	var names: Array = Catalog.data().adalar
	var name: String = names[ada % names.size()]
	return name if ada < names.size() else "%s %d" % [name, ada / names.size() + 1]


static func mahalle_name(mahalle: int) -> String:
	var names: Array = Catalog.data().mahalleler
	var name: String = names[mahalle % names.size()]
	if mahalle >= names.size():
		name += " %d" % (mahalle / names.size() + 1)
	return name + " Mahallesi"


## Ardışık sokaklar listede ardışık isim alır; liste mahalledeki sokak sayısından uzun olduğu
## sürece bir mahallede aynı isim iki kez çıkmaz.
static func sokak_name(mahalle: int, sokak: int) -> String:
	var names: Array = Catalog.data().sokaklar
	return names[(sokak + mahalle * 7) % names.size()] + " Sokağı"


static func text(slot: int) -> String:
	var p := parts(slot)
	return "%s No %d, Daire %d, %s, %s" % [
		sokak_name(p.mahalle, p.sokak), p.bina * 2 + 1, p.daire + 1,
		mahalle_name(p.mahalle), ada_name(p.ada),
	]
