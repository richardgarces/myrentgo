import JSZip from 'jszip'
import {
  api,
  type CrmContact,
  type DividendPayment,
  type Document,
  type EmailRecipient,
  type Lease,
  type Maintenance,
  type Mortgage,
  type Paginated,
  type Payment,
  type Property,
  type Reminder,
  type Tenant,
  type TenantNotification,
  type Ticket,
} from '@/lib/api'

const PAGE_LIMIT = 100

export type ExportFormat = 'csv' | 'json'
export type ExportJsonMode = 'structured' | 'raw'
export type ExportCategory = 'operacion' | 'administracion' | 'finanzas' | 'comunicaciones' | 'crm'

export type ExportDataset =
  | 'properties'
  | 'tenants'
  | 'leases'
  | 'payments'
  | 'documents'
  | 'maintenance'
  | 'dividends'
  | 'mortgages'
  | 'notifications'
  | 'email_recipients'
  | 'reminders'
  | 'crm_contacts'
  | 'tickets'

export interface ExportDatasetInfo {
  label: string
  description: string
  category: ExportCategory
}

export const exportCategoryOrder: ExportCategory[] = [
  'operacion',
  'administracion',
  'finanzas',
  'comunicaciones',
  'crm',
]

export const exportCategoryLabels: Record<ExportCategory, string> = {
  operacion: 'Operación',
  administracion: 'Administración',
  finanzas: 'Finanzas',
  comunicaciones: 'Comunicaciones',
  crm: 'CRM y soporte',
}

export const exportDatasetConfig: Record<ExportDataset, ExportDatasetInfo> = {
  properties: {
    label: 'Propiedades',
    description: 'Inventario inmobiliario, direcciones y datos financieros.',
    category: 'operacion',
  },
  tenants: {
    label: 'Arrendatarios',
    description: 'Personas con contrato de arriendo y datos de contacto.',
    category: 'operacion',
  },
  leases: {
    label: 'Arriendos',
    description: 'Contratos activos e históricos con montos y fechas.',
    category: 'operacion',
  },
  payments: {
    label: 'Pagos de arriendo',
    description: 'Rentas, depósitos y gastos (sin dividendos hipotecarios).',
    category: 'operacion',
  },
  documents: {
    label: 'Documentos',
    description: 'Metadatos de archivos adjuntos (sin contenido binario).',
    category: 'administracion',
  },
  maintenance: {
    label: 'Mantenciones',
    description: 'Trabajos programados, correctivos y de emergencia.',
    category: 'administracion',
  },
  dividends: {
    label: 'Dividendos',
    description: 'Cuotas hipotecarias mensuales por propiedad.',
    category: 'finanzas',
  },
  mortgages: {
    label: 'Créditos hipotecarios',
    description: 'Préstamos formales asociados a propiedades.',
    category: 'finanzas',
  },
  notifications: {
    label: 'Notificaciones',
    description: 'Avisos de cobranza enviados o programados a arrendatarios.',
    category: 'comunicaciones',
  },
  email_recipients: {
    label: 'Destinatarios de correo',
    description: 'Administradores y contactos internos que reciben alertas.',
    category: 'comunicaciones',
  },
  reminders: {
    label: 'Recordatorios',
    description: 'Alertas programadas por correo, WhatsApp o Telegram.',
    category: 'comunicaciones',
  },
  crm_contacts: {
    label: 'Contactos CRM',
    description: 'Corredores, bancos, técnicos y proveedores.',
    category: 'crm',
  },
  tickets: {
    label: 'Tickets',
    description: 'Incidencias y solicitudes de servicio en propiedades.',
    category: 'crm',
  },
}

export const allExportDatasets: ExportDataset[] = Object.keys(exportDatasetConfig) as ExportDataset[]

/** @deprecated use exportDatasetConfig[dataset].label */
export const exportDatasetLabels: Record<ExportDataset, string> = Object.fromEntries(
  allExportDatasets.map((d) => [d, exportDatasetConfig[d].label]),
) as Record<ExportDataset, string>

export interface ExportContext {
  organizationId?: string
  organizationName?: string
}

export interface ExportOptions extends ExportContext {
  format: ExportFormat
  jsonMode?: ExportJsonMode
  zipCsv?: boolean
}

export interface ExportMetadata {
  exported_at: string
  organization_id?: string
  organization_name?: string
  format: ExportFormat
  collections: ExportDataset[]
  record_counts: Partial<Record<ExportDataset, number>>
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

function exportTimestamp(): string {
  return new Date().toISOString()
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

function downloadFile(filename: string, content: string | Blob, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
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

const documentCategoryLabels: Record<string, string> = {
  contract: 'Contrato',
  deed: 'Escritura',
  certificate: 'Certificado',
  warranty: 'Garantía',
  id: 'Identidad',
  invoice: 'Factura',
  appraisal: 'Tasación',
  other: 'Otro',
}

const maintenanceTypeLabels: Record<string, string> = {
  preventive: 'Preventiva',
  corrective: 'Correctiva',
  emergency: 'Emergencia',
}

const maintenanceStatusLabels: Record<string, string> = {
  scheduled: 'Programada',
  in_progress: 'En progreso',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

const notificationTypeLabels: Record<string, string> = {
  payment_due: 'Aviso de pago',
  payment_overdue: 'Pago atrasado',
  late_interest: 'Intereses por mora',
  maintenance_due: 'Mantención pendiente',
}

const crmTypeLabels: Record<string, string> = {
  real_estate: 'Inmobiliaria',
  bank: 'Banco',
  technician: 'Técnico',
  supplier: 'Proveedor',
  building: 'Edificio',
  other: 'Otro',
}

const ticketPriorityLabels: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
}

const ticketStatusLabels: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

const emailNotificationTypeLabels: Record<string, string> = {
  payment_due: 'Aviso de pago',
  payment_overdue: 'Pago atrasado',
  late_interest: 'Intereses por mora',
  dividend_due: 'Dividendo por vencer',
  lease_expiring: 'Contrato por vencer',
  maintenance_due: 'Mantención pendiente',
}

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key
}

function propertiesToCsv(items: Property[]): string {
  const headers = [
    'id', 'nombre', 'tipo', 'estado', 'proposito', 'calle', 'comuna', 'ciudad', 'region',
    'rol', 'propietario', 'unidad', 'piso', 'area_m2', 'renta_esperada', 'moneda',
    'valor_uf', 'valor_comercial_uf', 'credito_original_uf', 'deuda_uf', 'dividendo_mensual_uf', 'plazo_anos', 'cuotas_pagadas', 'banco', 'numero_credito', 'banco_pago', 'pac',
    'seguro_incendio_empresa', 'seguro_incendio_uf', 'seguro_incendio_poliza',
    'seguro_sismo_empresa', 'seguro_sismo_uf', 'seguro_sismo_poliza',
    'seguro_desgravamen_empresa', 'seguro_desgravamen_uf', 'seguro_desgravamen_poliza',
  ]
  const rows = items.map((p) => [
    p.id, p.name, p.type, p.status, p.purpose ?? '',
    p.address?.street ?? '', p.address?.commune ?? '', p.address?.city ?? '', p.address?.region ?? '',
    p.address?.property_rol ?? '', p.owner_name ?? '', p.unit_number ?? '', p.floor ?? '', p.area_m2 ?? '',
    p.financials?.expected_rent?.amount ?? '', p.financials?.expected_rent?.currency ?? '',
    p.financials?.value_uf ?? '', p.financials?.commercial_value_uf ?? '', p.financials?.original_loan_uf ?? '', p.financials?.debt_uf ?? '',
    p.financials?.monthly_mortgage_uf ?? '', p.financials?.loan_term_years ?? '', p.financials?.installments_paid ?? '',
    p.financials?.bank_name ?? '', p.financials?.credit_number ?? '', p.financials?.payment_bank ?? '',
    p.financials?.pac_enabled ? 'si' : 'no',
    p.insurance?.fire?.company ?? '', p.insurance?.fire?.amount_uf ?? '', p.insurance?.fire?.policy_number ?? '',
    p.insurance?.earthquake?.company ?? '', p.insurance?.earthquake?.amount_uf ?? '', p.insurance?.earthquake?.policy_number ?? '',
    p.insurance?.desgravamen?.company ?? '', p.insurance?.desgravamen?.amount_uf ?? '', p.insurance?.desgravamen?.policy_number ?? '',
  ])
  return toCsv(headers, rows)
}

function tenantsToCsv(items: Tenant[]): string {
  const headers = ['id', 'nombre', 'apellido', 'email', 'telefono', 'rut', 'activo']
  const rows = items.map((t) => [
    t.id, t.first_name, t.last_name, t.contact?.email ?? '', t.contact?.phone ?? '',
    t.tax_id ?? '', t.active ? 'si' : 'no',
  ])
  return toCsv(headers, rows)
}

function leasesToCsv(items: Lease[]): string {
  const headers = [
    'id', 'propiedad_id', 'arrendatario_id', 'estado', 'fecha_inicio', 'fecha_fin',
    'renta_mensual', 'moneda', 'ajuste_ipc', 'dia_pago', 'bodega_id', 'estacionamiento_id',
  ]
  const rows = items.map((l) => [
    l.id, l.property_id, l.tenant_id, l.status, l.start_date ?? '', l.end_date ?? '',
    l.monthly_rent?.amount ?? '', l.monthly_rent?.currency ?? '',
    l.ipc_adjustment ? 'si' : 'no', l.payment_day,
    l.warehouse_property_id ?? '', l.parking_property_id ?? '',
  ])
  return toCsv(headers, rows)
}

function paymentsToCsv(items: Payment[]): string {
  const headers = [
    'id', 'propiedad_id', 'arriendo_id', 'arrendatario_id', 'tipo', 'estado',
    'monto', 'moneda', 'fecha_vencimiento', 'fecha_pago', 'institucion', 'banco_pago', 'pac', 'notas',
  ]
  const rows = items.map((p) => [
    p.id, p.property_id ?? '', p.lease_id ?? '', p.tenant_id ?? '', p.type, p.status,
    p.amount?.amount ?? '', p.amount?.currency ?? '', p.due_date, p.paid_date ?? '',
    p.bank_name ?? '', p.payment_bank ?? '', p.pac_enabled ? 'si' : 'no', p.notes ?? '',
  ])
  return toCsv(headers, rows)
}

function dividendsToCsv(items: DividendPayment[]): string {
  const headers = [
    'id', 'propiedad_id', 'estado', 'monto', 'moneda', 'fecha_vencimiento', 'fecha_pago',
    'institucion_credito', 'banco_pago', 'pac', 'notas',
  ]
  const rows = items.map((p) => [
    p.id, p.property_id ?? '', p.status,
    p.amount?.amount ?? '', p.amount?.currency ?? '', p.due_date, p.paid_date ?? '',
    p.bank_name ?? '', p.payment_bank ?? '', p.pac_enabled ? 'si' : 'no', p.notes ?? '',
  ])
  return toCsv(headers, rows)
}

function documentsToCsv(items: Document[]): string {
  const headers = [
    'id', 'titulo', 'categoria', 'nombre_archivo', 'tipo_mime', 'tamano_bytes',
    'tipo_entidad', 'entidad_id', 'version', 'activo', 'vence', 'subido_por', 'etiquetas', 'creado', 'actualizado',
  ]
  const rows = items.map((d) => [
    d.id, d.title, label(documentCategoryLabels, d.category), d.file_name, d.mime_type ?? '',
    d.size_bytes ?? '', d.entity_type, d.entity_id, d.version, d.active ? 'si' : 'no',
    d.expires_at ?? '', d.uploaded_by ?? '', (d.tags ?? []).join('; '),
    d.created_at ?? '', d.updated_at ?? '',
  ])
  return toCsv(headers, rows)
}

function maintenanceToCsv(items: Maintenance[]): string {
  const headers = [
    'id', 'propiedad_id', 'titulo', 'tipo', 'estado', 'descripcion',
    'fecha_programada', 'fecha_completada', 'tecnico_id', 'costo', 'moneda',
    'recurrencia_dias', 'proxima_fecha',
  ]
  const rows = items.map((m) => [
    m.id, m.property_id, m.title, label(maintenanceTypeLabels, m.type),
    label(maintenanceStatusLabels, m.status), m.description ?? '',
    m.scheduled_date, m.completed_date ?? '', m.technician_id ?? '',
    m.cost?.amount ?? '', m.cost?.currency ?? 'CLP',
    m.recurrence_days ?? '', m.next_due_date ?? '',
  ])
  return toCsv(headers, rows)
}

function mortgagesToCsv(items: Mortgage[]): string {
  const headers = [
    'id', 'propiedad', 'propiedad_id', 'banco', 'credito_original_uf', 'deuda_uf', 'valor_comercial_uf',
    'dividendo_uf', 'plazo_anos', 'cuotas_pagadas', 'tasa_interes',
    'monto_prestamo_clp', 'cuota_mensual_clp', 'valor_comercial_clp', 'valor_presente_clp', 'activo',
  ]
  const rows = items.map((m) => [
    m.id, m.property_name, m.property_id, m.bank_name ?? '',
    m.original_loan_uf ?? '', m.debt_uf ?? '', m.commercial_value_uf ?? '', m.monthly_mortgage_uf ?? '',
    m.loan_term_years ?? '', m.installments_paid ?? '', m.interest_rate ?? '',
    m.loan_amount?.amount ?? '', m.monthly_payment?.amount ?? '', m.commercial_value?.amount ?? '', m.present_value,
    m.active ? 'si' : 'no',
  ])
  return toCsv(headers, rows)
}

function notificationsToCsv(items: TenantNotification[]): string {
  const headers = [
    'id', 'arrendatario_id', 'arriendo_id', 'tipo', 'titulo', 'mensaje',
    'canal', 'estado', 'programado', 'enviado', 'creado',
  ]
  const rows = items.map((n) => [
    n.id, n.tenant_id, n.lease_id ?? '', label(notificationTypeLabels, n.type),
    n.title, n.message, n.channel, n.status, n.scheduled_at, n.sent_at ?? '', n.created_at,
  ])
  return toCsv(headers, rows)
}

function emailRecipientsToCsv(items: EmailRecipient[]): string {
  const headers = ['id', 'nombre', 'email', 'etiqueta', 'property_id', 'tenant_id', 'activo', 'tipos_notificacion', 'creado']
  const rows = items.map((r) => [
    r.id, r.name, r.email, r.label ?? '', r.property_id ?? '', r.tenant_id ?? '',
    r.enabled ? 'si' : 'no',
    r.notification_types.map((t) => label(emailNotificationTypeLabels, t)).join('; '),
    r.created_at,
  ])
  return toCsv(headers, rows)
}

function remindersToCsv(items: Reminder[]): string {
  const headers = [
    'id', 'titulo', 'mensaje', 'canal', 'destinatario', 'tipo_entidad', 'entidad_id',
    'programado', 'estado', 'enviado',
  ]
  const rows = items.map((r) => [
    r.id, r.title, r.message ?? '', r.channel, r.recipient,
    r.entity_type ?? '', r.entity_id ?? '', r.scheduled_at, r.status, r.sent_at ?? '',
  ])
  return toCsv(headers, rows)
}

function crmContactsToCsv(items: CrmContact[]): string {
  const headers = ['id', 'tipo', 'nombre', 'email', 'telefono', 'activo']
  const rows = items.map((c) => [
    c.id, label(crmTypeLabels, c.type), c.name,
    c.contact?.email ?? '', c.contact?.phone ?? '', c.active ? 'si' : 'no',
  ])
  return toCsv(headers, rows)
}

function ticketsToCsv(items: Ticket[]): string {
  const headers = [
    'id', 'propiedad_id', 'arriendo_id', 'titulo', 'descripcion', 'prioridad',
    'estado', 'reportado_por', 'asignado_a', 'comentarios', 'resuelto',
  ]
  const rows = items.map((t) => [
    t.id, t.property_id, t.lease_id ?? '', t.title, t.description,
    label(ticketPriorityLabels, t.priority), label(ticketStatusLabels, t.status),
    t.reported_by ?? '', t.assigned_to ?? '', t.comments?.length ?? 0, t.resolved_at ?? '',
  ])
  return toCsv(headers, rows)
}

function stripDocumentBinary(d: Document): Omit<Document, 'file_data'> {
  const { file_data: _removed, ...rest } = d
  return rest
}

function sanitizeForExport(dataset: ExportDataset, items: unknown[]): unknown[] {
  if (dataset === 'documents') {
    return (items as Document[]).map(stripDocumentBinary)
  }
  return items
}

async function fetchPaymentsExcludingDividends(): Promise<Payment[]> {
  const all = await fetchAllPages((page) => api.getPayments(page, undefined, PAGE_LIMIT))
  return all.filter((p) => p.type !== 'dividend')
}

const datasetDataFetchers: Record<ExportDataset, () => Promise<unknown[]>> = {
  properties: () => fetchAllPages((page) => api.getProperties({ page, limit: PAGE_LIMIT })),
  tenants: () => fetchAllPages((page) => api.getTenants(page, PAGE_LIMIT)),
  leases: () => fetchAllPages((page) => api.getLeases(page, undefined, PAGE_LIMIT)),
  payments: fetchPaymentsExcludingDividends,
  documents: () => fetchAllPages((page) => api.getDocuments(page, { limit: PAGE_LIMIT, omit_file_data: true })),
  maintenance: () => fetchAllPages((page) => api.getMaintenance(page, PAGE_LIMIT)),
  dividends: () => fetchAllPages((page) => api.getDividends({ page, limit: PAGE_LIMIT })),
  mortgages: () => fetchAllPages((page) => api.getMortgages(page, PAGE_LIMIT)),
  notifications: () => fetchAllPages((page) => api.getNotifications({ page, limit: PAGE_LIMIT })),
  email_recipients: () => fetchAllPages((page) => api.getEmailRecipients(page, PAGE_LIMIT)),
  reminders: () => fetchAllPages((page) => api.getReminders(page, PAGE_LIMIT)),
  crm_contacts: () => fetchAllPages((page) => api.getContacts(page, undefined, PAGE_LIMIT)),
  tickets: () => fetchAllPages((page) => api.getTickets(page, undefined, PAGE_LIMIT)),
}

const datasetCountFetchers: Record<ExportDataset, () => Promise<number>> = {
  properties: async () => (await api.getProperties({ page: 1, limit: 1 })).total,
  tenants: async () => (await api.getTenants(1, 1)).total,
  leases: async () => (await api.getLeases(1, undefined, 1)).total,
  payments: async () => {
    const [all, div] = await Promise.all([
      api.getPayments(1, undefined, 1),
      api.getDividends({ page: 1, limit: 1 }),
    ])
    return Math.max(0, all.total - div.total)
  },
  documents: async () => (await api.getDocuments(1, { limit: 1, omit_file_data: true })).total,
  maintenance: async () => (await api.getMaintenance(1, 1)).total,
  dividends: async () => (await api.getDividends({ page: 1, limit: 1 })).total,
  mortgages: async () => (await api.getMortgages(1, 1)).total,
  notifications: async () => (await api.getNotifications({ page: 1, limit: 1 })).total,
  email_recipients: async () => (await api.getEmailRecipients(1, 1)).total,
  reminders: async () => (await api.getReminders(1, 1)).total,
  crm_contacts: async () => (await api.getContacts(1, undefined, 1)).total,
  tickets: async () => (await api.getTickets(1, undefined, 1)).total,
}

const datasetCsvConverters: Record<ExportDataset, (items: unknown[]) => string> = {
  properties: (items) => propertiesToCsv(items as Property[]),
  tenants: (items) => tenantsToCsv(items as Tenant[]),
  leases: (items) => leasesToCsv(items as Lease[]),
  payments: (items) => paymentsToCsv(items as Payment[]),
  documents: (items) => documentsToCsv(items as Document[]),
  maintenance: (items) => maintenanceToCsv(items as Maintenance[]),
  dividends: (items) => dividendsToCsv(items as DividendPayment[]),
  mortgages: (items) => mortgagesToCsv(items as Mortgage[]),
  notifications: (items) => notificationsToCsv(items as TenantNotification[]),
  email_recipients: (items) => emailRecipientsToCsv(items as EmailRecipient[]),
  reminders: (items) => remindersToCsv(items as Reminder[]),
  crm_contacts: (items) => crmContactsToCsv(items as CrmContact[]),
  tickets: (items) => ticketsToCsv(items as Ticket[]),
}

const datasetCsvFilenames: Record<ExportDataset, string> = {
  properties: 'propiedades.csv',
  tenants: 'arrendatarios.csv',
  leases: 'arriendos.csv',
  payments: 'pagos-arriendo.csv',
  documents: 'documentos.csv',
  maintenance: 'mantenciones.csv',
  dividends: 'dividendos.csv',
  mortgages: 'creditos-hipotecarios.csv',
  notifications: 'notificaciones.csv',
  email_recipients: 'destinatarios-correo.csv',
  reminders: 'recordatorios.csv',
  crm_contacts: 'contactos-crm.csv',
  tickets: 'tickets.csv',
}

export async function fetchExportCounts(datasets: ExportDataset[] = allExportDatasets): Promise<Partial<Record<ExportDataset, number>>> {
  const entries = await Promise.all(
    datasets.map(async (dataset) => {
      try {
        const count = await datasetCountFetchers[dataset]()
        return [dataset, count] as const
      } catch {
        return [dataset, -1] as const
      }
    }),
  )
  return Object.fromEntries(entries.filter(([, n]) => n >= 0))
}

function buildMetadata(
  datasets: ExportDataset[],
  counts: Partial<Record<ExportDataset, number>>,
  options: ExportOptions,
): ExportMetadata {
  return {
    exported_at: exportTimestamp(),
    organization_id: options.organizationId,
    organization_name: options.organizationName,
    format: options.format,
    collections: datasets,
    record_counts: counts,
  }
}

async function delayBetweenDownloads() {
  await new Promise((resolve) => setTimeout(resolve, 300))
}

async function collectDatasetData(datasets: ExportDataset[]): Promise<Partial<Record<ExportDataset, unknown[]>>> {
  const result: Partial<Record<ExportDataset, unknown[]>> = {}
  for (const dataset of datasets) {
    const raw = await datasetDataFetchers[dataset]()
    result[dataset] = sanitizeForExport(dataset, raw) as unknown[]
  }
  return result
}

async function exportCsvSeparate(
  datasets: ExportDataset[],
  data: Partial<Record<ExportDataset, unknown[]>>,
): Promise<void> {
  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i]
    const items = data[dataset] ?? []
    downloadCsv(datasetCsvFilenames[dataset], datasetCsvConverters[dataset](items))
    if (i < datasets.length - 1) await delayBetweenDownloads()
  }
}

async function exportCsvZip(
  datasets: ExportDataset[],
  data: Partial<Record<ExportDataset, unknown[]>>,
  metadata: ExportMetadata,
): Promise<void> {
  const zip = new JSZip()
  zip.file('_metadata.json', JSON.stringify(metadata, null, 2))
  for (const dataset of datasets) {
    const items = data[dataset] ?? []
    zip.file(datasetCsvFilenames[dataset], `\ufeff${datasetCsvConverters[dataset](items)}`)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const orgSlug = (metadata.organization_name || 'myrent').replace(/\s+/g, '-').toLowerCase()
  downloadFile(`myrent-export-${orgSlug}-${exportDateSuffix()}.zip`, blob, 'application/zip')
}

async function exportJson(
  datasets: ExportDataset[],
  data: Partial<Record<ExportDataset, unknown[]>>,
  options: ExportOptions,
  metadata: ExportMetadata,
): Promise<void> {
  const date = exportDateSuffix()
  const orgSlug = (options.organizationName || 'myrent').replace(/\s+/g, '-').toLowerCase()

  if (options.jsonMode === 'raw' && datasets.length === 1) {
    const dataset = datasets[0]
    downloadJson(`myrent-${dataset}-${date}.json`, data[dataset] ?? [])
    return
  }

  const payload = {
    metadata,
    collections: data,
  }
  const filename = datasets.length === 1
    ? `myrent-${datasets[0]}-${date}.json`
    : `myrent-export-${orgSlug}-${date}.json`
  downloadJson(filename, payload)
}

export async function exportDatasets(
  datasets: ExportDataset[],
  options: ExportOptions,
): Promise<void> {
  if (datasets.length === 0) return

  const data = await collectDatasetData(datasets)
  const counts: Partial<Record<ExportDataset, number>> = {}
  for (const d of datasets) {
    counts[d] = data[d]?.length ?? 0
  }

  const metadata = buildMetadata(datasets, counts, options)

  if (options.format === 'json') {
    await exportJson(datasets, data, options, metadata)
    return
  }

  if (options.zipCsv && datasets.length > 1) {
    await exportCsvZip(datasets, data, metadata)
    return
  }

  await exportCsvSeparate(datasets, data)
}
