class_name Palette
## Pastel renk paleti. Bütün dünya renkleri buradan gelir.

const SKY_TOP := Color("a7d8f0")
const SKY_HORIZON := Color("f9e6d5")
const NIGHT_SKY_TOP := Color("1f2b4d")
const NIGHT_SKY_HORIZON := Color("4a4f78")
const AMBIENT := Color("e6eef7")
const NIGHT_AMBIENT := Color("3a4670")
const WATER := Color("7cc6d9")
const SAND := Color("ecd6a8")
const GRASS := Color("a8d49a")
const ROAD := Color("e8ddd0")
const PLAZA := Color("efe6f5")

const BUILDINGS: Array[Color] = [
	Color("f2a7b3"), Color("f6cf8e"), Color("a9d6cb"),
	Color("a8c8e8"), Color("c7b3e6"), Color("f3dca0"),
]

const CLOTHES: Array[Color] = [
	Color("e07a8b"), Color("f2a65a"), Color("6cb4a8"), Color("5b8fc7"), Color("9b7fd1"),
	Color("e8c55a"), Color("7fb069"), Color("d97b66"), Color("4f6d7a"), Color("c45baa"),
]


static func material(color: Color, roughness := 0.9) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	return m
