import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import { SortableTableHead } from '@/components/SortableTableHead'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton } from '@/components/ui/page'
import { useTableSort } from '@/hooks/useTableSort'
import { api, type Document } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'

const categoryLabels: Record<string, string> = {
  contract: 'Contrato',
  deed: 'Escritura',
  certificate: 'Certificado',
  warranty: 'Garantía',
  id: 'Identidad',
  invoice: 'Factura',
  appraisal: 'Tasación',
  other: 'Otro',
}

const DOCUMENT_CATEGORIES = [
  'deed',
  'contract',
  'certificate',
  'warranty',
  'id',
  'invoice',
  'appraisal',
  'other',
] as const

type DocumentView = 'tabla' | 'tarjetas' | 'agrupado'
type DocumentGroupBy = 'categoria' | 'propiedad'
type DocumentSortKey = 'titulo' | 'categoria' | 'fecha' | 'propiedad'

type DocumentFilters = {
  categoria: string
  propiedad: string
  q: string
  vista: DocumentView
  agrupar: DocumentGroupBy
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

function parseFiltersFromURL(searchParams: URLSearchParams): DocumentFilters {
  const vistaParam = searchParams.get('vista') ?? 'tarjetas'
  const vista: DocumentView = vistaParam === 'tabla' || vistaParam === 'agrupado' ? vistaParam : 'tarjetas'

  const agruparParam = searchParams.get('agrupar') ?? 'categoria'
  const agrupar: DocumentGroupBy = agruparParam === 'propiedad' ? 'propiedad' : 'categoria'

  const categoria = searchParams.get('categoria') ?? ''
  const validCategoria = DOCUMENT_CATEGORIES.includes(categoria as (typeof DOCUMENT_CATEGORIES)[number])
    ? categoria
    : ''

  return {
    categoria: validCategoria,
    propiedad: searchParams.get('propiedad') ?? '',
    q: searchParams.get('q') ?? '',
    vista,
    agrupar,
  }
}

function filtersToSearchParams(filters: DocumentFilters): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.categoria) next.set('categoria', filters.categoria)
  if (filters.propiedad) next.set('propiedad', filters.propiedad)
  const q = filters.q.trim()
  if (q) next.set('q', q)
  if (filters.vista !== 'tarjetas') next.set('vista', filters.vista)
  if (filters.vista === 'agrupado' && filters.agrupar !== 'categoria') next.set('agrupar', filters.agrupar)
  return next
}

function countActiveFilters(filters: DocumentFilters): number {
  let count = 0
  if (filters.categoria) count++
  if (filters.propiedad) count++
  if (filters.q.trim()) count++
  return count
}

function matchesDocumentSearch(doc: Document, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [doc.title, doc.file_name].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(needle)
}

function applyDocumentFilters(
  documents: Document[],
  filters: DocumentFilters,
): Document[] {
  return documents.filter((doc) => {
    if (filters.categoria && doc.category !== filters.categoria) return false
    if (filters.propiedad) {
      if (filters.propiedad === SIN_PROPIEDAD) {
        if (doc.entity_type === 'property' && doc.entity_id) return false
      } else if (doc.entity_id !== filters.propiedad) {
        return false
      }
    }
    if (!matchesDocumentSearch(doc, filters.q)) return false
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
): { key: string; label: string; documents: Document[] }[] {
  const groups = new Map<string, Document[]>()
  for (const doc of documents) {
    const key = groupBy === 'categoria'
      ? doc.category
      : doc.entity_type === 'property' && doc.entity_id
        ? doc.entity_id
        : SIN_PROPIEDAD
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

function documentPropertyName(doc: Document, propertyMap: Map<string, string>): string {
  if (doc.entity_type === 'property' && doc.entity_id) {
    return propertyMap.get(doc.entity_id) ?? '—'
  }
  return '—'
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

async function downloadDocumentFile(doc: Pick<Document, 'id' | 'file_name' | 'file_data'>) {
  let fileData = doc.file_data
  const fileName = doc.file_name || 'documento'
  if (!fileData) {
    const full = await api.getDocument(doc.id)
    fileData = full.file_data
  }
  if (!fileData) return
  const link = document.createElement('a')
  link.href = fileData
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
        {form.file_name && (
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{form.file_name}</p>
            {(form.file_data || documentId) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-7 text-xs"
                onClick={() => void downloadDocumentFile({
                  id: documentId ?? '',
                  file_name: form.file_name,
                  file_data: form.file_data || undefined,
                })}
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </Button>
            )}
          </div>
        )}
      </FormField>
    </>
  )
}

function DocumentCard({
  doc,
  propertyName,
  onEdit,
  onDownload,
}: {
  doc: Document
  propertyName: string
  onEdit: (doc: Document) => void
  onDownload: (doc: Document) => void
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
            {categoryLabels[doc.category] || doc.category} · v{doc.version}
          </p>
          {propertyName !== '—' && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{propertyName}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <p className="min-w-0 truncate">{doc.file_name}</p>
        {doc.file_name && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-8"
            onClick={(e) => {
              e.stopPropagation()
              onDownload(doc)
            }}
          >
            <Download className="h-4 w-4" />
            Descargar
          </Button>
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
    queryFn: () => api.getDocuments(1, { limit: 500 }),
  })
  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties({ limit: 500 }),
  })

  const propertyMap = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p.name])),
    [properties],
  )

  const allDocuments = data?.data ?? []
  const categoryBreakdown = useMemo(() => countByCategory(allDocuments), [allDocuments])
  const filteredDocuments = useMemo(
    () => applyDocumentFilters(allDocuments, filters),
    [allDocuments, filters],
  )

  const documentComparators = useMemo<Record<DocumentSortKey, (a: Document, b: Document) => number>>(() => ({
    titulo: (a, b) => a.title.localeCompare(b.title, 'es'),
    categoria: (a, b) => (categoryLabels[a.category] ?? a.category).localeCompare(
      categoryLabels[b.category] ?? b.category,
      'es',
    ),
    fecha: (a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta - tb
    },
    propiedad: (a, b) => documentPropertyName(a, propertyMap).localeCompare(
      documentPropertyName(b, propertyMap),
      'es',
    ),
  }), [propertyMap])

  const { sortedItems: sortedDocuments, sortKey, sortDir, toggleSort } = useTableSort<Document, DocumentSortKey>(
    filteredDocuments,
    'titulo',
    documentComparators,
    'asc',
  )

  const groupedDocuments = useMemo(
    () => groupDocuments(sortedDocuments, filters.agrupar, propertyMap),
    [sortedDocuments, filters.agrupar, propertyMap],
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

  const clearFilters = () => {
    const next = new URLSearchParams()
    if (filters.vista !== 'tarjetas') next.set('vista', filters.vista)
    if (filters.vista === 'agrupado' && filters.agrupar !== 'categoria') next.set('agrupar', filters.agrupar)
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
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => updateFilters({ q: e.target.value })}
              placeholder="Buscar por título o archivo…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1">
            <span className="text-xs text-muted-foreground shrink-0">Vista:</span>
            <div className="flex rounded-md border p-0.5">
              <Button
                type="button"
                variant={filters.vista === 'tabla' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => updateFilters({ vista: 'tabla' })}
                title="Tabla"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={filters.vista === 'tarjetas' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => updateFilters({ vista: 'tarjetas' })}
                title="Tarjetas"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={filters.vista === 'agrupado' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => updateFilters({ vista: 'agrupado' })}
                title="Agrupado"
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
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
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Categoría"
                      sortKey="categoria"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Propiedad"
                      sortKey="propiedad"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <th className="p-4 font-medium">Archivo</th>
                    <th className="p-4 font-medium">Versión</th>
                    <SortableTableHead
                      label="Fecha"
                      sortKey="fecha"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <th className="p-4 font-medium w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className={cn('border-b hover:bg-muted/50', doc.active === false && 'opacity-60')}
                    >
                      <td className="p-4 font-medium">{doc.title}</td>
                      <td className="p-4 text-muted-foreground">{categoryLabels[doc.category] ?? doc.category}</td>
                      <td className="p-4 text-muted-foreground">{documentPropertyName(doc, propertyMap)}</td>
                      <td className="p-4 text-muted-foreground max-w-[200px] truncate">{doc.file_name || '—'}</td>
                      <td className="p-4 text-muted-foreground">v{doc.version}</td>
                      <td className="p-4 text-muted-foreground">
                        {doc.created_at ? formatDate(doc.created_at) : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {doc.file_name && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => void downloadDocumentFile(doc)}
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
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
                    propertyName={documentPropertyName(doc, propertyMap)}
                    onEdit={openEdit}
                    onDownload={(d) => void downloadDocumentFile(d)}
                  />
                ))}
              </div>
            </DocumentGroupSection>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              propertyName={documentPropertyName(doc, propertyMap)}
              onEdit={openEdit}
              onDownload={(d) => void downloadDocumentFile(d)}
            />
          ))}
        </div>
      )}

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
