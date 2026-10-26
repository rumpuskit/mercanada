extends Node3D
## Geliştirme sahnesi: geçici ada üzerinde örnek sakinler deterministik planlarına göre yaşar.
## Klavye: 1 = gerçek zaman, 2 = 60x, 3 = 600x, 4 = 3600x.

const SAMPLE_COUNT := 2000
const SPEEDS := [1.0, 60.0, 600.0, 3600.0]
const OUTDOOR_WORK := ["liman", "balikci_koyu", "tarla", "plaj", "tersane"]

var world := PlaceholderWorld.new()
var rig := CameraRig.new()
var sun := DirectionalLight3D.new()
var env := Environment.new()
var sky_mat := ProceduralSkyMaterial.new()
var label := Label.new()
var people := MultiMesh.new()

var residents: Array[Dictionary] = []
var plans: Array = []
var plan_day := -1
var heights: Array[float] = []
var works_outdoors: Array[bool] = []
var sim_unix := CityClock.now_unix()
var speed := 60.0


func _ready() -> void:
	add_child(world)
	add_child(rig)
	_build_environment()
	_build_people()
	_build_ui()
	_make_sample_residents()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode >= KEY_1 and event.keycode <= KEY_4:
		speed = SPEEDS[event.keycode - KEY_1]


func _process(delta: float) -> void:
	sim_unix += delta * speed
	var day := CityClock.day_of(sim_unix)
	var minute := CityClock.minute_of(sim_unix)
	if day != plan_day:
		plan_day = day
		plans = residents.map(func(r: Dictionary) -> Array: return ResidentSim.day_plan(r, day))
	_update_people(minute)
	_update_daylight(minute)


func _make_sample_residents() -> void:
	var today := CityClock.day_of(sim_unix)
	for i in SAMPLE_COUNT:
		var handle := "sakin_%04d" % i
		residents.append({
			"handle": handle,
			"seed": MHash.seed_of(handle),
			"slot": i,
			"arrived_day": today - i % 45,
		})
	people.instance_count = residents.size()
	for i in residents.size():
		var look := ResidentSim.look(residents[i])
		people.set_instance_color(i, Palette.CLOTHES[look.ust % Palette.CLOTHES.size()])
		heights.append(look.boy / 100.0)
		works_outdoors.append(OUTDOOR_WORK.has(ResidentSim.workplace(residents[i]).kind))


func _update_people(minute: float) -> void:
	var outside := 0
	for i in residents.size():
		var r := residents[i]
		var seg := ResidentSim.activity_at(plans[i], minute)
		var pos := Vector3.ZERO
		var shown := true
		match seg.ne:
			"yol":
				pos = _place_of(r, seg.nereden).lerp(_place_of(r, seg.nereye), seg.t)
			"is":
				shown = works_outdoors[i]
				pos = _place_of(r, "is")
			"uyku", "ev":
				shown = false
			_:
				pos = _place_of(r, seg.yer)
		if shown:
			outside += 1
			var h := heights[i]
			people.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ONE * h), pos + Vector3(0, 0.9 * h, 0)))
		else:
			people.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))
	label.text = "Mercanada · %s · %s · nüfus %d · dışarıda %d · hız %dx" % [
		CityClock.format_minute(minute), _weekday_name(CityClock.day_of(sim_unix)),
		residents.size(), outside, int(speed),
	]


## Bir sakinin bir yerdeki noktası; aynı yere gidenler üst üste binmesin diye kişiye özel kaydırılır.
func _place_of(r: Dictionary, place: String) -> Vector3:
	var base: Vector3
	match place:
		"ev":
			return world.home_position(r.slot)
		"is":
			var wp := ResidentSim.workplace(r)
			base = world.workplace_position(wp.kind, wp.index)
		_:
			base = world.place_position(place)
	var jitter := MHash.roll(r.seed, "yer_" + place)
	return base + Vector3((jitter & 0xFF) / 255.0 - 0.5, 0, ((jitter >> 8) & 0xFF) / 255.0 - 0.5) * 12.0


func _update_daylight(minute: float) -> void:
	# Güneş 06:00'da doğar, 20:00'de batar (sonraki günlerde mevsime göre ayarlanacak).
	var day_t := clampf((minute - 360.0) / 840.0, 0.0, 1.0)
	var elevation := sin(day_t * PI)
	var light := smoothstep(0.0, 0.35, elevation)
	sun.rotation = Vector3(-deg_to_rad(8.0 + 62.0 * elevation), deg_to_rad(-60.0 + 120.0 * day_t), 0)
	sun.light_energy = 0.9 * light
	sky_mat.sky_top_color = Palette.NIGHT_SKY_TOP.lerp(Palette.SKY_TOP, light)
	sky_mat.sky_horizon_color = Palette.NIGHT_SKY_HORIZON.lerp(Palette.SKY_HORIZON, light)
	sky_mat.ground_horizon_color = sky_mat.sky_horizon_color
	env.ambient_light_color = Palette.NIGHT_AMBIENT.lerp(Palette.AMBIENT, light)
	env.ambient_light_energy = 0.35 + 0.25 * light


func _weekday_name(day: int) -> String:
	return ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][CityClock.weekday(day)]


func _build_environment() -> void:
	sky_mat.sky_top_color = Palette.SKY_TOP
	sky_mat.sky_horizon_color = Palette.SKY_HORIZON
	sky_mat.ground_horizon_color = Palette.SKY_HORIZON
	sky_mat.ground_bottom_color = Palette.WATER
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.9
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	sun.shadow_enabled = false  # gölgeli güneş uyumluluk modunda yüzeyleri patlatıyor ve telefonda pahalı
	sun.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	sun.light_color = Color("fff3e0")
	add_child(sun)


func _build_people() -> void:
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.35
	capsule.height = 1.8
	capsule.radial_segments = 8
	capsule.rings = 2
	people.transform_format = MultiMesh.TRANSFORM_3D
	people.use_colors = true
	people.mesh = capsule
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = people
	var mat := Palette.material(Color.WHITE)
	mat.vertex_color_use_as_albedo = true
	instance.material_override = mat
	add_child(instance)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	label.position = Vector2(16, 12)
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color("3d4a5c"))
	label.add_theme_color_override("font_outline_color", Color(1, 1, 1, 0.8))
	label.add_theme_constant_override("outline_size", 6)
	layer.add_child(label)
	add_child(layer)
