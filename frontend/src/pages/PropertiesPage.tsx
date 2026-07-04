import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams, Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Plus, Search, Star, X } from 'lucide-react'
import { PacBadge, pacCardAccentClassName } from '@/components/PacBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { LoadingSkeleton } from '@/components/ui/page'
import { api, type Document as PropertyDocument, type Lease, type Property, type PropertyPhoto } from '@/lib/api'
import { cn, formatDate, formatUF, propertyLinkLabel } from '@/lib/utils'
import {
  CHILE_REGIONS,
  DEFAULT_COMMUNE,
  DEFAULT_REGION,
  getCityForCommune,
  getCommunesForRegion,
  isCommuneInRegion,
} from '@/data/chile-regions'

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rented: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  for_sale: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

const typeLabels: Record<string, string> = {
  house: 'Casa', apartment: 'Departamento', land: 'Terreno',
  warehouse: 'Bodega', office: 'Oficina', parking: 'Estacionamiento',
}

const purposeLabels: Record<string, string> = {
  live: 'Para vivir',
  rent: 'Para arrendar',
  vacation: 'Para vacacionar',
  construction: 'Destinado para construir',
  other: 'Otro',
}

const statusLabels: Record<string, string> = {
  available: 'Disponible',
  rented: 'Arrendada',
  maintenance: 'Mantenimiento',
  for_sale: 'No disponible',
}

function leasedPropertyIds(leases: Lease[]): Set<string> {
  const ids = new Set<string>()
  for (const lease of leases) {
    if (lease.status !== 'active') continue
    ids.add(lease.property_id)
    if (lease.warehouse_property_id) ids.add(lease.warehouse_property_id)
    if (lease.parking_property_id) ids.add(lease.parking_property_id)
  }
  return ids
}

function isAvailableForRent(property: Property, leasedIds: Set<string>): boolean {
  return property.purpose === 'rent' && !leasedIds.has(property.id)
}

function getPropertyDisplayStatus(property: Property, leasedIds: Set<string>): string {
  if (property.status === 'maintenance' || property.status === 'for_sale') {
    return property.status
  }
  if (leasedIds.has(property.id)) {
    return 'rented'
  }
  if (property.purpose === 'rent') {
    return 'available'
  }
  return property.status || 'available'
}

function isAvailableFilterActive(searchParams: URLSearchParams): boolean {
  return searchParams.get('disponibles') === '1' || searchParams.get('filter') === 'available'
}

type PropertyFilters = {
  tipo: string
  estado: '' | 'disponibles' | 'arrendadas'
  destino: string
  q: string
}

const PROPERTY_TYPES = ['apartment', 'parking', 'warehouse', 'house', 'office', 'land'] as const

const PURPOSE_OPTIONS = ['rent', 'live', 'vacation', 'construction', 'other'] as const

function parseFiltersFromURL(searchParams: URLSearchParams): PropertyFilters {
  let estado: PropertyFilters['estado'] = ''
  const estadoParam = searchParams.get('estado')
  if (estadoParam === 'disponibles' || estadoParam === 'arrendadas') {
    estado = estadoParam
  } else if (isAvailableFilterActive(searchParams)) {
    estado = 'disponibles'
  }

  const tipo = searchParams.get('tipo') ?? ''
  const validTipo = PROPERTY_TYPES.includes(tipo as (typeof PROPERTY_TYPES)[number]) ? tipo : ''

  const destino = searchParams.get('destino') ?? ''
  const validDestino = PURPOSE_OPTIONS.includes(destino as (typeof PURPOSE_OPTIONS)[number]) ? destino : ''

  return {
    tipo: validTipo,
    estado,
    destino: validDestino,
    q: searchParams.get('q') ?? '',
  }
}

function filtersToSearchParams(filters: PropertyFilters): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.tipo) next.set('tipo', filters.tipo)
  if (filters.estado) next.set('estado', filters.estado)
  if (filters.destino) next.set('destino', filters.destino)
  const q = filters.q.trim()
  if (q) next.set('q', q)
  return next
}

function countActiveFilters(filters: PropertyFilters): number {
  let count = 0
  if (filters.tipo) count++
  if (filters.estado) count++
  if (filters.destino) count++
  if (filters.q.trim()) count++
  return count
}

function matchesPropertySearch(property: Property, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    property.name,
    property.owner_name,
    property.address?.street,
    property.address?.commune,
    property.address?.city,
    property.address?.property_rol,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

function applyPropertyFilters(
  properties: Property[],
  filters: PropertyFilters,
  leasedIds: Set<string>,
  options?: { skipTipo?: boolean },
): Property[] {
  return properties.filter((property) => {
    if (!options?.skipTipo && filters.tipo && property.type !== filters.tipo) return false
    if (filters.estado === 'disponibles' && !isAvailableForRent(property, leasedIds)) return false
    if (filters.estado === 'arrendadas' && !leasedIds.has(property.id)) return false
    if (filters.destino && (property.purpose ?? '') !== filters.destino) return false
    if (!matchesPropertySearch(property, filters.q)) return false
    return true
  })
}

const SIN_COMUNA = 'Sin comuna'
const EXPAND_ALL_COMMUNE_THRESHOLD = 5

function getCommuneGroup(p: Property): string {
  const commune = p.address?.commune?.trim()
  if (commune) return commune
  return SIN_COMUNA
}

function groupPropertiesByType(properties: Property[]): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of properties) {
    counts.set(p.type, (counts.get(p.type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => {
      const byCount = b.count - a.count
      if (byCount !== 0) return byCount
      return (typeLabels[a.type] ?? a.type).localeCompare(typeLabels[b.type] ?? b.type, 'es')
    })
}

function groupPropertiesByCommune(properties: Property[]): { commune: string; properties: Property[] }[] {
  const groups = new Map<string, Property[]>()
  for (const p of properties) {
    const commune = getCommuneGroup(p)
    const list = groups.get(commune) ?? []
    list.push(p)
    groups.set(commune, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === SIN_COMUNA) return 1
      if (b === SIN_COMUNA) return -1
      return a.localeCompare(b, 'es')
    })
    .map(([commune, props]) => ({ commune, properties: props }))
}

function defaultExpandedCommunes(communes: string[]): Set<string> {
  if (communes.length <= EXPAND_ALL_COMMUNE_THRESHOLD) return new Set(communes)
  return communes.length > 0 ? new Set([communes[0]]) : new Set()
}

const MAX_PHOTOS = 10

const documentCategoryLabels: Record<string, string> = {
  deed: 'Escritura',
  contract: 'Contrato',
  certificate: 'Certificado',
  other: 'Otro',
}

type PendingDocument = {
  localId: string
  title: string
  category: string
  file_name: string
  file_data: string
  mime_type: string
  size_bytes: number
}

function mimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  return match?.[1] ?? 'application/octet-stream'
}

function PropertyDocumentsSection({
  propertyId,
  pendingDocs,
  onPendingChange,
}: {
  propertyId: string | null
  pendingDocs: PendingDocument[]
  onPendingChange: (docs: PendingDocument[]) => void
}) {
  const qc = useQueryClient()
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('deed')
  const [fileError, setFileError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const currentTitle = () => (titleInputRef.current?.value ?? title).trim()

  const { data: existingDocs, refetch } = useQuery({
    queryKey: ['documents', 'property', propertyId],
    queryFn: () => api.getDocuments(1, { entity_type: 'property', entity_id: propertyId! }),
    enabled: !!propertyId,
  })

  const readFile = (file: File, docTitle: string, docCategory: string): Promise<PendingDocument> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const file_data = reader.result as string
        resolve({
          localId: crypto.randomUUID(),
          title: docTitle,
          category: docCategory,
          file_name: file.name,
          file_data,
          mime_type: mimeFromDataUrl(file_data),
          size_bytes: file.size,
        })
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const resetForm = () => {
    setTitle('')
    setCategory('deed')
    setFileError(null)
  }

  const addDocument = async (file: File) => {
    const docTitle = currentTitle()
    if (!docTitle) {
      setFileError('Ingresa el nombre del documento')
      return
    }
    setFileError(null)
    setAdding(true)
    try {
      const doc = await readFile(file, docTitle, category)
      if (propertyId) {
        await api.createDocument({
          entity_type: 'property',
          entity_id: propertyId,
          category: doc.category,
          title: doc.title,
          file_name: doc.file_name,
          file_data: doc.file_data,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
        })
        await refetch()
        qc.invalidateQueries({ queryKey: ['documents'] })
      } else {
        onPendingChange([...pendingDocs, doc])
      }
      resetForm()
    } catch (err) {
      setFileError((err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const deleteExisting = async (doc: PropertyDocument) => {
    setDeletingId(doc.id)
    try {
      await api.deleteDocument(doc.id)
      await refetch()
      qc.invalidateQueries({ queryKey: ['documents'] })
    } finally {
      setDeletingId(null)
    }
  }

  const docs = existingDocs?.data ?? []

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nombre del documento">
          <Input
            ref={titleInputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (fileError) setFileError(null)
            }}
            placeholder="Ej: Escritura del departamento"
          />
        </FormField>
        <FormField label="Categoría">
          <FormSelect value={category} onChange={(e) => { setCategory(e.target.value); if (fileError) setFileError(null) }}>
            <option value="deed">Escritura</option>
            <option value="contract">Contrato</option>
            <option value="certificate">Certificado</option>
            <option value="other">Otro</option>
          </FormSelect>
        </FormField>
      </div>
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className="sr-only"
            disabled={adding}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void addDocument(file)
              e.target.value = ''
            }}
          />
          <span className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            {adding ? 'Subiendo…' : 'Seleccionar archivo'}
          </span>
        </label>
        <p className="text-xs text-muted-foreground">PDF, Word o imagen</p>
      </div>
      {fileError && <p className="text-sm text-destructive">{fileError}</p>}

      {(docs.length > 0 || pendingDocs.length > 0) && (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {documentCategoryLabels[doc.category] || doc.category} · {doc.file_name}
                </p>
              </div>
              {doc.file_data && (
                <a
                  href={doc.file_data}
                  download={doc.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ver
                </a>
              )}
              <button
                type="button"
                title="Eliminar documento"
                disabled={deletingId === doc.id}
                onClick={() => void deleteExisting(doc)}
                className="p-1 rounded text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {pendingDocs.map((doc) => (
            <li key={doc.localId} className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {documentCategoryLabels[doc.category] || doc.category} · {doc.file_name} (pendiente)
                </p>
              </div>
              <button
                type="button"
                title="Quitar documento"
                onClick={() => onPendingChange(pendingDocs.filter((d) => d.localId !== doc.localId))}
                className="p-1 rounded text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const emptyForm = {
  name: '', type: 'apartment', purpose: '', purpose_other: '',
  street: '', region: DEFAULT_REGION, commune: DEFAULT_COMMUNE,
  owner_name: '', property_rol: '', fojas: '', parking_property_id: '', warehouse_property_id: '',
  value_uf: '', debt_uf: '', original_loan_uf: '', monthly_mortgage_uf: '',
  loan_term_years: '', installments_paid: '', interest_rate: '', bank_name: '', credit_number: '', payment_start_date: '',
  pac_enabled: false, payment_bank: '',
  unit_number: '', floor: '', area_m2: '',
  concierge_email: '', concierge_phone: '', butler_name: '', administration: '',
  administration_email: '', administration_phone: '',
  water_company: '', water_client_code: '',
  electricity_company: '', electricity_client_code: '',
  gas_company: '', gas_client_code: '',
  fire_insurance_company: '', fire_insurance_amount_uf: '', fire_insurance_policy_number: '',
  earthquake_insurance_company: '', earthquake_insurance_amount_uf: '', earthquake_insurance_policy_number: '',
  desgravamen_insurance_company: '', desgravamen_insurance_amount_uf: '', desgravamen_insurance_policy_number: '',
  photos: [] as PropertyPhoto[],
}

const emptyUtilityFields = {
  water_company: '',
  water_client_code: '',
  electricity_company: '',
  electricity_client_code: '',
  gas_company: '',
  gas_client_code: '',
}

const emptyInsuranceFields = {
  fire_insurance_company: '',
  fire_insurance_amount_uf: '',
  fire_insurance_policy_number: '',
  earthquake_insurance_company: '',
  earthquake_insurance_amount_uf: '',
  earthquake_insurance_policy_number: '',
  desgravamen_insurance_company: '',
  desgravamen_insurance_amount_uf: '',
  desgravamen_insurance_policy_number: '',
}

type PropertyForm = typeof emptyForm

function handleRegionChange(form: PropertyForm, region: string) {
  const communes = getCommunesForRegion(region)
  const commune = isCommuneInRegion(region, form.commune) ? form.commune : communes[0] ?? ''
  return { ...form, region, commune }
}

function propertyToForm(p: Property, allProperties: Property[] = []): PropertyForm {
  const storedRegion = p.address?.region ?? ''
  const region = storedRegion && CHILE_REGIONS.some((r) => r.name === storedRegion)
    ? storedRegion
    : DEFAULT_REGION
  const storedCommune = p.address?.commune ?? ''
  const commune = storedCommune && isCommuneInRegion(region, storedCommune)
    ? storedCommune
    : getCommunesForRegion(region)[0] ?? DEFAULT_COMMUNE

  let warehousePropertyId = p.warehouse_property_id ?? ''
  if (p.type === 'apartment' && !warehousePropertyId) {
    const legacyWarehouse = allProperties.find(
      (wh) => wh.type === 'warehouse' && wh.apartment_property_id === p.id,
    )
    if (legacyWarehouse) warehousePropertyId = legacyWarehouse.id
  }

  return {
    name: p.name,
    type: p.type,
    purpose: p.purpose ?? 'rent',
    purpose_other: p.purpose_other ?? '',
    street: p.address?.street ?? '',
    region,
    commune,
    owner_name: p.owner_name ?? '',
    property_rol: p.address?.property_rol ?? '',
    fojas: p.deed?.fojas ?? '',
    parking_property_id: p.parking_property_id ?? '',
    warehouse_property_id: warehousePropertyId,
    value_uf: p.financials?.value_uf ? String(p.financials.value_uf) : '',
    debt_uf: p.financials?.debt_uf ? String(p.financials.debt_uf) : '',
    original_loan_uf: p.financials?.original_loan_uf ? String(p.financials.original_loan_uf) : '',
    monthly_mortgage_uf: p.financials?.monthly_mortgage_uf
      ? String(p.financials.monthly_mortgage_uf)
      : '',
    loan_term_years: p.financials?.loan_term_years ? String(p.financials.loan_term_years) : '',
    installments_paid: p.financials?.installments_paid ? String(p.financials.installments_paid) : '',
    interest_rate: p.financials?.interest_rate ? String(p.financials.interest_rate) : '',
    bank_name: p.financials?.bank_name ?? '',
    credit_number: p.financials?.credit_number ?? '',
    pac_enabled: p.financials?.pac_enabled ?? false,
    payment_bank: p.financials?.payment_bank ?? '',
    payment_start_date: p.financials?.payment_start_date
      ? p.financials.payment_start_date.slice(0, 10)
      : '',
    unit_number: p.unit_number ?? '',
    floor: p.floor ?? '',
    area_m2: p.area_m2 ? String(p.area_m2) : '',
    concierge_email: p.concierge?.email ?? '',
    concierge_phone: p.concierge?.phone ?? '',
    butler_name: p.concierge?.butler_name ?? '',
    administration: p.concierge?.administration ?? '',
    administration_email: p.concierge?.administration_email ?? '',
    administration_phone: p.concierge?.administration_phone ?? '',
    water_company: p.utility_accounts?.water?.company ?? '',
    water_client_code: p.utility_accounts?.water?.client_code ?? '',
    electricity_company: p.utility_accounts?.electricity?.company ?? '',
    electricity_client_code: p.utility_accounts?.electricity?.client_code ?? '',
    gas_company: p.utility_accounts?.gas?.company ?? '',
    gas_client_code: p.utility_accounts?.gas?.client_code ?? '',
    fire_insurance_company: p.insurance?.fire?.company ?? '',
    fire_insurance_amount_uf: p.insurance?.fire?.amount_uf
      ? String(p.insurance.fire.amount_uf)
      : '',
    fire_insurance_policy_number: p.insurance?.fire?.policy_number ?? '',
    earthquake_insurance_company: p.insurance?.earthquake?.company ?? '',
    earthquake_insurance_amount_uf: p.insurance?.earthquake?.amount_uf
      ? String(p.insurance.earthquake.amount_uf)
      : '',
    earthquake_insurance_policy_number: p.insurance?.earthquake?.policy_number ?? '',
    desgravamen_insurance_company: p.insurance?.desgravamen?.company ?? '',
    desgravamen_insurance_amount_uf: p.insurance?.desgravamen?.amount_uf
      ? String(p.insurance.desgravamen.amount_uf)
      : '',
    desgravamen_insurance_policy_number: p.insurance?.desgravamen?.policy_number ?? '',
    photos: (p.photos ?? []).map((ph) => ({
      url: ph.url,
      caption: ph.caption ?? '',
      is_primary: ph.is_primary,
    })),
  }
}

function formToPayload(form: PropertyForm) {
  return {
    name: form.name,
    type: form.type,
    purpose: form.purpose,
    purpose_other: form.purpose === 'other' ? (form.purpose_other || undefined) : undefined,
    street: form.street,
    commune: form.commune,
    city: getCityForCommune(form.region, form.commune),
    region: form.region,
    owner_name: form.owner_name || undefined,
    property_rol: form.property_rol || undefined,
    fojas: form.fojas || undefined,
    ...(form.type === 'apartment' ? {
      parking_property_id: form.parking_property_id || undefined,
      warehouse_property_id: form.warehouse_property_id || undefined,
    } : form.type !== 'warehouse' && form.type !== 'parking' ? {
      parking_property_id: form.parking_property_id || undefined,
    } : {}),
    value_uf: form.value_uf ? Number(form.value_uf) : undefined,
    debt_uf: form.debt_uf ? Number(form.debt_uf) : undefined,
    original_loan_uf: form.original_loan_uf ? Number(form.original_loan_uf) : undefined,
    monthly_mortgage_uf: form.monthly_mortgage_uf ? Number(form.monthly_mortgage_uf) : undefined,
    loan_term_years: form.loan_term_years ? Number(form.loan_term_years) : undefined,
    installments_paid: form.installments_paid ? Number(form.installments_paid) : undefined,
    interest_rate: form.interest_rate ? Number(form.interest_rate) : undefined,
    bank_name: form.bank_name || undefined,
    credit_number: form.credit_number || undefined,
    pac_enabled: form.pac_enabled,
    payment_bank: form.payment_bank || undefined,
    payment_start_date: form.payment_start_date || undefined,
    area_m2: form.area_m2 ? Number(form.area_m2) : undefined,
    ...(form.type !== 'warehouse' && form.type !== 'parking' ? {
      water_company: form.water_company || undefined,
      water_client_code: form.water_client_code || undefined,
      electricity_company: form.electricity_company || undefined,
      electricity_client_code: form.electricity_client_code || undefined,
      gas_company: form.gas_company || undefined,
      gas_client_code: form.gas_client_code || undefined,
      fire_insurance_company: form.fire_insurance_company || undefined,
      fire_insurance_amount_uf: form.fire_insurance_amount_uf
        ? Number(form.fire_insurance_amount_uf)
        : undefined,
      fire_insurance_policy_number: form.fire_insurance_policy_number || undefined,
      earthquake_insurance_company: form.earthquake_insurance_company || undefined,
      earthquake_insurance_amount_uf: form.earthquake_insurance_amount_uf
        ? Number(form.earthquake_insurance_amount_uf)
        : undefined,
      earthquake_insurance_policy_number: form.earthquake_insurance_policy_number || undefined,
      desgravamen_insurance_company: form.desgravamen_insurance_company || undefined,
      desgravamen_insurance_amount_uf: form.desgravamen_insurance_amount_uf
        ? Number(form.desgravamen_insurance_amount_uf)
        : undefined,
      desgravamen_insurance_policy_number: form.desgravamen_insurance_policy_number || undefined,
    } : {}),
    photos: form.photos.map((ph) => ({
      url: ph.url,
      caption: ph.caption || undefined,
      is_primary: ph.is_primary,
    })),
    ...(form.type === 'apartment' ? {
      unit_number: form.unit_number || undefined,
      floor: form.floor || undefined,
      concierge_email: form.concierge_email || undefined,
      concierge_phone: form.concierge_phone || undefined,
      butler_name: form.butler_name || undefined,
      administration: form.administration || undefined,
      administration_email: form.administration_email || undefined,
      administration_phone: form.administration_phone || undefined,
    } : {}),
    ...(form.type === 'warehouse' || form.type === 'parking' ? {
      unit_number: form.unit_number || undefined,
    } : {}),
  }
}

function formatUtilityLine(label: string, account?: { company?: string; client_code?: string }): string | null {
  if (!account?.company && !account?.client_code) return null
  const parts: string[] = []
  if (account.company) parts.push(account.company)
  if (account.client_code) parts.push(`cód. ${account.client_code}`)
  return `${label}: ${parts.join(', ')}`
}

function formatInsuranceLine(label: string, policy?: { company?: string; amount_uf?: number; policy_number?: string }): string | null {
  if (!policy?.company && !(policy?.amount_uf ?? 0) && !policy?.policy_number) return null
  const parts: string[] = []
  if (policy?.company) parts.push(policy.company)
  const amount = policy?.amount_uf ?? 0
  if (amount > 0) parts.push(formatUF(amount))
  if (policy?.policy_number) parts.push(`póliza ${policy.policy_number}`)
  return `${label}: ${parts.join(', ')}`
}

function FormSection({ title }: { title: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2 border-t">{title}</p>
}

function primaryPhotoUrl(photos?: PropertyPhoto[]): string | undefined {
  if (!photos?.length) return undefined
  return photos.find((ph) => ph.is_primary)?.url ?? photos[0]?.url
}

function PropertyPhotosSection({
  photos,
  onChange,
}: {
  photos: PropertyPhoto[]
  onChange: (photos: PropertyPhoto[]) => void
}) {
  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) return

    const toRead = Array.from(files).slice(0, remaining)
    const added: PropertyPhoto[] = [...photos]
    let index = 0

    const readNext = () => {
      if (index >= toRead.length) {
        setPhotos(added)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        added.push({ url: reader.result as string, caption: '', is_primary: false })
        index++
        readNext()
      }
      reader.readAsDataURL(toRead[index])
    }
    readNext()
  }

  const setPhotos = (next: PropertyPhoto[]) => {
    if (next.length > 0 && !next.some((ph) => ph.is_primary)) {
      next[0] = { ...next[0], is_primary: true }
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {photos.length}/{MAX_PHOTOS} imágenes
        </p>
        {photos.length < MAX_PHOTOS && (
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <span className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
              Agregar imágenes
            </span>
          </label>
        )}
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((ph, idx) => (
            <div key={`${ph.url.slice(0, 32)}-${idx}`} className="relative group rounded-md border overflow-hidden bg-muted">
              <img src={ph.url} alt={ph.caption || `Imagen ${idx + 1}`} className="h-24 w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 px-1 py-0.5">
                <button
                  type="button"
                  title={ph.is_primary ? 'Imagen principal' : 'Marcar como principal'}
                  onClick={() => setPhotos(photos.map((p, i) => ({ ...p, is_primary: i === idx })))}
                  className={cn(
                    'p-1 rounded',
                    ph.is_primary ? 'text-yellow-400' : 'text-white/70 hover:text-white',
                  )}
                >
                  <Star className={cn('h-4 w-4', ph.is_primary && 'fill-current')} />
                </button>
                <button
                  type="button"
                  title="Eliminar imagen"
                  onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                  className="p-1 rounded text-white/70 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfirmDialog({
  open,
  title,
  message,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  message: string
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function getOwnerApartment(linked: Property, allProperties: Property[]): Property | undefined {
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

function linkedApartmentLabel(apt: Property): string {
  if (apt.unit_number) {
    return `${apt.name} - Depto ${apt.unit_number}`
  }
  return apt.name
}

function availableWarehousesForApartment(
  warehouses: Property[],
  allProperties: Property[],
  apartmentId: string | null,
  currentWarehouseId: string,
): Property[] {
  const assignedElsewhere = new Set<string>()
  for (const p of allProperties) {
    if (p.type === 'apartment' && p.warehouse_property_id && p.id !== apartmentId) {
      assignedElsewhere.add(p.warehouse_property_id)
    }
  }
  for (const wh of warehouses) {
    if (wh.apartment_property_id && wh.apartment_property_id !== apartmentId) {
      assignedElsewhere.add(wh.id)
    }
  }
  return warehouses.filter((wh) => !assignedElsewhere.has(wh.id) || wh.id === currentWarehouseId)
}

function availableParkingForProperty(
  parkingLots: Property[],
  allProperties: Property[],
  ownerPropertyId: string | null,
  currentParkingId: string,
): Property[] {
  const assignedElsewhere = new Set<string>()
  for (const p of allProperties) {
    if (p.parking_property_id && p.id !== ownerPropertyId) {
      assignedElsewhere.add(p.parking_property_id)
    }
  }
  return parkingLots.filter((pk) => !assignedElsewhere.has(pk.id) || pk.id === currentParkingId)
}

function PropertyFormFields({
  form,
  setForm,
  parkingLots,
  warehouses,
  allProperties,
  propertyId,
  pendingDocuments,
  onPendingDocumentsChange,
}: {
  form: PropertyForm
  setForm: (form: PropertyForm) => void
  parkingLots?: { data: Property[] }
  warehouses?: { data: Property[] }
  allProperties: Property[]
  propertyId: string | null
  pendingDocuments: PendingDocument[]
  onPendingDocumentsChange: (docs: PendingDocument[]) => void
}) {
  const selectableWarehouses = form.type === 'apartment'
    ? availableWarehousesForApartment(
        warehouses?.data ?? [],
        allProperties,
        propertyId,
        form.warehouse_property_id,
      )
    : []

  const selectableParking = form.type !== 'parking' && form.type !== 'warehouse'
    ? availableParkingForProperty(
        parkingLots?.data ?? [],
        allProperties,
        propertyId,
        form.parking_property_id,
      )
    : []

  const currentProperty = propertyId
    ? allProperties.find((p) => p.id === propertyId)
    : undefined
  const ownerApartment = currentProperty && (form.type === 'warehouse' || form.type === 'parking')
    ? getOwnerApartment(currentProperty, allProperties)
    : undefined

  return (
    <>
      <FormSection title="Datos generales" />
      <FormField label="Nombre"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Depto Tarapacá" /></FormField>
      <FormField label="Dueño"><Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Nombre del propietario" /></FormField>
      <FormField label="Tipo">
        <FormSelect value={form.type} onChange={(e) => {
          const type = e.target.value
          setForm({
            ...form,
            type,
            ...(type === 'warehouse' || type === 'parking' ? {
              parking_property_id: '', warehouse_property_id: '', ...emptyUtilityFields, ...emptyInsuranceFields,
            } : {}),
            ...(type !== 'apartment' ? { warehouse_property_id: '' } : {}),
          })
        }}>
          <option value="apartment">Departamento</option><option value="house">Casa</option><option value="parking">Estacionamiento</option>
          <option value="office">Oficina</option><option value="warehouse">Bodega</option><option value="land">Terreno</option>
        </FormSelect>
      </FormField>
      <FormField label="Destino de la propiedad">
        <FormSelect required value={form.purpose} onChange={(e) => {
          const purpose = e.target.value
          setForm({
            ...form,
            purpose,
            ...(purpose !== 'other' ? { purpose_other: '' } : {}),
          })
        }}>
          <option value="" disabled>Seleccionar destino</option>
          <option value="live">Para vivir</option>
          <option value="rent">Para arrendar</option>
          <option value="vacation">Para vacacionar</option>
          <option value="construction">Destinado para construir</option>
          <option value="other">Otro</option>
        </FormSelect>
      </FormField>
      {form.purpose === 'other' && (
        <FormField label="Indicar motivo">
          <Input
            required
            value={form.purpose_other}
            onChange={(e) => setForm({ ...form, purpose_other: e.target.value })}
            placeholder="Describe el destino de la propiedad"
          />
        </FormField>
      )}

      {form.type === 'warehouse' && (
        <>
          <FormSection title="Bodega" />
          <FormField label="Número de bodega">
            <Input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} placeholder="B-12" />
          </FormField>
          {ownerApartment && (
            <FormField label="Departamento asociado">
              <Input readOnly disabled value={linkedApartmentLabel(ownerApartment)} className="bg-muted" />
            </FormField>
          )}
        </>
      )}

      {form.type === 'parking' && (
        <>
          <FormSection title="Estacionamiento" />
          <FormField label="Número de estacionamiento">
            <Input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} placeholder="E-45" />
          </FormField>
          {ownerApartment && (
            <FormField label="Departamento asociado">
              <Input readOnly disabled value={linkedApartmentLabel(ownerApartment)} className="bg-muted" />
            </FormField>
          )}
        </>
      )}

      {form.type === 'apartment' && (
        <>
          <FormSection title="Departamento" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Número de departamento">
              <Input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} placeholder="1204" />
            </FormField>
            <FormField label="Piso (nivel)">
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="12" />
            </FormField>
          </div>
          <FormField label="Superficie (m²)">
            <Input type="number" step="any" min="0" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} placeholder="65.5" />
          </FormField>
          <FormSection title="Conserjería / Administración" />
          <FormField label="Email conserjería">
            <Input type="email" value={form.concierge_email} onChange={(e) => setForm({ ...form, concierge_email: e.target.value })} placeholder="conserjeria@edificio.cl" />
          </FormField>
          <FormField label="Teléfono conserjería">
            <Input value={form.concierge_phone} onChange={(e) => setForm({ ...form, concierge_phone: e.target.value })} placeholder="+56 9 1234 5678" />
          </FormField>
          <FormField label="Mayordomo">
            <Input value={form.butler_name} onChange={(e) => setForm({ ...form, butler_name: e.target.value })} placeholder="Nombre del mayordomo" />
          </FormField>
          <FormField label="Administración">
            <Input value={form.administration} onChange={(e) => setForm({ ...form, administration: e.target.value })} placeholder="Empresa de administración" />
          </FormField>
          <FormField label="Email administración">
            <Input type="email" value={form.administration_email} onChange={(e) => setForm({ ...form, administration_email: e.target.value })} placeholder="admin@edificio.cl" />
          </FormField>
          <FormField label="Teléfono administración">
            <Input value={form.administration_phone} onChange={(e) => setForm({ ...form, administration_phone: e.target.value })} placeholder="+56 2 2345 6789" />
          </FormField>
          <FormSection title="Bodega" />
          <FormField label="Vincular bodega">
            <FormSelect value={form.warehouse_property_id} onChange={(e) => setForm({ ...form, warehouse_property_id: e.target.value })}>
              <option value="">Sin bodega</option>
              {selectableWarehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {propertyLinkLabel(wh)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          {selectableWarehouses.length === 0 && !(warehouses?.data?.length) && (
            <p className="text-xs text-muted-foreground">Crea primero una bodega (tipo Bodega) para poder vincularla.</p>
          )}
          {selectableWarehouses.length === 0 && (warehouses?.data?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">Todas las bodegas están vinculadas a otros departamentos.</p>
          )}
        </>
      )}

      <FormSection title="Ubicación y rol" />
      <FormField label="Dirección"><Input required value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></FormField>
      <FormField label="Región">
        <FormSelect required value={form.region} onChange={(e) => setForm(handleRegionChange(form, e.target.value))}>
          {CHILE_REGIONS.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </FormSelect>
      </FormField>
      <FormField label="Comuna">
        <FormSelect
          required
          value={form.commune}
          onChange={(e) => setForm({ ...form, commune: e.target.value })}
        >
          {getCommunesForRegion(form.region).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </FormSelect>
      </FormField>
      <FormField label="Rol de propiedad"><Input value={form.property_rol} onChange={(e) => setForm({ ...form, property_rol: e.target.value })} placeholder="12345-6" /></FormField>
      <FormField label="Fojas (escritura)"><Input value={form.fojas} onChange={(e) => setForm({ ...form, fojas: e.target.value })} placeholder="Ej: 1234, N° 567, año 2018" /></FormField>

      {form.type !== 'parking' && form.type !== 'warehouse' && (
        <>
          <FormSection title="Estacionamiento" />
          <FormField label="Vincular estacionamiento">
            <FormSelect value={form.parking_property_id} onChange={(e) => setForm({ ...form, parking_property_id: e.target.value })}>
              <option value="">Sin estacionamiento</option>
              {selectableParking.map((pk) => (
                <option key={pk.id} value={pk.id}>
                  {propertyLinkLabel(pk)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          {selectableParking.length === 0 && !(parkingLots?.data?.length) && (
            <p className="text-xs text-muted-foreground">Crea primero un estacionamiento (tipo Estacionamiento) para poder vincularlo.</p>
          )}
          {selectableParking.length === 0 && (parkingLots?.data?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">Todos los estacionamientos están vinculados a otras propiedades.</p>
          )}
        </>
      )}

      <FormSection title="Crédito hipotecario (UF / dividendo)" />
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Valor en UF"><Input type="number" step="any" min="0" value={form.value_uf} onChange={(e) => setForm({ ...form, value_uf: e.target.value })} placeholder="2500" /></FormField>
        <FormField label="Monto original del crédito (UF)"><Input type="number" step="any" min="0" value={form.original_loan_uf} onChange={(e) => setForm({ ...form, original_loan_uf: e.target.value })} placeholder="2000" /></FormField>
        <FormField label="Deuda UF a la fecha"><Input type="number" step="any" min="0" value={form.debt_uf} onChange={(e) => setForm({ ...form, debt_uf: e.target.value })} placeholder="1800" /></FormField>
      </div>
      <FormField label="Fecha de compra (inicio de pago)">
        <Input type="date" value={form.payment_start_date} onChange={(e) => setForm({ ...form, payment_start_date: e.target.value })} />
      </FormField>
      <FormField label="Dividendo mensual (UF)"><Input type="number" step="any" min="0" value={form.monthly_mortgage_uf} onChange={(e) => setForm({ ...form, monthly_mortgage_uf: e.target.value })} placeholder="11.5" /></FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Plazo comprado (años)"><Input type="number" step="1" min="0" value={form.loan_term_years} onChange={(e) => setForm({ ...form, loan_term_years: e.target.value })} placeholder="30" /></FormField>
        <FormField label="Cuotas pagadas"><Input type="number" step="1" min="0" value={form.installments_paid} onChange={(e) => setForm({ ...form, installments_paid: e.target.value })} placeholder="24" /></FormField>
        <FormField label="Tasa aplicada (%)"><Input type="number" step="any" min="0" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} placeholder="4.5" /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Institución del crédito"><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Banco de Chile" /></FormField>
        <FormField label="Número del crédito"><Input value={form.credit_number} onChange={(e) => setForm({ ...form, credit_number: e.target.value })} placeholder="1234567890" /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Banco de pago del dividendo">
          <Input value={form.payment_bank} onChange={(e) => setForm({ ...form, payment_bank: e.target.value })} placeholder="Ej: BCI (cuenta de cargo)" />
        </FormField>
        <FormField label="PAC (pago automático)">
          <label className="flex items-center gap-2 h-10 text-sm">
            <input
              type="checkbox"
              checked={form.pac_enabled}
              onChange={(e) => setForm({ ...form, pac_enabled: e.target.checked })}
            />
            Dividendo sujeto a PAC
          </label>
        </FormField>
      </div>

      {form.type !== 'warehouse' && form.type !== 'parking' && (
        <>
          <FormSection title="Seguros" />
          <p className="text-xs text-muted-foreground -mt-1">Seguro de incendio, sismo y desgravamen — empresa, monto anual en UF y número de póliza.</p>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Seguro incendio — Empresa">
              <Input value={form.fire_insurance_company} onChange={(e) => setForm({ ...form, fire_insurance_company: e.target.value })} placeholder="HDI Seguros" />
            </FormField>
            <FormField label="Seguro incendio — Monto (UF)">
              <Input type="number" step="any" min="0" value={form.fire_insurance_amount_uf} onChange={(e) => setForm({ ...form, fire_insurance_amount_uf: e.target.value })} placeholder="0.5" />
            </FormField>
            <FormField label="Seguro incendio — N° póliza">
              <Input value={form.fire_insurance_policy_number} onChange={(e) => setForm({ ...form, fire_insurance_policy_number: e.target.value })} placeholder="123456789" />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Seguro sismo — Empresa">
              <Input value={form.earthquake_insurance_company} onChange={(e) => setForm({ ...form, earthquake_insurance_company: e.target.value })} placeholder="Consorcio" />
            </FormField>
            <FormField label="Seguro sismo — Monto (UF)">
              <Input type="number" step="any" min="0" value={form.earthquake_insurance_amount_uf} onChange={(e) => setForm({ ...form, earthquake_insurance_amount_uf: e.target.value })} placeholder="0.3" />
            </FormField>
            <FormField label="Seguro sismo — N° póliza">
              <Input value={form.earthquake_insurance_policy_number} onChange={(e) => setForm({ ...form, earthquake_insurance_policy_number: e.target.value })} placeholder="987654321" />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Seguro desgravamen — Empresa">
              <Input value={form.desgravamen_insurance_company} onChange={(e) => setForm({ ...form, desgravamen_insurance_company: e.target.value })} placeholder="MetLife" />
            </FormField>
            <FormField label="Seguro desgravamen — Monto (UF)">
              <Input type="number" step="any" min="0" value={form.desgravamen_insurance_amount_uf} onChange={(e) => setForm({ ...form, desgravamen_insurance_amount_uf: e.target.value })} placeholder="0.2" />
            </FormField>
            <FormField label="Seguro desgravamen — N° póliza">
              <Input value={form.desgravamen_insurance_policy_number} onChange={(e) => setForm({ ...form, desgravamen_insurance_policy_number: e.target.value })} placeholder="456789123" />
            </FormField>
          </div>
        </>
      )}

      {form.type !== 'warehouse' && form.type !== 'parking' && (
        <>
          <FormSection title="Cuentas de servicios" />
          <p className="text-xs text-muted-foreground -mt-1">Agua, luz y gas — empresa y código de cliente.</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Agua — Empresa">
              <Input value={form.water_company} onChange={(e) => setForm({ ...form, water_company: e.target.value })} placeholder="Aguas Andinas" />
            </FormField>
            <FormField label="Agua — Código cliente">
              <Input value={form.water_client_code} onChange={(e) => setForm({ ...form, water_client_code: e.target.value })} placeholder="12345678" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Luz — Empresa">
              <Input value={form.electricity_company} onChange={(e) => setForm({ ...form, electricity_company: e.target.value })} placeholder="Enel" />
            </FormField>
            <FormField label="Luz — Código cliente">
              <Input value={form.electricity_client_code} onChange={(e) => setForm({ ...form, electricity_client_code: e.target.value })} placeholder="112233-04" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Gas — Empresa">
              <Input value={form.gas_company} onChange={(e) => setForm({ ...form, gas_company: e.target.value })} placeholder="Metrogas" />
            </FormField>
            <FormField label="Gas — Código cliente">
              <Input value={form.gas_client_code} onChange={(e) => setForm({ ...form, gas_client_code: e.target.value })} placeholder="98765432" />
            </FormField>
          </div>
        </>
      )}

      <FormSection title="Imágenes" />
      <PropertyPhotosSection
        photos={form.photos}
        onChange={(photos) => setForm({ ...form, photos })}
      />

      <FormSection title="Documentos" />
      <PropertyDocumentsSection
        propertyId={propertyId}
        pendingDocs={pendingDocuments}
        onPendingChange={onPendingDocumentsChange}
      />
    </>
  )
}

function PropertyCard({
  property: p,
  propertyMap,
  allProperties,
  leasedIds,
  onEdit,
}: {
  property: Property
  propertyMap: Map<string, string>
  allProperties: Property[]
  leasedIds: Set<string>
  onEdit: (property: Property) => void
}) {
  const displayStatus = getPropertyDisplayStatus(p, leasedIds)
  const thumb = primaryPhotoUrl(p.photos)
  const utilityLines = p.type === 'warehouse' || p.type === 'parking' ? [] : [
    formatUtilityLine('Agua', p.utility_accounts?.water),
    formatUtilityLine('Luz', p.utility_accounts?.electricity),
    formatUtilityLine('Gas', p.utility_accounts?.gas),
  ].filter((line): line is string => line !== null)
  const insuranceLines = p.type === 'warehouse' || p.type === 'parking' ? [] : [
    formatInsuranceLine('Seguro incendio', p.insurance?.fire),
    formatInsuranceLine('Seguro sismo', p.insurance?.earthquake),
    formatInsuranceLine('Seguro desgravamen', p.insurance?.desgravamen),
  ].filter((line): line is string => line !== null)
  const isPac = p.financials?.pac_enabled === true

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onEdit(p)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(p) } }}
      className={cn(
        'hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40',
        isPac && pacCardAccentClassName,
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            {thumb && (
              <img
                src={thumb}
                alt=""
                className="h-12 w-12 rounded-md object-cover shrink-0 border"
              />
            )}
            <CardTitle className="text-base leading-tight">
              {p.name}
              {(p.type === 'parking' || p.type === 'warehouse') && p.unit_number?.trim()
                ? ` N° ${p.unit_number.trim()}`
                : ''}
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isPac && <PacBadge showIcon />}
            <span className={cn('text-xs px-2 py-1 rounded-full', statusColors[displayStatus] || '')}>
              {statusLabels[displayStatus] || displayStatus}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{typeLabels[p.type] || p.type}</p>
        {p.purpose && (
          <p>
            Destino: <span className="text-foreground">
              {purposeLabels[p.purpose] || p.purpose}
              {p.purpose === 'other' && p.purpose_other ? ` (${p.purpose_other})` : ''}
            </span>
          </p>
        )}
        {p.type === 'apartment' && (p.unit_number || p.floor) && (
          <p>Depto {p.unit_number}{p.floor ? `, piso ${p.floor}` : ''}</p>
        )}
        {p.type === 'apartment' && (p.area_m2 ?? 0) > 0 && (
          <p>Superficie: <span className="text-foreground">{p.area_m2} m²</span></p>
        )}
        {p.type === 'warehouse' && p.unit_number && (
          <p>N° bodega: <span className="text-foreground">{p.unit_number}</span></p>
        )}
        {p.type === 'parking' && p.unit_number && (
          <p>N° estacionamiento: <span className="text-foreground">{p.unit_number}</span></p>
        )}
        {p.type === 'apartment' && p.concierge?.administration && (
          <p>Administración: <span className="text-foreground">{p.concierge.administration}</span></p>
        )}
        {p.type === 'apartment' && (p.concierge?.administration_email || p.concierge?.administration_phone) && (
          <p>
            {p.concierge?.administration_email}
            {p.concierge?.administration_email && p.concierge?.administration_phone ? ' · ' : ''}
            {p.concierge?.administration_phone}
          </p>
        )}
        <p>{p.address?.street}, {p.address?.commune}{p.address?.region ? `, ${p.address.region}` : ''}</p>
        {p.owner_name && <p>Dueño: <span className="text-foreground">{p.owner_name}</span></p>}
        {p.address?.property_rol && <p>Rol: {p.address.property_rol}</p>}
        {p.parking_property_id && (
          <p>Estacionamiento: <span className="text-foreground">{propertyMap.get(p.parking_property_id) || 'Vinculado'}</span></p>
        )}
        {p.type === 'apartment' && p.warehouse_property_id && (
          <p>Bodega: <span className="text-foreground">{propertyMap.get(p.warehouse_property_id) || 'Vinculada'}</span></p>
        )}
        {(p.type === 'warehouse' || p.type === 'parking') && (() => {
          const apt = getOwnerApartment(p, allProperties)
          if (!apt) return null
          return (
            <p>Departamento asociado: <span className="text-foreground">{linkedApartmentLabel(apt)}</span></p>
          )
        })()}
        {p.financials?.payment_start_date && (
          <p>Compra / inicio pago: {formatDate(p.financials.payment_start_date)}</p>
        )}
        {(p.financials?.value_uf ?? 0) > 0 && <p>Valor: {formatUF(p.financials!.value_uf!)}</p>}
        {(p.financials?.original_loan_uf ?? 0) > 0 && (
          <p>Crédito original: {formatUF(p.financials!.original_loan_uf!)}</p>
        )}
        {(p.financials?.debt_uf ?? 0) > 0 && <p>Deuda: {formatUF(p.financials!.debt_uf!)}</p>}
        {(p.financials?.installments_paid ?? 0) > 0 && (
          <p>Cuotas pagadas: {p.financials!.installments_paid}</p>
        )}
        {(p.financials?.monthly_mortgage_uf ?? 0) > 0 && (
          <p>Dividendo: {formatUF(p.financials!.monthly_mortgage_uf!)}/mes</p>
        )}
        {(p.financials?.loan_term_years ?? 0) > 0 && (
          <p>Plazo: {p.financials!.loan_term_years} años</p>
        )}
        {(p.financials?.interest_rate ?? 0) > 0 && (
          <p>Tasa: {p.financials!.interest_rate}%</p>
        )}
        {p.financials?.bank_name && (
          <p>
            Banco crédito: <span className="text-foreground">{p.financials.bank_name}</span>
            {p.financials.credit_number && (
              <> — N° crédito: <span className="text-foreground">{p.financials.credit_number}</span></>
            )}
          </p>
        )}
        {p.financials?.payment_bank && (
          <p>Banco de pago: <span className="text-foreground">{p.financials.payment_bank}</span></p>
        )}
        {isPac && (
          <p className="text-teal-700 dark:text-teal-300">
            Dividendo con <PacBadge className="align-middle" />
            {p.financials?.payment_bank ? (
              <> — cargo en <span className="text-foreground">{p.financials.payment_bank}</span></>
            ) : null}
          </p>
        )}
        {(p.financials?.monthly_mortgage_uf ?? 0) > 0 && (
          <p>
            <Link
              to={`/dividends?property_id=${p.id}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Ver dividendos →
            </Link>
          </p>
        )}
        {insuranceLines.length > 0 && insuranceLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {utilityLines.length > 0 && utilityLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </CardContent>
    </Card>
  )
}

function CommunePropertyGroup({
  commune,
  properties,
  expanded,
  onToggle,
  propertyMap,
  allProperties,
  leasedIds,
  onEdit,
}: {
  commune: string
  properties: Property[]
  expanded: boolean
  onToggle: () => void
  propertyMap: Map<string, string>
  allProperties: Property[]
  leasedIds: Set<string>
  onEdit: (property: Property) => void
}) {
  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="font-semibold">{commune}</span>
        <span className="text-sm text-muted-foreground">({properties.length})</span>
      </button>
      {expanded && (
        <div className="border-t px-4 pb-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} propertyMap={propertyMap} allProperties={allProperties} leasedIds={leasedIds} onEdit={onEdit} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PropertiesPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const { data: leases } = useQuery({ queryKey: ['leases'], queryFn: () => api.getLeases() })
  const leasedIds = useMemo(() => leasedPropertyIds(leases?.data ?? []), [leases])
  const { data: parkingLots } = useQuery({
    queryKey: ['properties', 'parking'],
    queryFn: () => api.getProperties({ type: 'parking' }),
    enabled: open,
  })
  const { data: warehouses } = useQuery({
    queryKey: ['properties', 'warehouse'],
    queryFn: () => api.getProperties({ type: 'warehouse' }),
    enabled: open && form.type === 'apartment',
  })

  const propertyMap = new Map(
    (data?.data ?? []).map((p) => [
      p.id,
      p.type === 'parking' || p.type === 'warehouse' ? propertyLinkLabel(p) : p.name,
    ]),
  )
  const properties = data?.data ?? []
  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams])
  const activeFilterCount = countActiveFilters(filters)

  const updateFilters = (patch: Partial<PropertyFilters>) => {
    const next = { ...filters, ...patch }
    setSearchParams(filtersToSearchParams(next), { replace: true })
  }

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const displayedProperties = useMemo(
    () => applyPropertyFilters(properties, filters, leasedIds),
    [properties, filters, leasedIds],
  )
  const propertiesForTypeBreakdown = useMemo(
    () => applyPropertyFilters(properties, filters, leasedIds, { skipTipo: true }),
    [properties, filters, leasedIds],
  )
  const typeBreakdown = useMemo(() => groupPropertiesByType(propertiesForTypeBreakdown), [propertiesForTypeBreakdown])
  const communeGroups = useMemo(() => groupPropertiesByCommune(displayedProperties), [displayedProperties])

  const totalCount = data?.total ?? properties.length
  const filteredCount = displayedProperties.length
  const communeNames = useMemo(() => communeGroups.map((g) => g.commune), [communeGroups])
  const [expandedCommunes, setExpandedCommunes] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (communeNames.length === 0) return
    setExpandedCommunes((prev) => {
      if (prev.size > 0) return prev
      return defaultExpandedCommunes(communeNames)
    })
  }, [communeNames])

  const editingProperty = properties.find((p) => p.id === editingId)

  const toggleCommune = (commune: string) => {
    setExpandedCommunes((prev) => {
      const next = new Set(prev)
      if (next.has(commune)) next.delete(commune)
      else next.add(commune)
      return next
    })
  }

  const closeDialog = () => {
    setOpen(false)
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setPendingDocuments([])
    setConfirmDelete(false)
  }

  const openCreate = () => {
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setPendingDocuments([])
    setOpen(true)
  }

  const openEdit = (property: Property) => {
    setMode('edit')
    setEditingId(property.id)
    setForm(propertyToForm(property, properties))
    setPendingDocuments([])
    setOpen(true)
  }

  const uploadPendingDocuments = async (propertyId: string) => {
    if (pendingDocuments.length === 0) return
    await Promise.all(
      pendingDocuments.map((doc) =>
        api.createDocument({
          entity_type: 'property',
          entity_id: propertyId,
          category: doc.category,
          title: doc.title,
          file_name: doc.file_name,
          file_data: doc.file_data,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
        }),
      ),
    )
    qc.invalidateQueries({ queryKey: ['documents'] })
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['properties'] })
    closeDialog()
  }

  const create = useMutation({
    mutationFn: () => api.createProperty(formToPayload(form)),
    onSuccess: async (property) => {
      await uploadPendingDocuments(property.id)
      onSuccess()
    },
  })

  const update = useMutation({
    mutationFn: () => api.updateProperty(editingId!, formToPayload(form)),
    onSuccess,
  })

  const remove = useMutation({
    mutationFn: () => api.deleteProperty(editingId!),
    onSuccess,
  })

  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || remove.error

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.properties')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeFilterCount > 0
              ? t('properties.filteredCount', { filtered: filteredCount, total: totalCount })
              : t('properties.totalCount', { count: totalCount })}
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Agregar propiedad</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Filtros</CardTitle>
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('properties.activeFilters', { count: activeFilterCount })}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                  <X className="h-4 w-4" />
                  {t('properties.clearFilters')}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormSelect value={filters.tipo} onChange={(e) => updateFilters({ tipo: e.target.value })}>
            <option value="">Tipo: todos</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>{typeLabels[type] ?? type}</option>
            ))}
          </FormSelect>
          <FormSelect value={filters.estado} onChange={(e) => updateFilters({ estado: e.target.value as PropertyFilters['estado'] })}>
            <option value="">Estado: todos</option>
            <option value="disponibles">Disponibles</option>
            <option value="arrendadas">Arrendadas</option>
          </FormSelect>
          <FormSelect value={filters.destino} onChange={(e) => updateFilters({ destino: e.target.value })}>
            <option value="">Destino: todos</option>
            {PURPOSE_OPTIONS.map((purpose) => (
              <option key={purpose} value={purpose}>{purposeLabels[purpose] ?? purpose}</option>
            ))}
          </FormSelect>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => updateFilters({ q: e.target.value })}
              placeholder="Buscar nombre, dirección, dueño o rol…"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {typeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.propertiesByType')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {typeBreakdown.map(({ type, count }) => {
                const isActive = filters.tipo === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateFilters({ tipo: isActive ? '' : type })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                      isActive
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'bg-muted/50 hover:bg-muted',
                    )}
                  >
                    <span className="font-medium">{typeLabels[type] ?? type}</span>
                    <span className={cn('text-muted-foreground', isActive && 'text-foreground/80')}>{count}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {communeGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {activeFilterCount > 0 ? t('properties.noResults') : t('properties.noAvailable')}
          </p>
        ) : communeGroups.map(({ commune, properties: communeProperties }) => (
          <CommunePropertyGroup
            key={commune}
            commune={commune}
            properties={communeProperties}
            expanded={expandedCommunes.has(commune)}
            onToggle={() => toggleCommune(commune)}
            propertyMap={propertyMap}
            allProperties={properties}
            leasedIds={leasedIds}
            onEdit={openEdit}
          />
        ))}
      </div>

      <FormDialog
        open={open}
        onClose={closeDialog}
        title={mode === 'edit' ? 'Editar propiedad' : 'Nueva propiedad'}
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'edit') update.mutate()
          else create.mutate()
        }}
        loading={isSaving}
        footerStart={mode === 'edit' ? (
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} disabled={isSaving || remove.isPending}>
            Eliminar
          </Button>
        ) : undefined}
      >
        <PropertyFormFields
          form={form}
          setForm={setForm}
          parkingLots={parkingLots}
          warehouses={warehouses}
          allProperties={properties}
          propertyId={mode === 'edit' ? editingId : null}
          pendingDocuments={pendingDocuments}
          onPendingDocumentsChange={setPendingDocuments}
        />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar propiedad"
        message={`¿Estás seguro de eliminar "${editingProperty?.name ?? 'esta propiedad'}"? Esta acción no se puede deshacer.`}
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}
