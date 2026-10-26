class_name PlaceholderWorld
extends Node3D
## Geçici ada: düz kara, ilk mahallenin binaları ve iş yeri kutuları.
## Bölgelere ayrılmış gerçek ada üretimi bunun yerini alacak; sakin konumlarını soran
## arayüz (home_position, place_position) aynı kalacak.

const ISLAND_RADIUS := 170.0

## Kıyıdaki ve kasabadaki iş yeri türlerinin çapaları; aynı türün örnekleri yan yana dizilir.
const KIND_ANCHORS := {
	"belediye": Vector3(0, 0, -22), "plaza": Vector3(28, 0, -10), "okul": Vector3(-30, 0, -8),
	"saglik": Vector3(-26, 0, 14), "kutuphane": Vector3(-12, 0, 24), "muze": Vector3(12, 0, 26),
	"market": Vector3(30, 0, 16), "kafe": Vector3(0, 0, 40), "firin": Vector3(-34, 0, 34),
	"liman": Vector3(0, 0, 150), "balikci_koyu": Vector3(95, 0, 120), "tersane": Vector3(-95, 0, 120),
	"fener": Vector3(150, 0, 40), "plaj": Vector3(-140, 0, 60), "otel": Vector3(-110, 0, 30),
	"tarla": Vector3(110, 0, -60), "atolye": Vector3(80, 0, 20),
}

## Hobi ve buluşma yerleri.
const PLACE_ANCHORS := {
	"meydan": Vector3(0, 0, 0), "iskele": Vector3(22, 0, 145), "park": Vector3(-60, 0, 20),
	"sahil_yolu": Vector3(120, 0, 80), "plaj": Vector3(-140, 0, 60), "tepe": Vector3(130, 0, -20),
	"fener": Vector3(150, 0, 40), "kahvehane": Vector3(12, 0, 10),
}

var _home_doors: Array[Vector3] = []


func _ready() -> void:
	_build_ground()
	_build_homes()
	_build_workplaces()


func home_position(slot: int) -> Vector3:
	return _home_doors[slot % _home_doors.size()]


func workplace_position(kind: String, index: int) -> Vector3:
	var count: int = Catalog.data().isyerleri[kind].size()
	return KIND_ANCHORS[kind] + Vector3((index - (count - 1) * 0.5) * 10.0, 0, 0)


func place_position(place: String) -> Vector3:
	return PLACE_ANCHORS[place.trim_prefix("hobi:")]


func _build_ground() -> void:
	var water := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3000, 3000)
	water.mesh = plane
	water.material_override = Palette.material(Palette.WATER, 0.3)
	water.position.y = -0.6
	add_child(water)

	var sand := MeshInstance3D.new()
	var sand_mesh := CylinderMesh.new()
	sand_mesh.top_radius = ISLAND_RADIUS
	sand_mesh.bottom_radius = ISLAND_RADIUS + 12.0
	sand_mesh.height = 2.0
	sand_mesh.radial_segments = 48
	sand.mesh = sand_mesh
	sand.material_override = Palette.material(Palette.SAND)
	sand.position.y = -1.0
	add_child(sand)

	var grass := MeshInstance3D.new()
	var grass_mesh := CylinderMesh.new()
	grass_mesh.top_radius = ISLAND_RADIUS - 18.0
	grass_mesh.bottom_radius = ISLAND_RADIUS - 18.0
	grass_mesh.height = 0.2
	grass_mesh.radial_segments = 48
	grass.mesh = grass_mesh
	grass.material_override = Palette.material(Palette.GRASS)
	grass.position.y = 0.05
	add_child(grass)

	var square := MeshInstance3D.new()
	var square_mesh := CylinderMesh.new()
	square_mesh.top_radius = 14.0
	square_mesh.bottom_radius = 14.0
	square_mesh.height = 0.1
	square.mesh = square_mesh
	square.material_override = Palette.material(Palette.PLAZA)
	square.position.y = 0.2
	add_child(square)


## İlk mahalle: her sokak 5x2 binalık bir blok, bloklar adanın kuzeyinde 5x4 dizilir.
func _build_homes() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(4.0, 5.0, 5.0)
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = box
	var sokak_count := Catalog.cap("sokak_per_mahalle")
	var bina_count := Catalog.cap("bina_per_sokak")
	multimesh.instance_count = sokak_count * bina_count
	var per_bina := Catalog.cap("daire_per_bina")

	for sokak in sokak_count:
		var origin := Vector3(-72.0 + (sokak % 5) * 30.0, 0, -40.0 - (sokak / 5) * 24.0)
		for bina in bina_count:
			var pos := origin + Vector3((bina % 5) * 5.5, 2.5, (bina / 5) * 9.0)
			var i := sokak * bina_count + bina
			multimesh.set_instance_transform(i, Transform3D(Basis(), pos))
			multimesh.set_instance_color(i, Palette.BUILDINGS[i % Palette.BUILDINGS.size()])
			for _daire in per_bina:
				_home_doors.append(Vector3(pos.x, 0, pos.z + 2.8))

	var instance := MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	var mat := Palette.material(Color.WHITE)
	mat.vertex_color_use_as_albedo = true
	instance.material_override = mat
	add_child(instance)


func _build_workplaces() -> void:
	var places: Dictionary = Catalog.data().isyerleri
	var k := 0
	for kind in places:
		for index in places[kind].size():
			var building := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(7.0, 4.0 + (k % 3) * 2.0, 7.0)
			building.mesh = box
			building.material_override = Palette.material(Palette.BUILDINGS[(k + 2) % Palette.BUILDINGS.size()])
			building.position = workplace_position(kind, index) + Vector3(0, box.size.y * 0.5, -5.0)
			add_child(building)
			k += 1
