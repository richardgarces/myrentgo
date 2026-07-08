import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, StatusBadge } from '@/components/ui/page'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type Lease, type Property, type TenantNotification } from '@/lib/api'
import { formatNotificationError } from '@/lib/notification-errors'
import { formatDate } from '@/lib/utils'
import { NoRecipientsBanner } from '@/pages/notifications/NoRecipientsBanner'

const leaseStatusLabels: Record<string, string> = {
  active: 'Arriendo activo',
  terminated: 'Arriendo terminado',
}

function formatLeaseOptionLabel(
  lease: Lease,
  propertyById: Map<string, Property>,
): string {
  const property = propertyById.get(lease.property_id)
  const propertyName = property?.name
  const statusLabel = leaseStatusLabels[lease.status] ?? 'Arriendo'

  if (propertyName) {
    const unit = property?.unit_number?.trim()
    if (unit) return `${propertyName} - Depto ${unit}`
    return propertyName
  }
  return `Propiedad - ${statusLabel}`
}

const typeLabels: Record<string, string> = {
  payment_due: 'Aviso de pago',
  payment_overdue: 'Pago atrasado',
  late_interest: 'Intereses por mora',
  maintenance_due: 'Recordatorio de mantención',
}

const channelLabels: Record<string, string> = {
  email: 'Correo electrónico',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  manual: 'Manual',
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
  cancelled: 'Cancelada',
}

export function HistorialTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ status: '', type: '', tenant_id: '', from_date: '', to_date: '' })
  const [form, setForm] = useState({
    tenant_id: '',
    lease_id: '',
    type: 'payment_due',
    title: '',
    message: '',
    channel: 'email',
    scheduled_at: '',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const queryFilters = useMemo(
    () => ({
      status: filters.status || undefined,
      type: filters.type || undefined,
      tenant_id: filters.tenant_id || undefined,
      from_date: filters.from_date || undefined,
      to_date: filters.to_date || undefined,
    }),
    [filters],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', queryFilters],
    queryFn: () => api.getNotifications(queryFilters),
  })
  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => api.getTenants() })
  const { data: leases } = useQuery({ queryKey: ['leases'], queryFn: () => api.getLeases() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })

  const propertyById = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p])),
    [properties],
  )
  const tenantById = useMemo(
    () => new Map((tenants?.data ?? []).map((t) => [t.id, t])),
    [tenants],
  )

  const formatTenantName = (tenantId: string, metadata?: Record<string, string>) => {
    const fromMeta = metadata?.tenant_name?.trim()
    if (fromMeta) return fromMeta
    if (metadata?.maintenance_title?.trim()) return metadata.maintenance_title
    if (metadata?.property_name?.trim()) return metadata.property_name
    const tenant = tenantById.get(tenantId)
    if (tenant) return `${tenant.first_name} ${tenant.last_name}`.trim()
    return '—'
  }

  const hasActiveFilters = Boolean(
    filters.status || filters.type || filters.tenant_id || filters.from_date || filters.to_date,
  )
  const tenantLeases = useMemo(
    () => (leases?.data ?? []).filter((lease) => lease.tenant_id === form.tenant_id),
    [leases, form.tenant_id],
  )

  const create = useMutation({
    mutationFn: () => api.createNotification({
      tenant_id: form.tenant_id,
      lease_id: form.lease_id || undefined,
      type: form.type,
      title: form.title,
      message: form.message,
      channel: form.channel,
      scheduled_at: form.scheduled_at,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setOpen(false)
      setForm({
        tenant_id: '',
        lease_id: '',
        type: 'payment_due',
        title: '',
        message: '',
        channel: 'email',
        scheduled_at: '',
      })
    },
  })

  const markSent = useMutation({
    mutationFn: (id: string) => api.updateNotificationStatus(id, 'sent'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => api.updateNotificationStatus(id, 'cancelled'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const sendNow = useMutation({
    mutationFn: (id: string) => api.sendNotification(id),
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: Error) => setActionError(formatNotificationError(err.message) ?? err.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setConfirmDelete(false)
      setSelectedId(null)
    },
  })

  const [viewMode, setViewMode] = useViewMode('notifications-historial', 'tabla')
  const notifications = data?.data ?? []

  const notificationActions = (n: TenantNotification) => (
    <div className="flex flex-wrap gap-2 justify-end">
      {n.channel === 'email' && (n.status === 'pending' || n.status === 'failed') && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => sendNow.mutate(n.id)}
          disabled={sendNow.isPending}
        >
          {n.status === 'failed' ? 'Reenviar' : 'Enviar ahora'}
        </Button>
      )}
      {n.status === 'pending' && (
        <>
          <Button size="sm" variant="outline" onClick={() => markSent.mutate(n.id)}>Marcar enviada</Button>
          <Button size="sm" variant="outline" onClick={() => cancel.mutate(n.id)}>Cancelar</Button>
        </>
      )}
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          setSelectedId(n.id)
          setConfirmDelete(true)
        }}
      >
        Eliminar
      </Button>
    </div>
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Crear notificación
        </Button>
      </div>

      {actionError && (
        <NoRecipientsBanner message={actionError} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <FormSelect value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
            <option value="">Estado: todos</option>
            <option value="pending">Pendiente</option>
            <option value="sent">Enviado</option>
            <option value="failed">Fallido</option>
            <option value="cancelled">Cancelada</option>
          </FormSelect>
          <FormSelect value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}>
            <option value="">Tipo: todos</option>
            <option value="payment_due">Aviso de pago</option>
            <option value="payment_overdue">Pago atrasado</option>
            <option value="late_interest">Intereses por mora</option>
            <option value="maintenance_due">Recordatorio de mantención</option>
          </FormSelect>
          <FormSelect value={filters.tenant_id} onChange={(e) => setFilters((p) => ({ ...p, tenant_id: e.target.value }))}>
            <option value="">Arrendatario: todos</option>
            {tenants?.data.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.first_name} {tenant.last_name}</option>
            ))}
          </FormSelect>
          <Input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters((p) => ({ ...p, from_date: e.target.value }))}
            aria-label="Desde"
            title="Desde (fecha de registro)"
          />
          <Input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters((p) => ({ ...p, to_date: e.target.value }))}
            aria-label="Hasta"
            title="Hasta (fecha de registro)"
          />
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              className="sm:col-span-2 lg:col-span-6"
              onClick={() => setFilters({ status: '', type: '', tenant_id: '', from_date: '', to_date: '' })}
            >
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Historial de notificaciones</CardTitle>
          {notifications.length > 0 && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          )}
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!notifications.length ? (
            <EmptyState message="Sin notificaciones registradas." />
          ) : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {notifications.map((n) => (
                <Card key={n.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{n.title}</CardTitle>
                      <StatusBadge status={n.status} label={statusLabels[n.status] ?? n.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{typeLabels[n.type] || n.type}</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{formatTenantName(n.tenant_id, n.metadata)}</p>
                    <p>{channelLabels[n.channel] || n.channel}</p>
                    <p>Registrada: {formatDate(n.created_at)}</p>
                    {notificationActions(n)}
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {notifications.map((n) => (
                <DataListItem key={n.id} className="justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabels[n.type] || n.type}
                      {' · '}
                      {formatTenantName(n.tenant_id, n.metadata)}
                      {' · '}
                      {formatDate(n.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusBadge status={n.status} label={statusLabels[n.status] ?? n.status} />
                    {notificationActions(n)}
                  </div>
                </DataListItem>
              ))}
            </DataListShell>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Arrendatario</th>
                    <th className="p-4 font-medium">Título</th>
                    <th className="p-4 font-medium">Canal</th>
                    <th className="p-4 font-medium">Estado</th>
                    <th className="p-4 font-medium">Registrada</th>
                    <th className="p-4 font-medium">Enviada</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">{typeLabels[n.type] || n.type}</td>
                      <td className="p-4">{formatTenantName(n.tenant_id, n.metadata)}</td>
                      <td className="p-4">{n.title}</td>
                      <td className="p-4">{channelLabels[n.channel] || n.channel}</td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <StatusBadge status={n.status} label={statusLabels[n.status] ?? n.status} />
                          {n.status === 'failed' && formatNotificationError(n.metadata?.error_message) && (
                            <p
                              className="text-xs text-muted-foreground max-w-[220px]"
                              title={formatNotificationError(n.metadata?.error_message)}
                            >
                              {formatNotificationError(n.metadata?.error_message)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">{formatDate(n.created_at)}</td>
                      <td className="p-4">{n.sent_at ? formatDate(n.sent_at) : '—'}</td>
                      <td className="p-4">{notificationActions(n)}</td>
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
        onClose={() => setOpen(false)}
        title="Nueva notificación"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
        loading={create.isPending}
      >
        <FormField label="Arrendatario">
          <FormSelect
            required
            value={form.tenant_id}
            onChange={(e) => {
              const tenant_id = e.target.value
              setForm((p) => {
                const next = { ...p, tenant_id }
                if (p.lease_id) {
                  const lease = leases?.data.find((l) => l.id === p.lease_id)
                  if (!lease || lease.tenant_id !== tenant_id) {
                    next.lease_id = ''
                  }
                }
                return next
              })
            }}
          >
            <option value="">Seleccionar…</option>
            {tenants?.data.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.first_name} {tenant.last_name}</option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Arriendo (opcional)">
          <FormSelect
            value={form.lease_id}
            disabled={!form.tenant_id}
            onChange={(e) => setForm((p) => ({ ...p, lease_id: e.target.value }))}
          >
            <option value="">{form.tenant_id ? 'Sin arriendo' : 'Selecciona un arrendatario primero'}</option>
            {tenantLeases.map((lease) => (
              <option key={lease.id} value={lease.id}>
                {formatLeaseOptionLabel(lease, propertyById)}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Tipo de aviso">
          <FormSelect value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
            <option value="payment_due">Aviso de pago</option>
            <option value="payment_overdue">Pago atrasado</option>
            <option value="late_interest">Intereses por mora</option>
            <option value="maintenance_due">Recordatorio de mantención</option>
          </FormSelect>
        </FormField>
        <FormField label="Canal">
          <FormSelect value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}>
            <option value="email">Correo electrónico</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="manual">Manual</option>
          </FormSelect>
        </FormField>
        <FormField label="Título">
          <Input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        </FormField>
        <FormField label="Mensaje">
          <textarea
            required
            className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          />
        </FormField>
        <FormField label="Fecha programada">
          <Input
            type="datetime-local"
            required
            value={form.scheduled_at}
            onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
          />
        </FormField>
        {(create.error || markSent.error || cancel.error || sendNow.error || remove.error) && (
          <p className="text-sm text-destructive">
            {formatNotificationError(
              ((create.error || markSent.error || cancel.error || sendNow.error || remove.error) as Error).message,
            )}
          </p>
        )}
      </FormDialog>

      <PinConfirmDialog
        open={confirmDelete}
        title="Eliminar notificación"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => selectedId && remove.mutate(selectedId)}
      />
    </div>
  )
}
