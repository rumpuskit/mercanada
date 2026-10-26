class_name CityClock
## Şehir Türkiye saatiyle yaşar (UTC+3, yaz saati yok). Gün numarası 1970'ten beri sayılır.

const TZ_OFFSET := 3 * 3600


static func now_unix() -> float:
	return Time.get_unix_time_from_system()


static func day_of(unix: float) -> int:
	return floori((unix + TZ_OFFSET) / 86400.0)


static func minute_of(unix: float) -> float:
	return fposmod(unix + TZ_OFFSET, 86400.0) / 60.0


## 0 = Pazartesi ... 6 = Pazar (1 Ocak 1970 Perşembe).
static func weekday(day: int) -> int:
	return (day + 3) % 7


static func format_minute(minute: float) -> String:
	var m := int(minute)
	return "%02d:%02d" % [m / 60, m % 60]
