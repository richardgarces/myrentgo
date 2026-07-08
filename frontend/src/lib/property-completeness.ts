import type { Property } from '@/lib/api'

export type CompletenessCategory = 'general' | 'financial' | 'insurance' | 'services' | 'links'

export const COMPLETENESS_CATEGORY_LABELS: Record<CompletenessCategory, string> = {
  general: 'Datos generales',
  financial: 'Crédito / dividendos',
  insurance: 'Seguros',
  services: 'Servicios',
  links: 'Vínculos',
}

type FieldRule = {
  id: string
  label: string
  category: CompletenessCategory
  appliesTo: (type: string) => boolean
  isFilled: (property: Property, allProperties: Property[]) => boolean
}

function hasText(value?: string | null): boolean {
  return Boolean(value?.trim())
}

function hasPositiveNumber(value?: number | null): boolean {
  return typeof value === 'number' && value > 0
}

function ownerApartment(linked: Property, allProperties: Property[]): Property | undefined {
  if (linked.type === 'warehouse') {
    const owner = allProperties.find(
      (p) => p.type === 'apartment' && p.warehouse_property_id === linked.id,
    )
    if (owner) return owner
    if (linked.apartment_property_id) {
      return allProperties.find((p) => p.id === linked.apartment_property_id)
    }
    return undefined
  }
  if (linked.type === 'parking') {
    return allProperties.find(
      (p) => p.type === 'apartment' && p.parking_property_id === linked.id,
    )
  }
  return undefined
}

function desgravamenFilled(property: Property): boolean {
  const policy = property.insurance?.desgravamen
  return hasText(policy?.company) && hasText(policy?.policy_number)
}

const FIELD_RULES: FieldRule[] = [
  {
    id: 'name',
    label: 'Nombre',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.name),
  },
  {
    id: 'owner_name',
    label: 'Dueño',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.owner_name),
  },
  {
    id: 'purpose',
    label: 'Destino',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.purpose),
  },
  {
    id: 'street',
    label: 'Dirección',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.address?.street),
  },
  {
    id: 'commune',
    label: 'Comuna',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.address?.commune),
  },
  {
    id: 'property_rol',
    label: 'Rol de propiedad',
    category: 'general',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.address?.property_rol),
  },
  {
    id: 'value_uf',
    label: 'Valor en UF',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.value_uf),
  },
  {
    id: 'original_loan_uf',
    label: 'Monto original del crédito (UF)',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.original_loan_uf),
  },
  {
    id: 'debt_uf',
    label: 'Deuda UF a la fecha',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.debt_uf),
  },
  {
    id: 'monthly_mortgage_uf',
    label: 'Dividendo mensual (UF)',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.monthly_mortgage_uf),
  },
  {
    id: 'bank_name',
    label: 'Institución del crédito',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.financials?.bank_name),
  },
  {
    id: 'credit_number',
    label: 'Número del crédito',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.financials?.credit_number),
  },
  {
    id: 'loan_term_years',
    label: 'Plazo del crédito (años)',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.loan_term_years),
  },
  {
    id: 'interest_rate',
    label: 'Tasa de interés (%)',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasPositiveNumber(p.financials?.interest_rate),
  },
  {
    id: 'payment_bank',
    label: 'Banco de pago del dividendo',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => hasText(p.financials?.payment_bank),
  },
  {
    id: 'pac_enabled',
    label: 'PAC (pago automático)',
    category: 'financial',
    appliesTo: () => true,
    isFilled: (p) => p.financials?.pac_enabled === true || p.financials?.pac_enabled === false,
  },
  {
    id: 'desgravamen',
    label: 'Seguro desgravamen',
    category: 'insurance',
    appliesTo: (type) => type !== 'parking' && type !== 'warehouse',
    isFilled: desgravamenFilled,
  },
  {
    id: 'water_code',
    label: 'Agua — código cliente',
    category: 'services',
    appliesTo: (type) => type !== 'parking' && type !== 'warehouse',
    isFilled: (p) => hasText(p.utility_accounts?.water?.client_code),
  },
  {
    id: 'electricity_code',
    label: 'Luz — código cliente',
    category: 'services',
    appliesTo: (type) => type !== 'parking' && type !== 'warehouse',
    isFilled: (p) => hasText(p.utility_accounts?.electricity?.client_code),
  },
  {
    id: 'gas_code',
    label: 'Gas — código cliente',
    category: 'services',
    appliesTo: (type) => type !== 'parking' && type !== 'warehouse',
    isFilled: (p) => hasText(p.utility_accounts?.gas?.client_code),
  },
  {
    id: 'unit_number',
    label: 'Número de unidad',
    category: 'links',
    appliesTo: (type) => type === 'apartment' || type === 'parking' || type === 'warehouse',
    isFilled: (p) => hasText(p.unit_number),
  },
  {
    id: 'floor',
    label: 'Piso',
    category: 'links',
    appliesTo: (type) => type === 'apartment',
    isFilled: (p) => hasText(p.floor),
  },
  {
    id: 'associated_apartment',
    label: 'Departamento asociado',
    category: 'links',
    appliesTo: (type) => type === 'parking' || type === 'warehouse',
    isFilled: (p, all) => ownerApartment(p, all) !== undefined,
  },
]

export type PropertyCompletenessResult = {
  property: Property
  applicableFields: FieldRule[]
  filledCount: number
  totalCount: number
  percent: number
  missing: Array<{ id: string; label: string; category: CompletenessCategory }>
  missingByCategory: Partial<Record<CompletenessCategory, string[]>>
}

export function getApplicableRules(type: string): FieldRule[] {
  return FIELD_RULES.filter((rule) => rule.appliesTo(type))
}

export function evaluatePropertyCompleteness(
  property: Property,
  allProperties: Property[],
): PropertyCompletenessResult {
  const applicableFields = getApplicableRules(property.type)
  const missing: PropertyCompletenessResult['missing'] = []
  const missingByCategory: PropertyCompletenessResult['missingByCategory'] = {}

  for (const rule of applicableFields) {
    if (rule.isFilled(property, allProperties)) continue
    missing.push({ id: rule.id, label: rule.label, category: rule.category })
    const list = missingByCategory[rule.category] ?? []
    list.push(rule.label)
    missingByCategory[rule.category] = list
  }

  const totalCount = applicableFields.length
  const filledCount = totalCount - missing.length
  const percent = totalCount === 0 ? 100 : Math.round((filledCount / totalCount) * 100)

  return {
    property,
    applicableFields,
    filledCount,
    totalCount,
    percent,
    missing,
    missingByCategory,
  }
}

export function evaluateAllProperties(
  properties: Property[],
): PropertyCompletenessResult[] {
  return properties.map((property) => evaluatePropertyCompleteness(property, properties))
}

export function completenessColor(percent: number): string {
  if (percent >= 90) return 'text-green-600 dark:text-green-400'
  if (percent >= 70) return 'text-yellow-600 dark:text-yellow-400'
  if (percent >= 50) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

export function completenessBarColor(percent: number): string {
  if (percent >= 90) return 'bg-green-500'
  if (percent >= 70) return 'bg-yellow-500'
  if (percent >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}
