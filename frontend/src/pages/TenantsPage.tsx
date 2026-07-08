import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2, UserMinus } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type Tenant } from '@/lib/api'
import { cn } from '@/lib/utils'

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', tax_id: '' }

type TenantForm = typeof emptyForm

function tenantToForm(t: Tenant): TenantForm {
  return {
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.contact?.email ?? '',
    phone: t.contact?.phone ?? '',
    tax_id: t.tax_id ?? '',
  }
}

function formToPayload(form: TenantForm) {
  return {
    first_name: form.first_name,
    last_name: form.last_name,
    email: form.email || undefined,
    phone: form.phone || undefined,
    tax_id: form.tax_id || undefined,
  }
}

function TenantFormFields({
  form,
  setForm,
}: {
  form: TenantForm
  setForm: (form: TenantForm) => void
}) {
  return (
    <>
      <FormField label="Nombre">
        <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
      </FormField>
      <FormField label="Apellido">
        <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
      </FormField>
      <FormField label="Email">
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </FormField>
      <FormField label="Teléfono">
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </FormField>
      <FormField label="RUT">
        <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
      </FormField>
    </>
  )
}

function TenantStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'text-xs px-2 py-1 rounded-full',
        active
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      )}
    >
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
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
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TenantsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['tenants'], queryFn: () => api.getTenants() })

  const editingTenant = data?.data.find((tenant) => tenant.id === editingId)

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

  const openEdit = (tenant: Tenant) => {
    setMode('edit')
    setEditingId(tenant.id)
    setForm(tenantToForm(tenant))
    setOpen(true)
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['tenants'] })
    closeDialog()
  }

  const create = useMutation({
    mutationFn: () => api.createTenant(formToPayload(form)),
    onSuccess,
  })

  const update = useMutation({
    mutationFn: () => api.updateTenant(editingId!, formToPayload(form)),
    onSuccess,
  })

  const remove = useMutation({
    mutationFn: () => api.deleteTenant(editingId!),
    onSuccess,
    onError: () => setConfirmDelete(false),
  })

  const deactivate = useMutation({
    mutationFn: () => api.deactivateTenant(editingId!),
    onSuccess,
  })

  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || remove.error || deactivate.error
  const canDeactivate = editingTenant?.active !== false
  const [viewMode, setViewMode] = useViewMode('tenants', 'tabla')
  const tenants = data?.data ?? []

  const tenantActions = (tenant: Tenant) => (
    <div className="flex gap-1 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openEdit(tenant)}
        title="Editar arrendatario"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {tenant.active !== false && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => { setEditingId(tenant.id); setConfirmDeactivate(true) }}
          title="Dar de baja"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => { setEditingId(tenant.id); setConfirmDelete(true) }}
        title="Eliminar"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.tenants')}
        count={data?.total}
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Agregar arrendatario</Button>}
      />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Arrendatarios</CardTitle>
          {tenants.length > 0 && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          )}
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!tenants.length ? (
            <EmptyState message="Sin arrendatarios. Usa el botón Agregar arrendatario." />
          ) : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {tenants.map((tenant) => (
                <Card
                  key={tenant.id}
                  className={cn(!tenant.active && 'opacity-60')}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">
                        {tenant.first_name} {tenant.last_name}
                      </CardTitle>
                      <TenantStatusBadge active={tenant.active !== false} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {tenant.contact?.email && <p>{tenant.contact.email}</p>}
                    {tenant.contact?.phone && <p>{tenant.contact.phone}</p>}
                    {tenant.tax_id && <p>RUT: {tenant.tax_id}</p>}
                    <div className="pt-1">{tenantActions(tenant)}</div>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {tenants.map((tenant) => (
                <DataListItem
                  key={tenant.id}
                  className={cn('justify-between', !tenant.active && 'opacity-60')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tenant.first_name} {tenant.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[tenant.contact?.email, tenant.contact?.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <TenantStatusBadge active={tenant.active !== false} />
                  {tenantActions(tenant)}
                </DataListItem>
              ))}
            </DataListShell>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nombre</th>
                    <th className="p-4 font-medium">Email</th>
                    <th className="p-4 font-medium">Teléfono</th>
                    <th className="p-4 font-medium">Estado</th>
                    <th className="p-4 font-medium w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className={cn('border-b hover:bg-muted/50', !tenant.active && 'opacity-60')}
                    >
                      <td className="p-4 font-medium">{tenant.first_name} {tenant.last_name}</td>
                      <td className="p-4 text-muted-foreground">{tenant.contact?.email ?? '—'}</td>
                      <td className="p-4 text-muted-foreground">{tenant.contact?.phone ?? '—'}</td>
                      <td className="p-4"><TenantStatusBadge active={tenant.active !== false} /></td>
                      <td className="p-4">{tenantActions(tenant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onClose={closeDialog}
        title={mode === 'edit' ? 'Editar arrendatario' : 'Nuevo arrendatario'}
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
        <TenantFormFields form={form} setForm={setForm} />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <PinConfirmDialog
        open={confirmDelete}
        title="Eliminar arrendatario"
        message={`¿Estás seguro de eliminar a "${editingTenant ? `${editingTenant.first_name} ${editingTenant.last_name}` : 'este arrendatario'}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => {
          setConfirmDelete(false)
          if (!open) setEditingId(null)
        }}
        onConfirm={() => remove.mutate()}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        title="Dar de baja arrendatario"
        message={`El arrendatario "${editingTenant ? `${editingTenant.first_name} ${editingTenant.last_name}` : ''}" quedará inactivo pero se conservará en el sistema.`}
        confirmLabel="Dar de baja"
        loading={deactivate.isPending}
        onClose={() => {
          setConfirmDeactivate(false)
          if (!open) setEditingId(null)
        }}
        onConfirm={() => deactivate.mutate()}
      />
    </div>
  )
}
