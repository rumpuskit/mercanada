extends SceneTree
## Parite testi için örnek çıktı üretir: godot --headless --path game -s tests/parity_vectors.gd -- <gün> <handle>...
## Çıktıyı server/tests/test_parity.py karşılaştırır.


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var day := int(args[0])
	var out := []
	for i in range(1, args.size()):
		var handle: String = args[i]
		var r := {"handle": handle, "seed": MHash.seed_of(handle), "slot": i * 977, "arrived_day": day - i % 60}
		var plans := []
		for d in range(day, day + 7):
			plans.append(ResidentSim.day_plan(r, d))
		out.append({
			"seed": r.seed,
			"address": Address.text(r.slot),
			"job": ResidentSim.job(r).id,
			"workplace": ResidentSim.workplace(r).name,
			"title": ResidentSim.title(r, day),
			"pet": ResidentSim.pet(r, day),
			"hobby": ResidentSim.hobby(r).id,
			"look": ResidentSim.look(r),
			"plans": plans,
		})
	print("PARITY_JSON:" + JSON.stringify(out))
	quit()
