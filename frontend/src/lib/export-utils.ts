import {
  api,
  type Lease,
  type Paginated,
  type Payment,
  type Property,
  type Tenant,
} from '@/lib/api'

const PAGE_LIMIT = 100

export type ExportDataset = 'properties' | 'tenants' | 'leases' | 'payments'
export type ExportFormat = 'csv' | 'json'

export const exportDatasetLabels: Record<ExportDataset, string> = {
  properties: 'Propiedades',
  tenants: 'Arrendatarios',
  leases: 'Arriendos',
  payments: 'Pagos',
}

async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Paginated<T>>): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let total = Infinity

  while (all.length < total) {
    const res = await fetchPage(page)
    all.push(...res.data)
    total = res.total
    if (res.data.length === 0) break
    page++
  }

  return all
}

function exportDateSuffix(): string {
  return new Date().toISOString().slice(0, 10)
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return lines.join('\r\n')
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCsv(filename: string, content: string) {
  downloadFile(filename, `\ufeff${content}`, 'text/csv;charset=utf-8;')
}

function downloadJson(filename: string, data: unknown) {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8;')
}

function propertiesToCsv(items: Property[]): string {
  const headers = [
    'id', 'nombre', 'tipo', 'estado', 'proposito', 'calle', 'comuna', 'ciudad', 'region',
    'rol', 'propietario', 'unidad', 'piso', 'area_m2', 'renta_esperada', 'moneda',
    'valor_uf', 'deuda_uf', 'dividendo_mensual_uf', 'banco',
  ]
  const rows = items.map((p) => [
    p.id,
    p.name,
    p.type,
    p.status,
    p.purpose ?? '',
    p.address?.street ?? '',
    p.address?.commune ?? '',
    p.address?.city ?? '',
    p.address?.region ?? '',
    p.address?.property_rol ?? '',
    p.owner_name ?? '',
    p.unit_number ?? '',
    p.floor ?? '',
    p.area_m2 ?? '',
    p.financials?.expected_rent?.amount ?? '',
    p.financials?.expected_rent?.currency ?? '',
    p.financials?.value_uf ?? '',
    p.financials?.debt_uf ?? '',
    p.financials?.monthly_mortgage_uf ?? '',
    p.financials?.bank_name ?? '',
  ])
  return toCsv(headers, rows)
}

function tenantsToCsv(items: Tenant[]): string {
  const headers = ['id', 'nombre', 'apellido', 'email', 'telefono', 'rut', 'activo']
  const rows = items.map((t) => [
    t.id,
    t.first_name,
    t.last_name,
    t.contact?.email ?? '',
    t.contact?.phone ?? '',
    t.tax_id ?? '',
    t.active ? 'si' : 'no',
  ])
  return toCsv(headers, rows)
}

function leasesToCsv(items: Lease[]): string {
  const headers = [
    'id', 'propiedad_id', 'arrendatario_id', 'estado', 'fecha_inicio', 'fecha_fin',
    'renta_mensual', 'moneda', 'ajuste_ipc', 'dia_pago', 'bodega_id', 'estacionamiento_id',
  ]
  const rows = items.map((l) => [
    l.id,
    l.property_id,
    l.tenant_id,
    l.status,
    l.start_date ?? '',
    l.end_date ?? '',
    l.monthly_rent?.amount ?? '',
    l.monthly_rent?.currency ?? '',
    l.ipc_adjustment ? 'si' : 'no',
    l.payment_day,
    l.warehouse_property_id ?? '',
    l.parking_property_id ?? '',
  ])
  return toCsv(headers, rows)
}

function paymentsToCsv(items: Payment[]): string {
  const headers = [
    'id', 'propiedad_id', 'arriendo_id', 'arrendatario_id', 'tipo', 'estado',
    'monto', 'moneda', 'fecha_vencimiento', 'fecha_pago', 'notas',
  ]
  const rows = items.map((p) => [
    p.id,
    p.property_id ?? '',
    p.lease_id ?? '',
    p.tenant_id ?? '',
    p.type,
    p.status,
    p.amount?.amount ?? '',
    p.amount?.currency ?? '',
    p.due_date,
    p.paid_date ?? '',
    p.notes ?? '',
  ])
  return toCsv(headers, rows)
}

const datasetDataFetchers: Record<ExportDataset, () => Promise<unknown[]>> = {
  properties: () => fetchAllPages((page) => api.getProperties({ page, limit: PAGE_LIMIT })),
  tenants: () => fetchAllPages((page) => api.getTenants(page, PAGE_LIMIT)),
  leases: () => fetchAllPages((page) => api.getLeases(page, undefined, PAGE_LIMIT)),
  payments: () => fetchAllPages((page) => api.getPayments(page, undefined, PAGE_LIMIT)),
}

const datasetCsvConverters: Record<ExportDataset, (items: unknown[]) => string> = {
  properties: (items) => propertiesToCsv(items as Property[]),
  tenants: (items) => tenantsToCsv(items as Tenant[]),
  leases: (items) => leasesToCsv(items as Lease[]),
  payments: (items) => paymentsToCsv(items as Payment[]),
}

const datasetCsvFilenames: Record<ExportDataset, string> = {
  properties: 'propiedades.csv',
  tenants: 'arrendatarios.csv',
  leases: 'arriendos.csv',
  payments: 'pagos.csv',
}

async function delayBetweenDownloads() {
  await new Promise((resolve) => setTimeout(resolve, 300))
}

async function exportCsv(datasets: ExportDataset[]): Promise<void> {
  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i]
    const items = await datasetDataFetchers[dataset]()
    downloadCsv(datasetCsvFilenames[dataset], datasetCsvConverters[dataset](items))
    if (i < datasets.length - 1) await delayBetweenDownloads()
  }
}

async function exportJson(datasets: ExportDataset[]): Promise<void> {
  const date = exportDateSuffix()

  if (datasets.length === 1) {
    const dataset = datasets[0]
    const items = await datasetDataFetchers[dataset]()
    downloadJson(`myrent-${dataset}-${date}.json`, items)
    return
  }

  const combined: Partial<Record<ExportDataset, unknown[]>> = {}
  for (const dataset of datasets) {
    combined[dataset] = await datasetDataFetchers[dataset]()
  }
  downloadJson(`myrent-export-${date}.json`, combined)
}

export async function exportDatasets(datasets: ExportDataset[], format: ExportFormat = 'csv'): Promise<void> {
  if (format === 'json') {
    await exportJson(datasets)
    return
  }
  await exportCsv(datasets)
}
