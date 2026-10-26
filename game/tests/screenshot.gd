extends SceneTree
## Ana sahneyi verilen saatte açıp ekran görüntüsü kaydeder:
## godot --path game -s tests/screenshot.gd -- <çıktı.png> <SS:DD>


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var main: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	var hm: PackedStringArray = args[1].split(":")
	var today_start := (CityClock.day_of(CityClock.now_unix()) * 86400) - CityClock.TZ_OFFSET
	main.sim_unix = today_start + int(hm[0]) * 3600 + int(hm[1]) * 60
	main.speed = 0.0
	for i in 10:
		await process_frame
	root.get_texture().get_image().save_png(args[0])
	quit()
