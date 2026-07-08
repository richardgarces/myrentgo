import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount)
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-CL').format(new Date(date))
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(date))
}

export function formatUF(value: number) {
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' UF'
}

/** Label for parking/warehouse in dropdowns and linked-property references. */
export function propertyLinkLabel(p: {
  name: string
  type?: string
  unit_number?: string
  address?: { property_rol?: string }
}): string {
  const unit = p.unit_number?.trim()
  const rol = p.address?.property_rol?.trim()
  let label = p.name
  if (unit && (p.type === 'parking' || p.type === 'warehouse')) {
    label += ` N° ${unit}`
  }
  if (rol) {
    label += ` (Rol ${rol})`
  }
  return label
}

export function formatMonthLabel(month: string, locale = 'es-CL'): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  const label = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', ' ')
}

export function hasMortgageCredit(financials?: {
  monthly_mortgage_uf?: number
  debt_uf?: number
  bank_name?: string
}): boolean {
  if (!financials) return false
  if ((financials.monthly_mortgage_uf ?? 0) > 0) return true
  return (financials.debt_uf ?? 0) > 0 && Boolean(financials.bank_name?.trim())
}

export function dividendDueDateForMonth(month: string, paymentStartDate?: string): string {
  const [year, m] = month.split('-').map(Number)
  let day = 5
  if (paymentStartDate) {
    const parsed = new Date(paymentStartDate)
    if (!Number.isNaN(parsed.getTime())) {
      day = parsed.getUTCDate()
    }
  }
  const lastDay = new Date(year, m, 0).getDate()
  if (day < 1) day = 5
  if (day > lastDay) day = lastDay
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
