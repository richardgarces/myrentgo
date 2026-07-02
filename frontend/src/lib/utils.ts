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

export function formatUF(value: number) {
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' UF'
}

export function formatMonthLabel(month: string, locale = 'es-CL'): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  const label = date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', ' ')
}
