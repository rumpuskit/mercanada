class_name CameraRig
extends Node3D
## Bir noktanın etrafında dönen kamera. Sol tık sürükle: döndür, sağ tık sürükle: kaydır,
## tekerlek: yakınlaş. Dokunmatik kontroller web sürümüyle gelecek.

@export var distance := 220.0
@export var min_distance := 12.0
@export var max_distance := 500.0

var yaw := deg_to_rad(20.0)
var pitch := deg_to_rad(-48.0)
var camera := Camera3D.new()


func _ready() -> void:
	camera.far = 4000.0
	add_child(camera)
	_apply()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if event.button_mask & MOUSE_BUTTON_MASK_LEFT:
			yaw -= event.relative.x * 0.005
			pitch = clampf(pitch - event.relative.y * 0.005, deg_to_rad(-85.0), deg_to_rad(-10.0))
		elif event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
			var pan_speed := distance * 0.002
			position -= Basis(Vector3.UP, yaw) * Vector3(event.relative.x, 0, event.relative.y) * pan_speed
		_apply()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			distance = maxf(min_distance, distance * 0.9)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			distance = minf(max_distance, distance * 1.1)
		_apply()


func _apply() -> void:
	var orbit := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, pitch)
	camera.position = orbit * Vector3(0, 0, distance)
	camera.look_at(global_position)
