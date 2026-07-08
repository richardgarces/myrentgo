import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import { DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { DocumentActions } from '@/components/DocumentActions'
import { SortableTableHead } from '@/components/SortableTableHead'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton } from '@/components/ui/page'
import { api, type Document, type Lease } from '@/lib/api'
import {
  categoryLabels,
  documentCategoryLabel,
  documentEntityTypeKey,
  documentEntityTypeLabel,
  documentLinkedEntityLabel,
  documentPropertyId,
  documentPropertyName,
  documentCreatedDateKey,
  DOCUMENT_CATEGORIES,
  DOCUMENT_UPLOAD_HINT,
  validateDocumentFileSize,
  type DocumentEntityFilter,
} from '@/lib/document-utils'
import { cn, formatDate } from '@/lib/utils'
import type { ViewMode } from '@/lib/view-mode'

type DocumentView = ViewMode | 'agrupado'
type DocumentGroupBy = 'categoria' | 'propiedad'
type DocumentSortKey = 'titulo' | 'categoria' | 'fecha' | 'propiedad' | 'origen'

type DocumentFilters = {
  categoria: string
  propiedad: string
  origen: DocumentEntityFilter
  q: string
  vista: DocumentView
  agrupar: DocumentGroupBy
  desde: string
  hasta: string
  orden: DocumentSortKey
  dir: 'asc' | 'desc'
}

const SIN_PROPIEDAD = '__sin_propiedad__'

const emptyForm = {
  title: '',
  category: 'contract',
  entity_type: 'property',
  entity_id: '',
  file_name: '',
  file_data: '',
  mime_type: '',
  size_bytes: 0,
}

type DocumentForm = typeof emptyForm

const SORT_OPTIONS: { value: DocumentSortKey; label: string }[] = [
  { value: 'titulo', label: 'Título' },
  { value: 'categoria', label: 'Categoría' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'propiedad', label: 'Propiedad' },
  { value: 'origen', label: 'Origen' },
]

function parseFiltersFromURL(searchParams: URLSearchParams): DocumentFilters {
  const vistaParam = searchParams.get('vista') ?? 'tarjetas'
  const vista: DocumentView = vistaParam === 'tabla' || vistaParam === 'agrupado' || vistaParam === 'lista'
    ? vistaParam
    : 'tarjetas'

  const agruparParam = searchParams.get('agrupar') ?? 'categoria'
  const agrupar: DocumentGroupBy = agruparParam === 'propiedad' ? 'propiedad' : 'categoria'

  const categoria = searchParams.get('categoria') ?? ''
  const validCategoria = DOCUMENT_CATEGORIES.includes(categoria as (typeof DOCUMENT_CATEGORIES)[number])
    ? categoria
    : ''

  const origenParam = searchParams.get('origen') ?? ''
  const origen: DocumentEntityFilter = origenParam === 'property' || origenParam === 'lease' || origenParam === 'general'
    ? origenParam
    : ''

  const ordenParam = searchParams.get('orden') ?? 'titulo'
  const orden: DocumentSortKey = SORT_OPTIONS.some((o) => o.value === ordenParam)
    ? (ordenParam as DocumentSortKey)
    : 'titulo'

  const dirParam = searchParams.get('dir') ?? 'asc'
  const dir: 'asc' | 'desc' = dirParam === 'desc' ? 'desc' : 'asc'

  return {
    categoria: validCategoria,
    propiedad: searchParams.get('propiedad') ?? '',
    origen,
    q: searchParams.get('q') ?? '',
    vista,
    agrupar,
    desde: searchParams.get('desde') ?? '',
    hasta: searchParams.get('hasta') ?? '',
    orden,
    dir,
  }
}

function filtersToSearchParams(filters: DocumentFilters): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.categoria) next.set('categoria', filters.categoria)
  if (filters.propiedad) next.set('propiedad', filters.propiedad)
  if (filters.origen) next.set('origen', filters.origen)
  const q = filters.q.trim()
  if (q) next.set('q', q)
  if (filters.desde) next.set('desde', filters.desde)
  if (filters.hasta) next.set('hasta', filters.hasta)
  if (filters.vista !== 'tarjetas') next.set('vista', filters.vista)
  if (filters.vista === 'agrupado' && filters.agrupar !== 'categoria') next.set('agrupar', filters.agrupar)
  if (filters.orden !== 'titulo') next.set('orden', filters.orden)
  if (filters.dir !== 'asc') next.set('dir', filters.dir)
  return next
}

function countActiveFilters(filters: DocumentFilters): number {
  let count = 0
  if (filters.categoria) count++
  if (filters.propiedad) count++
  if (filters.origen) count++
  if (filters.q.trim()) count++
  if (filters.desde) count++
  if (filters.hasta) count++
  return count
}

function matchesDocumentSearch(doc: Document, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [doc.title, doc.file_name].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(needle)
}

function matchesDateRange(doc: Document, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true
  if (!doc.created_at) return false
  const date = documentCreatedDateKey(doc.created_at)
  if (desde && date < desde) return false
  if (hasta && date > hasta) return false
  return true
}

function applyDocumentFilters(
  documents: Document[],
  filters: DocumentFilters,
  leaseMap: Map<string, Lease>,
): Document[] {
  return documents.filter((doc) => {
    if (filters.categoria && doc.category !== filters.categoria) return false
    if (filters.origen && documentEntityTypeKey(doc) !== filters.origen) return false
    if (filters.propiedad) {
      const propId = documentPropertyId(doc, leaseMap)
      if (filters.propiedad === SIN_PROPIEDAD) {
        if (propId) return false
      } else if (propId !== filters.propiedad) {
        return false
      }
    }
    if (!matchesDocumentSearch(doc, filters.q)) return false
    if (!matchesDateRange(doc, filters.desde, filters.hasta)) return false
    return true
  })
}

function countByCategory(documents: Document[]): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const cat of DOCUMENT_CATEGORIES) counts.set(cat, 0)
  for (const doc of documents) {
    counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1)
  }
  return DOCUMENT_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }))
}

function groupDocuments(
  documents: Document[],
  groupBy: DocumentGroupBy,
  propertyMap: Map<string, string>,
  leaseMap: Map<string, Lease>,
): { key: string; label: string; documents: Document[] }[] {
  const groups = new Map<string, Document[]>()
  for (const doc of documents) {
    const key = groupBy === 'categoria'
      ? doc.category
      : documentPropertyId(doc, leaseMap) ?? SIN_PROPIEDAD
    const list = groups.get(key) ?? []
    list.push(doc)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .map(([key, docs]) => ({
      key,
      label: groupBy === 'categoria'
        ? categoryLabels[key] ?? key
        : key === SIN_PROPIEDAD
          ? 'Sin propiedad vinculada'
          : propertyMap.get(key) ?? 'Propiedad desconocida',
      documents: docs,
    }))
    .sort((a, b) => {
      if (groupBy === 'categoria') {
        const idxA = DOCUMENT_CATEGORIES.indexOf(a.key as (typeof DOCUMENT_CATEGORIES)[number])
        const idxB = DOCUMENT_CATEGORIES.indexOf(b.key as (typeof DOCUMENT_CATEGORIES)[number])
        if (idxA !== -1 && idxB !== -1 && idxA !== idxB) return idxA - idxB
      }
      if (a.key === SIN_PROPIEDAD) return 1
      if (b.key === SIN_PROPIEDAD) return -1
      return a.label.localeCompare(b.label, 'es')
    })
}

function documentToForm(doc: Document): DocumentForm {
  return {
    title: doc.title,
    category: doc.category,
    entity_type: doc.entity_type,
    entity_id: doc.entity_id,
    file_name: doc.file_name,
    file_data: doc.file_data ?? '',
    mime_type: doc.mime_type ?? '',
    size_bytes: doc.size_bytes ?? 0,
  }
}

function formToPayload(form: DocumentForm) {
  return {
    title: form.title,
    category: form.category,
    entity_type: form.entity_type,
    entity_id: form.entity_id,
    file_name: form.file_name || `${form.title}.pdf`,
    ...(form.file_data ? {
      file_data: form.file_data,
      mime_type: form.mime_type || undefined,
      size_bytes: form.size_bytes || undefined,
    } : {}),
  }
}

function DocumentFormFields({
  form,
  setForm,
  properties,
  documentId,
}: {
  form: DocumentForm
  setForm: (form: DocumentForm) => void
  properties?: { data: { id: string; name: string }[] }
  documentId?: string | null
}) {
  const [fileError, setFileError] = useState<string | null>(null)

  return (
    <>
      <FormField label="Título">
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </FormField>
      <FormField label="Categoría">
        <FormSelect value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{categoryLabels[cat]}</option>
          ))}
        </FormSelect>
      </FormField>
      <FormField label="Propiedad vinculada">
        <FormSelect
          required
          value={form.entity_id}
          onChange={(e) => setForm({ ...form, entity_id: e.target.value, entity_type: 'property' })}
        >
          <option value="">Seleccionar…</option>
          {properties?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FormSelect>
      </FormField>
      <FormField label="Archivo">
        <Input
          type="file"
          accept=".pdf,.doc,.docx,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const sizeError = validateDocumentFileSize(file)
            if (sizeError) {
              setFileError(sizeError)
              e.target.value = ''
              return
            }
            setFileError(null)
            const reader = new FileReader()
            reader.onload = () => {
              const file_data = reader.result as string
              const mimeMatch = file_data.match(/^data:([^;]+);base64,/)
              setForm({
                ...form,
                file_name: file.name,
                file_data,
                mime_type: mimeMatch?.[1] ?? 'application/octet-stream',
                size_bytes: file.size,
              })
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">{DOCUMENT_UPLOAD_HINT}</p>
        {fileError && <p className="mt-1 text-sm text-destructive">{fileError}</p>}
        {form.file_name && (
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{form.file_name}</p>
            {(form.file_data || documentId) && (
              <DocumentActions
                doc={{
                  id: documentId ?? '',
                  title: form.title,
                  file_name: form.file_name,
                  file_data: form.file_data || undefined,
                  mime_type: form.mime_type || undefined,
                }}
                variant="buttons"
              />
            )}
          </div>
        )}
      </FormField>
    </>
  )
}

function DocumentCard({
  doc,
  linkedEntity,
  propertyName,
  onEdit,
}: {
  doc: Document
  linkedEntity: string
  propertyName: string
  onEdit: (doc: Document) => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onEdit(doc)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(doc) } }}
      className={cn(
        'hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40',
        doc.active === false && 'opacity-60 bg-muted/30',
      )}
    >
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{doc.title}</CardTitle>
            {doc.active === false && (
              <span className="text-xs px-2 py-1 rounded-full shrink-0 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                Inactivo
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {documentCategoryLabel(doc)} · {documentEntityTypeLabel(doc)} · v{doc.version}
          </p>
          {linkedEntity !== '—' && linkedEntity !== 'Sin vincular' && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{linkedEntity}</p>
          )}
          {propertyName !== '—' && linkedEntity === 'Sin vincular' && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{propertyName}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="min-w-0 truncate">{doc.file_name}</p>
        {doc.created_at && (
          <p className="text-xs">{formatDate(doc.created_at)}</p>
        )}
        {doc.file_name && (
          <DocumentActions doc={doc} variant="buttons" />
        )}
      </CardContent>
    </Card>
  )
}

function DocumentGroupSection({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">({count})</span>
      </button>
      {expanded && <div className="border-t px-4 pb-4 pt-4">{children}</div>}
    </div>
  )
}

export function DocumentsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams])
  const activeFilterCount = countActiveFilters(filters)

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(1, { limit: 500, omit_file_data: true }),
  })
  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties({ limit: 500 }),
  })
  const { data: leasesData } = useQuery({
    queryKey: ['leases'],
    queryFn: () => api.getLeases(1, undefined, 500),
  })
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.getTenants(1, 500),
  })

  const propertyMap = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p.name])),
    [properties],
  )
  const leaseMap = useMemo(
    () => new Map((leasesData?.data ?? []).map((l) => [l.id, l])),
    [leasesData],
  )
  const tenantMap = useMemo(
    () => new Map((tenantsData?.data ?? []).map((t) => [t.id, t])),
    [tenantsData],
  )

  const allDocuments = data?.data ?? []
  const categoryBreakdown = useMemo(() => countByCategory(allDocuments), [allDocuments])
  const filteredDocuments = useMemo(
    () => applyDocumentFilters(allDocuments, filters, leaseMap),
    [allDocuments, filters, leaseMap],
  )

  const documentComparators = useMemo<Record<DocumentSortKey, (a: Document, b: Document) => number>>(() => ({
    titulo: (a, b) => a.title.localeCompare(b.title, 'es'),
    categoria: (a, b) => documentCategoryLabel(a).localeCompare(documentCategoryLabel(b), 'es'),
    fecha: (a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta - tb
    },
    propiedad: (a, b) => documentPropertyName(a, propertyMap, leaseMap).localeCompare(
      documentPropertyName(b, propertyMap, leaseMap),
      'es',
    ),
    origen: (a, b) => documentEntityTypeLabel(a).localeCompare(documentEntityTypeLabel(b), 'es'),
  }), [propertyMap, leaseMap])

  const sortedDocuments = useMemo(() => {
    const list = [...filteredDocuments]
    const cmp = documentComparators[filters.orden]
    if (!cmp) return list
    const dir = filters.dir === 'asc' ? 1 : -1
    return list.sort((a, b) => cmp(a, b) * dir)
  }, [filteredDocuments, filters.orden, filters.dir, documentComparators])

  const groupedDocuments = useMemo(
    () => groupDocuments(sortedDocuments, filters.agrupar, propertyMap, leaseMap),
    [sortedDocuments, filters.agrupar, propertyMap, leaseMap],
  )

  const groupKeys = useMemo(() => groupedDocuments.map((g) => g.key), [groupedDocuments])

  useEffect(() => {
    if (filters.vista !== 'agrupado' || groupKeys.length === 0) return
    setExpandedGroups((prev) => {
      if (prev.size > 0) return prev
      return new Set(groupKeys.length <= 5 ? groupKeys : [groupKeys[0]])
    })
  }, [filters.vista, groupKeys])

  const editingDoc = allDocuments.find((doc) => doc.id === editingId)
  const totalCount = data?.total ?? allDocuments.length
  const filteredCount = filteredDocuments.length

  const updateFilters = (patch: Partial<DocumentFilters>) => {
    const next = { ...filters, ...patch }
    setSearchParams(filtersToSearchParams(next), { replace: true })
  }

  const handleTableSort = (key: DocumentSortKey) => {
    const newDir = filters.orden === key && filters.dir === 'asc' ? 'desc' : 'asc'
    updateFilters({ orden: key, dir: newDir })
  }

  const clearFilters = () => {
    const next = new URLSearchParams()
    if (filters.vista !== 'tarjetas') next.set('vista', filters.vista)
    if (filters.vista === 'agrupado' && filters.agrupar !== 'categoria') next.set('agrupar', filters.agrupar)
    if (filters.orden !== 'titulo') next.set('orden', filters.orden)
    if (filters.dir !== 'asc') next.set('dir', filters.dir)
    setSearchParams(next, { replace: true })
  }

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const closeDialog = () => {
    setOpen(false)
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setConfirmDelete(false)
    setConfirmDeactivate(false)
  }

  const openCreate = () => {
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (doc: Document) => {
    setMode('edit')
    setEditingId(doc.id)
    setForm(documentToForm(doc))
    setOpen(true)
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['documents'] })
    closeDialog()
  }

  const create = useMutation({
    mutationFn: () => api.createDocument(formToPayload(form)),
    onSuccess,
  })

  const update = useMutation({
    mutationFn: () => api.updateDocument(editingId!, formToPayload(form)),
    onSuccess,
  })

  const remove = useMutation({
    mutationFn: () => api.deleteDocument(editingId!),
    onSuccess,
  })

  const deactivate = useMutation({
    mutationFn: () => api.deactivateDocument(editingId!),
    onSuccess,
  })

  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || remove.error || deactivate.error
  const canDeactivate = editingDoc?.active !== false

  const linkedEntityFor = (doc: Document) => documentLinkedEntityLabel(
    doc,
    propertyMap,
    leaseMap,
    tenantMap,
    properties?.data,
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.documents')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeFilterCount > 0
              ? `${filteredCount} de ${totalCount} documento(s)`
              : `${totalCount} documento(s)`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Registrar documento</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {categoryBreakdown.map(({ category, count }) => {
              const isActive = filters.categoria === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => updateFilters({ categoria: isActive ? '' : category })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                    count === 0 && !isActive && 'opacity-50',
                    isActive
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'bg-muted/50 hover:bg-muted',
                  )}
                >
                  <span className="font-medium">{categoryLabels[category]}</span>
                  <span className={cn('text-muted-foreground', isActive && 'text-foreground/80')}>{count}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Filtros</CardTitle>
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {activeFilterCount} filtro(s) activo(s)
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                  <X className="h-4 w-4" />
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormSelect value={filters.origen} onChange={(e) => updateFilters({ origen: e.target.value as DocumentEntityFilter })}>
            <option value="">Origen: todos</option>
            <option value="property">Propiedad</option>
            <option value="lease">Arriendo</option>
            <option value="general">General / sin vincular</option>
          </FormSelect>
          <FormSelect value={filters.categoria} onChange={(e) => updateFilters({ categoria: e.target.value })}>
            <option value="">Categoría: todas</option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{categoryLabels[cat]}</option>
            ))}
          </FormSelect>
          <FormSelect value={filters.propiedad} onChange={(e) => updateFilters({ propiedad: e.target.value })}>
            <option value="">Propiedad: todas</option>
            <option value={SIN_PROPIEDAD}>Sin propiedad vinculada</option>
            {(properties?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </FormSelect>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => updateFilters({ q: e.target.value })}
              placeholder="Buscar por título o archivo…"
              className="pl-9"
            />
          </div>
          <FormField label="Desde">
            <Input
              type="date"
              value={filters.desde}
              onChange={(e) => updateFilters({ desde: e.target.value })}
            />
          </FormField>
          <FormField label="Hasta">
            <Input
              type="date"
              value={filters.hasta}
              onChange={(e) => updateFilters({ hasta: e.target.value })}
            />
          </FormField>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span className="text-xs text-muted-foreground shrink-0">Ordenar:</span>
            <FormSelect
              value={filters.orden}
              onChange={(e) => updateFilters({ orden: e.target.value as DocumentSortKey })}
              className="h-8 text-xs flex-1 min-w-[120px]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </FormSelect>
            <FormSelect
              value={filters.dir}
              onChange={(e) => updateFilters({ dir: e.target.value as 'asc' | 'desc' })}
              className="h-8 text-xs w-[110px]"
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </FormSelect>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <ViewModeToggle
              value={filters.vista === 'agrupado' ? undefined : filters.vista}
              onChange={(mode) => updateFilters({ vista: mode })}
              extra={(
                <>
                  <Button
                    type="button"
                    variant={filters.vista === 'agrupado' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => updateFilters({ vista: 'agrupado' })}
                    title="Agrupado"
                    aria-label="Agrupado"
                    aria-pressed={filters.vista === 'agrupado'}
                  >
                    <Rows3 className="h-4 w-4" />
                  </Button>
                  {filters.vista === 'agrupado' && (
                    <FormSelect
                      value={filters.agrupar}
                      onChange={(e) => updateFilters({ agrupar: e.target.value as DocumentGroupBy })}
                      className="h-8 text-xs"
                    >
                      <option value="categoria">Agrupar por categoría</option>
                      <option value="propiedad">Agrupar por propiedad</option>
                    </FormSelect>
                  )}
                </>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {filteredCount === 0 ? (
        <EmptyState message={activeFilterCount > 0 ? 'Ningún documento coincide con los filtros.' : 'Sin documentos registrados.'} />
      ) : filters.vista === 'tabla' ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <SortableTableHead
                      label="Título"
                      sortKey="titulo"
                      activeKey={filters.orden}
                      direction={filters.dir}
                      onSort={handleTableSort}
                    />
                    <SortableTableHead
                      label="Categoría"
                      sortKey="categoria"
                      activeKey={filters.orden}
                      direction={filters.dir}
                      onSort={handleTableSort}
                    />
                    <SortableTableHead
                      label="Origen"
                      sortKey="origen"
                      activeKey={filters.orden}
                      direction={filters.dir}
                      onSort={handleTableSort}
                    />
                    <th className="p-4 font-medium">Vinculado a</th>
                    <SortableTableHead
                      label="Propiedad"
                      sortKey="propiedad"
                      activeKey={filters.orden}
                      direction={filters.dir}
                      onSort={handleTableSort}
                    />
                    <th className="p-4 font-medium">Archivo</th>
                    <th className="p-4 font-medium">Versión</th>
                    <SortableTableHead
                      label="Fecha"
                      sortKey="fecha"
                      activeKey={filters.orden}
                      direction={filters.dir}
                      onSort={handleTableSort}
                    />
                    <th className="p-4 font-medium w-36">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className={cn('border-b hover:bg-muted/50', doc.active === false && 'opacity-60')}
                    >
                      <td className="p-4 font-medium">{doc.title}</td>
                      <td className="p-4 text-muted-foreground">{documentCategoryLabel(doc)}</td>
                      <td className="p-4 text-muted-foreground">{documentEntityTypeLabel(doc)}</td>
                      <td className="p-4 text-muted-foreground max-w-[220px] truncate">{linkedEntityFor(doc)}</td>
                      <td className="p-4 text-muted-foreground">{documentPropertyName(doc, propertyMap, leaseMap)}</td>
                      <td className="p-4 text-muted-foreground max-w-[200px] truncate">{doc.file_name || '—'}</td>
                      <td className="p-4 text-muted-foreground">v{doc.version}</td>
                      <td className="p-4 text-muted-foreground">
                        {doc.created_at ? formatDate(doc.created_at) : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1 items-center">
                          {doc.file_name && <DocumentActions doc={doc} variant="icons" />}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(doc)}
                            title="Editar documento"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : filters.vista === 'lista' ? (
        <DataListShell>
          {sortedDocuments.map((doc) => (
            <DataListItem
              key={doc.id}
              onClick={() => openEdit(doc)}
              className={cn('justify-between gap-3', doc.active === false && 'opacity-60')}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {documentCategoryLabel(doc)}
                    {' · '}
                    {documentEntityTypeLabel(doc)}
                    {doc.created_at ? ` · ${formatDate(doc.created_at)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {doc.file_name && <DocumentActions doc={doc} variant="icons" />}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(doc)}
                  title="Editar documento"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </DataListItem>
          ))}
        </DataListShell>
      ) : filters.vista === 'agrupado' ? (
        <div className="space-y-3">
          {groupedDocuments.map(({ key, label, documents: groupDocs }) => (
            <DocumentGroupSection
              key={key}
              label={label}
              count={groupDocs.length}
              expanded={expandedGroups.has(key)}
              onToggle={() => toggleGroup(key)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {groupDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    linkedEntity={linkedEntityFor(doc)}
                    propertyName={documentPropertyName(doc, propertyMap, leaseMap)}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </DocumentGroupSection>
          ))}
        </div>
      ) : filters.vista === 'tarjetas' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              linkedEntity={linkedEntityFor(doc)}
              propertyName={documentPropertyName(doc, propertyMap, leaseMap)}
              onEdit={openEdit}
            />
          ))}
        </div>
      ) : null}

      <FormDialog
        open={open}
        onClose={closeDialog}
        title={mode === 'edit' ? 'Editar documento' : 'Registrar documento'}
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'edit') update.mutate()
          else create.mutate()
        }}
        loading={isSaving}
        footerStart={mode === 'edit' ? (
          <div className="flex gap-2">
            {canDeactivate && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeactivate(true)}
                disabled={isSaving || deactivate.isPending}
              >
                Dar de baja
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isSaving || remove.isPending}
            >
              Eliminar
            </Button>
          </div>
        ) : undefined}
      >
        <DocumentFormFields form={form} setForm={setForm} properties={properties} documentId={editingId} />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <PinConfirmDialog
        open={confirmDelete}
        title="Eliminar documento"
        message={`¿Estás seguro de eliminar "${editingDoc?.title ?? 'este documento'}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />

      <PinConfirmDialog
        open={confirmDeactivate}
        title="Dar de baja documento"
        message={`El documento "${editingDoc?.title ?? ''}" quedará inactivo pero se conservará en el sistema.`}
        confirmLabel="Dar de baja"
        loading={deactivate.isPending}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => deactivate.mutate()}
      />
    </div>
  )
}
