export type DurationParts = {
  years: number
  months: number
  days: number
}

export type LeaseTiming = {
  elapsed: DurationParts | null
  remaining: DurationParts | null
  remainingLabel: string
  periodStart?: string
}

function parseDateOnly(value?: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function diffYMD(from: Date, to: Date): DurationParts {
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  let days = to.getDate() - from.getDate()

  if (days < 0) {
    months -= 1
    const prevMonthDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate()
    days += prevMonthDays
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  return { years, months, days }
}

export function formatDurationParts(parts: DurationParts): string {
  const segments: string[] = []
  if (parts.years > 0) {
    segments.push(`${parts.years} ${parts.years === 1 ? 'año' : 'años'}`)
  }
  if (parts.months > 0) {
    segments.push(`${parts.months} ${parts.months === 1 ? 'mes' : 'meses'}`)
  }
  if (parts.days > 0 || segments.length === 0) {
    segments.push(`${parts.days} ${parts.days === 1 ? 'día' : 'días'}`)
  }
  return segments.join(', ')
}

function currentPeriodStart(
  startDate?: string,
  endDate?: string,
  renewalCount?: number,
  renewalPeriodMonths?: number,
): Date | null {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start) return null
  if (!renewalCount || renewalCount <= 0 || !end) return start
  const months = renewalPeriodMonths && renewalPeriodMonths > 0 ? renewalPeriodMonths : 12
  const periodStart = new Date(end)
  periodStart.setMonth(periodStart.getMonth() - months)
  return periodStart
}

export function computeLeaseTiming(
  lease: {
    start_date?: string
    end_date?: string
    auto_renew?: boolean
    renewal_count?: number
    renewal_period_months?: number
  },
  now = new Date(),
): LeaseTiming {
  const today = startOfDay(now)
  const start = parseDateOnly(lease.start_date)
  const end = parseDateOnly(lease.end_date)
  let periodStart = currentPeriodStart(
    lease.start_date,
    lease.end_date,
    lease.renewal_count,
    lease.renewal_period_months,
  )
  if (!periodStart && start) {
    periodStart = start
  }

  let elapsed: DurationParts | null = null
  if (periodStart) {
    if (periodStart <= today) {
      elapsed = diffYMD(periodStart, today)
    } else {
      elapsed = { years: 0, months: 0, days: 0 }
    }
  }

  let remaining: DurationParts | null = null
  let remainingLabel = '—'
  if (end) {
    if (end >= today) {
      remaining = diffYMD(today, end)
      remainingLabel = formatDurationParts(remaining)
    } else if (lease.auto_renew) {
      remainingLabel = 'Vencido — renovación pendiente'
    } else {
      remainingLabel = 'Vencido'
    }
  } else if (start && !end) {
    remainingLabel = 'Sin fecha de término'
  }

  return {
    elapsed,
    remaining,
    remainingLabel,
    periodStart: periodStart?.toISOString().slice(0, 10),
  }
}

export function formatElapsedLabel(timing: LeaseTiming): string {
  if (!timing.elapsed) return '—'
  return formatDurationParts(timing.elapsed)
}
