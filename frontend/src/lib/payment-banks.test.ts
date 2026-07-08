import { describe, expect, it } from 'vitest'
import {
  PAYMENT_BANK_OTHER,
  buildBankOptions,
  isKnownBankName,
  paymentBankSelectValue,
  resolveBankId,
} from '@/lib/payment-banks'

describe('payment-banks', () => {
  const banks = [
    { id: 'banco-1', name: 'Banco de Chile' },
    { id: 'banco-2', name: 'BCI' },
  ]

  it('resolves bank id case-insensitively', () => {
    expect(resolveBankId('banco de chile', banks)).toBe('banco-1')
    expect(resolveBankId('Unknown', banks)).toBe('')
  })

  it('detects known bank names', () => {
    expect(isKnownBankName('BCI', banks)).toBe(true)
    expect(isKnownBankName('Custom Bank', banks)).toBe(false)
    expect(isKnownBankName('', banks)).toBe(true)
  })

  it('maps unknown saved values to other option', () => {
    expect(paymentBankSelectValue('BCI', banks)).toBe('BCI')
    expect(paymentBankSelectValue('Mi banco', banks)).toBe(PAYMENT_BANK_OTHER)
  })

  it('builds deduplicated sorted bank options', () => {
    const options = buildBankOptions({
      crmBanks: banks,
      dividendBanks: [{ bank_name: 'BCI', bank_id: 'banco-2' }],
      properties: [{ id: 'p1', name: 'Depto', financials: { bank_name: 'Banco de Chile' } } as never],
      extraNames: [' Scotiabank '],
    })
    expect(options.map((o) => o.name)).toEqual(['Banco de Chile', 'BCI', 'Scotiabank'])
  })
})
