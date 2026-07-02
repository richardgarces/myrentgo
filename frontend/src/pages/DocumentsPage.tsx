import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { api, type Document } from '@/lib/api'
import { cn } from '@/lib/utils'

const categoryLabels: Record<string, string> = {
  contract: 'Contrato', deed: 'Escritura', certificate: 'Certificado',
  warranty: 'Garantía', id: 'Identidad', invoice: 'Factura', appraisal: 'Tasación', other: 'Otro',
}

const emptyForm = { title: '', category: 'contract', entity_type: 'property', entity_id: '', file_name: '', file_data: '', mime_type: '', size_bytes: 0 }

type DocumentForm = typeof emptyForm

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
}: {
  form: DocumentForm
  setForm: (form: DocumentForm) => void
  properties?: { data: { id: string; name: string }[] }
}) {
  return (
    <>
      <FormField label="Título">
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </FormField>
      <FormField label="Categoría">
        <FormSelect value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="contract">Contrato</option>
          <option value="deed">Escritura</option>
          <option value="certificate">Certificado</option>
          <option value="warranty">Garantía</option>
          <option value="appraisal">Tasación</option>
          <option value="other">Otro</option>
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
        {form.file_name && <p className="text-xs text-muted-foreground mt-1">{form.file_name}</p>}
      </FormField>
    </>
  )
}

function DocumentCard({ doc, onEdit }: { doc: Document; onEdit: (doc: Document) => void }) {
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
          <p className="text-xs text-muted-foreground">{categoryLabels[doc.category] || doc.category} · v{doc.version}</p>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground"><p>{doc.file_name}</p></CardContent>
    </Card>
  )
}

export function DocumentsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['documents'], queryFn: () => api.getDocuments() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })

  const editingDoc = data?.data.find((doc) => doc.id === editingId)

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
      <PageHeader
        title={t('nav.documents')}
        count={data?.total}
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Registrar documento</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {data?.data.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} onEdit={openEdit} />
        ))}
      </div>
      {!data?.data.length && <EmptyState message="Sin documentos registrados." />}

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
        <DocumentFormFields form={form} setForm={setForm} properties={properties} />
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
