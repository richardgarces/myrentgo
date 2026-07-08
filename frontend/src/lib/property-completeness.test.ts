import { describe, expect, it } from 'vitest'
import type { Property } from '@/lib/api'
import {
  completenessBarColor,
  completenessColor,
  evaluatePropertyCompleteness,
  getApplicableRules,
} from '@/lib/property-completeness'

function minimalProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    organization_id: 'org-1',
    name: 'Depto 101',
    type: 'apartment',
    status: 'available',
    owner_name: 'Owner',
    purpose: 'rent',
    address: {
      street: 'Calle 1',
      commune: 'Santiago',
      property_rol: '123-456',
    },
    financials: {
      value_uf: 5000,
      original_loan_uf: 4000,
      debt_uf: 3000,
      monthly_mortgage_uf: 20,
      bank_name: 'BCI',
      credit_number: 'CR-1',
      loan_term_years: 25,
      interest_rate: 4.5,
      payment_bank: 'BCI',
      pac_enabled: false,
    },
    insurance: {
      desgravamen: { company: 'Seguros X', policy_number: 'POL-1' },
    },
    utility_accounts: {
      water: { client_code: 'W1' },
      electricity: { client_code: 'E1' },
      gas: { client_code: 'G1' },
    },
    unit_number: '101',
    floor: '10',
    ...overrides,
  } as Property
}

describe('property-completeness', () => {
  it('returns fewer rules for parking than apartment', () => {
    expect(getApplicableRules('parking').length).toBeLessThan(getApplicableRules('apartment').length)
  })

  it('scores a fully filled apartment at 100%', () => {
    const property = minimalProperty()
    const result = evaluatePropertyCompleteness(property, [property])
    expect(result.percent).toBe(100)
    expect(result.missing).toHaveLength(0)
  })

  it('lists missing general fields', () => {
    const property = minimalProperty({ owner_name: '', address: { street: 'Calle 1' } as Property['address'] })
    const result = evaluatePropertyCompleteness(property, [property])
    expect(result.missing.some((m) => m.id === 'owner_name')).toBe(true)
    expect(result.percent).toBeLessThan(100)
  })

  it('maps percent to color classes', () => {
    expect(completenessColor(95)).toContain('green')
    expect(completenessBarColor(40)).toContain('red')
  })
})
