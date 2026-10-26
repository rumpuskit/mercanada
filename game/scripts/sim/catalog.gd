class_name Catalog
## data/catalog.json: oyun ve sunucunun ortak kullandığı meslek, yer ve isim listeleri.
## JSON sayıları float gelir; kullanırken int()'e çevir.

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
	return _data


static func cap(key: String) -> int:
	return int(data().kapasite[key])
