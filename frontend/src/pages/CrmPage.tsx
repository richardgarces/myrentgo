import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type CrmContact } from '@/lib/api'

const contactTypes = ['real_estate', 'bank', 'technician', 'supplier', 'building', 'other'] as const

const emptyForm = { type: 'real_estate', name: '', email: '', phone: '' }

type ContactForm = typeof emptyForm

function contactToForm(c: CrmContact): ContactForm {
  return {
    type: c.type,
    name: c.name,
    email: c.contact?.email ?? '',
    phone: c.contact?.phone ?? '',
  }
}

function formToPayload(form: ContactForm) {
  return {
    type: form.type,
    name: form.name,
    email: form.email || undefined,
    phone: form.phone || undefined,
  }
}

function ContactFormFields({
  form,
  setForm,
  t,
}: {
  form: ContactForm
  setForm: (form: ContactForm) => void
  t: (key: string) => string
}) {
  return (
    <>
      <FormField label={t('crm.type')}>
        <FormSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {contactTypes.map((type) => (
            <option key={type} value={type}>{t(`crm.types.${type}`)}</option>
          ))}
        </FormSelect>
      </FormField>
      <FormField label={t('crm.name')}>
        <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </FormField>
      <FormField label={t('crm.email')}>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </FormField>
      <FormField label={t('crm.phone')}>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </FormField>
    </>
  )
}

export function CrmPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewMode, setViewMode] = useViewMode('crm', 'tarjetas')

  const { data, isLoading } = useQuery({ queryKey: ['crm'], queryFn: () => api.getContacts() })

  const editingContact = data?.data.find((c) => c.id === editingId)

  const closeDialog = () => {
    setOpen(false)
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setConfirmDelete(false)
  }

  const openCreate = () => {
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (contact: CrmContact) => {
    setMode('edit')
    setEditingId(contact.id)
    setForm(contactToForm(contact))
    setOpen(true)
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['crm'] })
    closeDialog()
  }

  const create = useMutation({
    mutationFn: () => api.createContact(formToPayload(form)),
    onSuccess,
  })

  const update = useMutation({
    mutationFn: () => api.updateContact(editingId!, formToPayload(form)),
    onSuccess,
  })

  const remove = useMutation({
    mutationFn: () => api.deleteContact(editingId!),
    onSuccess,
    onError: () => setConfirmDelete(false),
  })

  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || remove.error
  const contacts = data?.data ?? []

  const typeLabel = (type: string) => t(`crm.types.${type}`, { defaultValue: type })

  const contactActions = (contact: CrmContact) => (
    <div className="flex gap-1 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openEdit(contact)}
        title={t('crm.edit')}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => { setEditingId(contact.id); setConfirmDelete(true) }}
        title={t('crm.delete')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.crm')}
        count={data?.total}
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> {t('crm.addContact')}</Button>}
      />

      {contacts.length > 0 && (
        <div className="flex justify-end">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      )}

      {!contacts.length ? (
        <EmptyState message={t('crm.empty')} />
      ) : viewMode === 'tabla' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">{t('crm.type')}</th>
                    <th className="p-4 font-medium">{t('crm.name')}</th>
                    <th className="p-4 font-medium">{t('crm.email')}</th>
                    <th className="p-4 font-medium">{t('crm.phone')}</th>
                    <th className="p-4 font-medium w-24" />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 text-muted-foreground">{typeLabel(c.type)}</td>
                      <td className="p-4 font-medium">{c.name}</td>
                      <td className="p-4">{c.contact?.email ?? '—'}</td>
                      <td className="p-4">{c.contact?.phone ?? '—'}</td>
                      <td className="p-4">{contactActions(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'lista' ? (
        <DataListShell>
          {contacts.map((c) => (
            <DataListItem key={c.id}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel(c.type)}
                  {(c.contact?.email || c.contact?.phone) && (
                    <> · {[c.contact?.email, c.contact?.phone].filter(Boolean).join(' · ')}</>
                  )}
                </p>
              </div>
              {contactActions(c)}
            </DataListItem>
          ))}
        </DataListShell>
      ) : (
        <DataCardGrid>
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase">{typeLabel(c.type)}</p>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                  </div>
                  {contactActions(c)}
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {c.contact?.email && <p>{c.contact.email}</p>}
                {c.contact?.phone && <p>{c.contact.phone}</p>}
              </CardContent>
            </Card>
          ))}
        </DataCardGrid>
      )}

      <FormDialog
        open={open}
        onClose={closeDialog}
        title={mode === 'edit' ? t('crm.editTitle') : t('crm.newContact')}
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'edit') update.mutate()
          else create.mutate()
        }}
        loading={isSaving}
        footerStart={mode === 'edit' ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={isSaving || remove.isPending}
          >
            {t('crm.delete')}
          </Button>
        ) : undefined}
      >
        <ContactFormFields form={form} setForm={setForm} t={t} />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <PinConfirmDialog
        open={confirmDelete}
        title={t('crm.deleteTitle')}
        message={t('crm.deleteMessage', { name: editingContact?.name ?? '' })}
        confirmLabel={t('crm.delete')}
        loading={remove.isPending}
        onClose={() => {
          setConfirmDelete(false)
          if (!open) setEditingId(null)
        }}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}
