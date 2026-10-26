class_name MHash
## Deterministik 32-bit hash. server/mercanada_sim/sim.py ile bit bit aynı sonucu vermeli;
## değiştirirsen ikisini birlikte değiştir ve parite testini çalıştır.

const MASK := 0xFFFFFFFF


## 32-bit çarpım; 64-bit taşmasın diye çarpanı 16-bit parçalara böler.
static func mul32(a: int, b: int) -> int:
	var lo := a * (b & 0xFFFF)
	var hi := ((a * (b >> 16)) & 0xFFFF) << 16
	return (lo + hi) & MASK


static func fnv1a(text: String) -> int:
	var h := 0x811c9dc5
	for byte in text.to_utf8_buffer():
		h = mul32(h ^ byte, 0x01000193)
	return h


## lowbias32 karıştırıcı (Chris Wellons).
static func mix(x: int) -> int:
	x ^= x >> 16
	x = mul32(x, 0x7feb352d)
	x ^= x >> 15
	x = mul32(x, 0x846ca68b)
	x ^= x >> 16
	return x


static func combine(a: int, b: int) -> int:
	return mix(a ^ mul32(b & MASK, 0x9e3779b1))


## Bir sakinin belirli bir konudaki (tag) ve isteğe bağlı gündeki (n) zar atışı.
static func roll(seed: int, tag: String, n: int = 0) -> int:
	return combine(combine(seed, fnv1a(tag)), n)


static func seed_of(handle: String) -> int:
	return fnv1a(normalize_handle(handle))


static func normalize_handle(handle: String) -> String:
	return handle.strip_edges().trim_prefix("@").to_lower()
