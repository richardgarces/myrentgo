package syslog

import "time"

var startedAt = time.Now()

func StartedAt() time.Time { return startedAt }

func UptimeSeconds() float64 {
	return time.Since(startedAt).Seconds()
}

func UptimeHuman() string {
	d := time.Since(startedAt)
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	mins := int(d.Minutes()) % 60
	if days > 0 {
		return formatDuration(days, "d", hours, "h", mins, "m")
	}
	if hours > 0 {
		return formatDuration(hours, "h", mins, "m", 0, "")
	}
	return formatDuration(mins, "m", 0, "", 0, "")
}

func formatDuration(a int, aUnit string, b int, bUnit string, c int, cUnit string) string {
	out := ""
	if a > 0 {
		out += itoaUint(uint64(a)) + aUnit
	}
	if b > 0 && bUnit != "" {
		if out != "" {
			out += " "
		}
		out += itoaUint(uint64(b)) + bUnit
	}
	if c > 0 && cUnit != "" {
		if out != "" {
			out += " "
		}
		out += itoaUint(uint64(c)) + cUnit
	}
	if out == "" {
		return "0m"
	}
	return out
}

func itoaUint(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
