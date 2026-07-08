import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell, Pencil, Plus, Trash2 } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type Maintenance } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  formatMaintenanceBulkFeedback,
  formatMaintenanceNotifyFeedback,
  formatNotificationError,
} from '@/lib/notification-errors'
import { NoRecipientsBanner } from '@/pages/notifications/NoRecipientsBanner'

const MAINTENANCE_TYPES = ['preventive', 'corrective', 'emergency'] as const
const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const

const emptyForm = {
  property_id: '',
  title: '',
  type: 'preventive',
  scheduled_date: '',
  cost: '',
  status: 'scheduled',
  notes: '',
}

type MaintenanceForm = typeof emptyForm

const notifyableStatuses = new Set(['scheduled', 'in_progress'])

type FeedbackState = {
  message: string
  warning?: string
  variant: 'success' | 'warning' | 'error'
} | null

function toDateInput(value?: string): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function maintenanceToForm(m: Maintenance): MaintenanceForm {
  return {
    property_id: m.property_id,
    title: m.title,
    type: m.type,
    scheduled_date: toDateInput(m.scheduled_date),
    cost: m.cost?.amount ? String(m.cost.amount) : '',
    status: m.status,
    notes: m.description ?? '',
  }
}

function formToCreatePayload(form: MaintenanceForm) {
  return {
    property_id: form.property_id,
    title: form.title,
    type: form.type,
    scheduled_date: form.scheduled_date,
    cost: form.cost ? Number(form.cost) : 0,
    notes: form.notes || undefined,
  }
}

function formToUpdatePayload(form: MaintenanceForm) {
  return {
    property_id: form.property_id,
    title: form.title,
    type: form.type,
    scheduled_date: form.scheduled_date,
    cost: form.cost ? Number(form.cost) : 0,
    status: form.status,
    notes: form.notes || undefined,
  }
}

function MaintenanceFormFields({
  form,
  setForm,
  mode,
  properties,
  t,
}: {
  form: MaintenanceForm
  setForm: (form: MaintenanceForm) => void
  mode: 'create' | 'edit'
  properties: { id: string; name: string }[]
  t: (key: string) => string
}) {
  return (
    <>
      <FormField label={t('maintenance.property')}>
        <FormSelect required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
          <option value="">{t('maintenance.selectProperty')}</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FormSelect>
      </FormField>
      <FormField label={t('maintenance.title')}>
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </FormField>
      <FormField label={t('maintenance.type')}>
        <FormSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {MAINTENANCE_TYPES.map((type) => (
            <option key={type} value={type}>{t(`maintenance.types.${type}`)}</option>
          ))}
        </FormSelect>
      </FormField>
      {mode === 'edit' && (
        <FormField label={t('maintenance.status')}>
          <FormSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {MAINTENANCE_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`maintenance.statuses.${status}`)}</option>
            ))}
          </FormSelect>
        </FormField>
      )}
      <FormField label={t('maintenance.date')}>
        <Input type="date" required value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
      </FormField>
      <FormField label={t('maintenance.cost')}>
        <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
      </FormField>
      <FormField label={t('maintenance.notes')}>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>
    </>
  )
}

export function MaintenancePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [viewMode, setViewMode] = useViewMode('maintenance', 'tabla')

  const { data, isLoading } = useQuery({ queryKey: ['maintenance'], queryFn: () => api.getMaintenance() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })

  const editingMaintenance = data?.data.find((m) => m.id === editingId)
  const propertyList = properties?.data ?? []

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

  const openEdit = (m: Maintenance) => {
    setMode('edit')
    setEditingId(m.id)
    setForm(maintenanceToForm(m))
    setOpen(true)
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['maintenance'] })
    closeDialog()
  }

  const create = useMutation({
    mutationFn: () => api.createMaintenance(formToCreatePayload(form)),
    onSuccess,
  })

  const update = useMutation({
    mutationFn: () => api.updateMaintenance(editingId!, formToUpdatePayload(form)),
    onSuccess,
  })

  const remove = useMutation({
    mutationFn: () => api.deleteMaintenance(editingId!),
    onSuccess,
    onError: () => setConfirmDelete(false),
  })

  const notifyOne = useMutation({
    mutationFn: (id: string) => api.notifyMaintenance(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setFeedback(formatMaintenanceNotifyFeedback(res.result))
    },
    onError: (err: Error) => setFeedback({
      message: formatNotificationError(err.message) ?? err.message,
      variant: 'error',
    }),
  })

  const notifyBulk = useMutation({
    mutationFn: () => api.notifyMaintenanceBulk(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setFeedback(formatMaintenanceBulkFeedback(res.result))
    },
    onError: (err: Error) => setFeedback({
      message: formatNotificationError(err.message) ?? err.message,
      variant: 'error',
    }),
  })

  const propertyMap = useMemo(
    () => new Map(propertyList.map((p) => [p.id, p.name])),
    [propertyList],
  )

  const items = data?.data ?? []
  const upcomingCount = items.filter((m) => notifyableStatuses.has(m.status)).length
  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || remove.error

  const typeLabel = (type: string) => t(`maintenance.types.${type}`, { defaultValue: type })
  const statusLabel = (status: string) => t(`maintenance.statuses.${status}`, { defaultValue: status })

  const notifyButton = (m: { id: string; status: string }) => (
    notifyableStatuses.has(m.status) ? (
      <Button
        size="sm"
        variant="outline"
        disabled={notifyOne.isPending}
        onClick={() => notifyOne.mutate(m.id)}
      >
        {t('maintenance.sendNotification')}
      </Button>
    ) : null
  )

  const maintenanceActions = (m: Maintenance) => (
    <div className="flex gap-1 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openEdit(m)}
        title={t('maintenance.edit')}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => { setEditingId(m.id); setConfirmDelete(true) }}
        title={t('maintenance.delete')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.maintenance')}
        count={data?.total}
        action={(
          <div className="flex flex-wrap gap-2">
            {upcomingCount > 0 && (
              <Button
                variant="outline"
                onClick={() => notifyBulk.mutate()}
                disabled={notifyBulk.isPending}
              >
                <Bell className="h-4 w-4" />
                {t('maintenance.notifyAll')}
              </Button>
            )}
            <Button onClick={openCreate}><Plus className="h-4 w-4" /> {t('maintenance.schedule')}</Button>
          </div>
        )}
      />

      {feedback && (
        <div className="space-y-2">
          <p className={`text-sm ${
            feedback.variant === 'error'
              ? 'text-destructive'
              : feedback.variant === 'warning'
                ? 'text-amber-800 dark:text-amber-200'
                : 'text-muted-foreground'
          }`}
          >
            {feedback.message}
          </p>
          {feedback.warning && <NoRecipientsBanner message={feedback.warning} />}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t('maintenance.listTitle')}</CardTitle>
          {items.length > 0 && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          )}
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!items.length ? <EmptyState message={t('maintenance.empty')} /> : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {items.map((m) => (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={m.status} label={statusLabel(m.status)} />
                        {maintenanceActions(m)}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{typeLabel(m.type)}</p>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>{propertyMap.get(m.property_id) ?? '—'}</p>
                    <p>{formatDate(m.scheduled_date)}</p>
                    <p className="font-medium text-foreground">{formatCurrency(m.cost?.amount ?? 0)}</p>
                    <div className="pt-2">{notifyButton(m)}</div>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {items.map((m) => (
                <DataListItem key={m.id} className="justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel(m.type)}
                      {' · '}
                      {propertyMap.get(m.property_id) ?? '—'}
                      {' · '}
                      {formatDate(m.scheduled_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium">{formatCurrency(m.cost?.amount ?? 0)}</span>
                    <StatusBadge status={m.status} label={statusLabel(m.status)} />
                    {notifyButton(m)}
                    {maintenanceActions(m)}
                  </div>
                </DataListItem>
              ))}
            </DataListShell>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-4 text-left">{t('maintenance.title')}</th>
                  <th className="p-4 text-left">{t('maintenance.type')}</th>
                  <th className="p-4 text-left">{t('maintenance.property')}</th>
                  <th className="p-4 text-left">{t('maintenance.status')}</th>
                  <th className="p-4 text-left">{t('maintenance.date')}</th>
                  <th className="p-4 text-left">{t('maintenance.cost')}</th>
                  <th className="p-4 text-left w-40" />
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-muted/50">
                    <td className="p-4 font-medium">{m.title}</td>
                    <td className="p-4">{typeLabel(m.type)}</td>
                    <td className="p-4">{propertyMap.get(m.property_id) ?? '—'}</td>
                    <td className="p-4"><StatusBadge status={m.status} label={statusLabel(m.status)} /></td>
                    <td className="p-4">{formatDate(m.scheduled_date)}</td>
                    <td className="p-4">{formatCurrency(m.cost?.amount ?? 0)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {notifyButton(m)}
                        {maintenanceActions(m)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onClose={closeDialog}
        title={mode === 'edit' ? t('maintenance.editTitle') : t('maintenance.newTitle')}
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
            {t('maintenance.delete')}
          </Button>
        ) : undefined}
      >
        <MaintenanceFormFields
          form={form}
          setForm={setForm}
          mode={mode}
          properties={propertyList}
          t={t}
        />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <PinConfirmDialog
        open={confirmDelete}
        title={t('maintenance.deleteTitle')}
        message={t('maintenance.deleteMessage', { title: editingMaintenance?.title ?? '' })}
        confirmLabel={t('maintenance.delete')}
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
