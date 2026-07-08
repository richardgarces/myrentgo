import type { Property } from '@/lib/api'

export const PAYMENT_BANK_OTHER = '__other__'

export type BankOption = { name: string; id: string }

export function resolveBankId(bankName: string, banks: BankOption[]): string {
  if (!bankName) return ''
  const lower = bankName.trim().toLowerCase()
  return banks.find((b) => b.name.trim().toLowerCase() === lower)?.id ?? ''
}

export function isKnownBankName(name: string, options: BankOption[]): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  return options.some((o) => o.name.trim().toLowerCase() === lower)
}

export function paymentBankSelectValue(value: string, options: BankOption[]): string {
  if (!value.trim()) return ''
  if (isKnownBankName(value, options)) return value.trim()
  return PAYMENT_BANK_OTHER
}

type BuildBankOptionsInput = {
  crmBanks?: BankOption[]
  dividendBanks?: { bank_name: string; bank_id?: string }[]
  properties?: Property[]
  statsBanks?: { bank_name: string; bank_id?: string }[]
  extraNames?: string[]
  /** When false, saved property payment_bank values are omitted so custom names use "Otro…". */
  includeSavedPaymentBanks?: boolean
}

export function buildBankOptions({
  crmBanks = [],
  dividendBanks = [],
  properties = [],
  statsBanks = [],
  extraNames = [],
  includeSavedPaymentBanks = false,
}: BuildBankOptionsInput): BankOption[] {
  const byName = new Map<string, BankOption>()
  const add = (name: string, id = '') => {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { name: trimmed, id })
      return
    }
    if (!existing.id && id) byName.set(key, { name: trimmed, id })
  }

  for (const b of crmBanks) add(b.name, b.id)
  for (const b of dividendBanks) add(b.bank_name, b.bank_id ?? '')
  for (const p of properties) {
    if (p.financials?.bank_name) {
      add(p.financials.bank_name, resolveBankId(p.financials.bank_name, crmBanks))
    }
    if (includeSavedPaymentBanks && p.financials?.payment_bank) {
      add(p.financials.payment_bank, resolveBankId(p.financials.payment_bank, crmBanks))
    }
  }
  for (const item of statsBanks) {
    if (item.bank_name) add(item.bank_name, item.bank_id ?? '')
  }
  for (const name of extraNames) add(name)

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
