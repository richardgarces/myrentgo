import { api, type Document, type Lease, type Tenant } from '@/lib/api'
import { propertyLinkLabel } from '@/lib/utils'

export const DOCUMENT_CATEGORIES = [
  'deed',
  'contract',
  'certificate',
  'warranty',
  'id',
  'invoice',
  'appraisal',
  'annex',
  'other',
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const categoryLabels: Record<string, string> = {
  contract: 'Contrato',
  deed: 'Escritura',
  certificate: 'Certificado',
  warranty: 'Garantía',
  id: 'Identidad',
  invoice: 'Factura',
  appraisal: 'Tasación',
  annex: 'Anexo',
  other: 'Otro',
}

export const leaseDocumentCategoryLabels: Record<string, string> = {
  contract: 'Contrato de arriendo',
  annex: 'Anexo',
  other: 'Otro',
}

export const propertyDocumentCategoryLabels: Record<string, string> = {
  deed: 'Escritura',
  contract: 'Contrato',
  certificate: 'Certificado',
  other: 'Otro',
}

export function documentCategoryLabel(doc: Pick<Document, 'category' | 'entity_type'>): string {
  if (doc.entity_type === 'lease') {
    return leaseDocumentCategoryLabels[doc.category] ?? categoryLabels[doc.category] ?? doc.category
  }
  if (doc.entity_type === 'property') {
    return propertyDocumentCategoryLabels[doc.category] ?? categoryLabels[doc.category] ?? doc.category
  }
  return categoryLabels[doc.category] ?? doc.category
}

export const entityTypeLabels: Record<string, string> = {
  property: 'Propiedad',
  lease: 'Arriendo',
  general: 'General',
}

export type DocumentEntityFilter = '' | 'property' | 'lease' | 'general'

export function documentEntityTypeKey(doc: Document): 'property' | 'lease' | 'general' {
  if (doc.entity_type === 'property' && doc.entity_id) return 'property'
  if (doc.entity_type === 'lease' && doc.entity_id) return 'lease'
  return 'general'
}

export function documentEntityTypeLabel(doc: Document): string {
  return entityTypeLabels[documentEntityTypeKey(doc)] ?? 'General'
}

/** Calendar date (YYYY-MM-DD) in the user's local timezone for filtering/display parity. */
export function documentCreatedDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  return match?.[1] ?? 'application/octet-stream'
}

/** Max raw file size accepted by the API (must match backend MAX_UPLOAD_MB). */
export const MAX_DOCUMENT_UPLOAD_BYTES = 30 * 1024 * 1024

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const DOCUMENT_UPLOAD_HINT = `PDF, Word o imagen · máx. ${formatFileSize(MAX_DOCUMENT_UPLOAD_BYTES)}`

export function validateDocumentFileSize(file: File): string | null {
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return `El archivo (${formatFileSize(file.size)}) supera el límite de ${formatFileSize(MAX_DOCUMENT_UPLOAD_BYTES)}. Comprime el PDF o elige un archivo más pequeño.`
  }
  return null
}

export function resolveMimeType(doc: Pick<Document, 'mime_type' | 'file_name' | 'file_data'>): string {
  if (doc.mime_type) return doc.mime_type
  if (doc.file_data) return mimeFromDataUrl(doc.file_data)
  const ext = doc.file_name?.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

export function isPdf(mime: string, fileName: string): boolean {
  return mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')
}

export function isImage(mime: string, fileName: string): boolean {
  return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(fileName)
}

export function isWord(mime: string, fileName: string): boolean {
  return (
    mime.includes('word')
    || mime.includes('msword')
    || mime.includes('wordprocessingml')
    || /\.(doc|docx)$/i.test(fileName)
  )
}

export type DocumentFileRef = Pick<Document, 'id' | 'file_name' | 'file_data' | 'mime_type' | 'storage_path'>

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Returns a URL suitable for viewing/downloading (data: or blob:). Caller should revoke blob: URLs when done. */
export async function resolveDocumentFileUrl(doc: DocumentFileRef): Promise<string | null> {
  if (doc.file_data) return doc.file_data
  if (!doc.id) return null
  const blob = await api.fetchDocumentFile(doc.id)
  return URL.createObjectURL(blob)
}

export async function resolveDocumentFileData(doc: DocumentFileRef): Promise<string | null> {
  if (doc.file_data) return doc.file_data
  if (!doc.id) return null
  const blob = await api.fetchDocumentFile(doc.id)
  return blobToDataUrl(blob)
}

export async function downloadDocumentFile(doc: DocumentFileRef): Promise<void> {
  const fileName = doc.file_name || 'documento'
  let url: string | null = null
  let revoke = false
  try {
    if (doc.file_data) {
      url = doc.file_data
    } else if (doc.id) {
      const blob = await api.fetchDocumentFile(doc.id)
      url = URL.createObjectURL(blob)
      revoke = true
    }
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    if (revoke && url?.startsWith('blob:')) URL.revokeObjectURL(url)
  }
}

export type ViewDocumentResult =
  | { action: 'open'; url: string }
  | { action: 'preview'; url: string; title: string }
  | { action: 'word_unavailable' }

export async function viewDocument(doc: DocumentFileRef & Pick<Document, 'title'>): Promise<ViewDocumentResult> {
  let url: string | null = null
  let revoke = false
  let mime = resolveMimeType(doc)
  try {
    if (doc.file_data) {
      url = doc.file_data
      mime = resolveMimeType({ ...doc, file_data: doc.file_data })
    } else if (doc.id) {
      const blob = await api.fetchDocumentFile(doc.id)
      mime = blob.type || mime
      url = URL.createObjectURL(blob)
      revoke = false
    }
    if (!url) throw new Error('No se pudo cargar el archivo')
    const fileName = doc.file_name || ''

    if (isImage(mime, fileName)) {
      return { action: 'preview', url, title: doc.title || fileName }
    }
    if (isPdf(mime, fileName)) {
      return { action: 'open', url }
    }
    if (isWord(mime, fileName)) {
      if (revoke && url.startsWith('blob:')) URL.revokeObjectURL(url)
      return { action: 'word_unavailable' }
    }
    return { action: 'open', url }
  } catch (err) {
    if (revoke && url?.startsWith('blob:')) URL.revokeObjectURL(url)
    throw err
  }
}

export function documentPropertyId(
  doc: Document,
  leaseMap: Map<string, Lease>,
): string | null {
  if (doc.entity_type === 'property' && doc.entity_id) return doc.entity_id
  if (doc.entity_type === 'lease' && doc.entity_id) {
    return leaseMap.get(doc.entity_id)?.property_id ?? null
  }
  return null
}

export function documentPropertyName(
  doc: Document,
  propertyMap: Map<string, string>,
  leaseMap: Map<string, Lease>,
): string {
  const propertyId = documentPropertyId(doc, leaseMap)
  if (!propertyId) return '—'
  return propertyMap.get(propertyId) ?? '—'
}

export function documentLinkedEntityLabel(
  doc: Document,
  propertyMap: Map<string, string>,
  leaseMap: Map<string, Lease>,
  tenantMap: Map<string, Tenant>,
  properties?: { id: string; name: string; type?: string; unit_number?: string; address?: { property_rol?: string } }[],
): string {
  if (doc.entity_type === 'property' && doc.entity_id) {
    const prop = properties?.find((p) => p.id === doc.entity_id)
    if (prop) return propertyLinkLabel(prop)
    return propertyMap.get(doc.entity_id) ?? '—'
  }
  if (doc.entity_type === 'lease' && doc.entity_id) {
    const lease = leaseMap.get(doc.entity_id)
    if (!lease) return 'Arriendo desconocido'
    const prop = properties?.find((p) => p.id === lease.property_id)
    const propLabel = prop
      ? propertyLinkLabel(prop)
      : propertyMap.get(lease.property_id) ?? '—'
    const tenant = tenantMap.get(lease.tenant_id)
    const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}`.trim() : '—'
    return `${propLabel} · ${tenantName}`
  }
  return 'Sin vincular'
}
