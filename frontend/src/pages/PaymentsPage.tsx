import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type Lease, type Payment } from '@/lib/api'
import { invalidateAfterMutation } from '@/lib/query-options'
import { formatCurrency, formatDate } from '@/lib/utils'

const emptyForm = { type: 'rent', amount: '', due_date: '', property_id: '', lease_id: '', tenant_id: '', notes: '' }

function currentMonthValue(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function useCurrentMonth(): string {
  const [month, setMonth] = useState(currentMonthValue)
  useEffect(() => {
    const tick = () => {
      const next = currentMonthValue()
      setMonth((prev) => (prev === next ? prev : next))
    }
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return month
}

function monthAlreadyGeneratedMessage(month: string): string {
  return `Pagos de ${formatMonthLabel(month)} ya generados. Disponible el 1 del próximo mes.`
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  return date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

const paymentTypeLabels: Record<string, string> = {
  rent: 'Arriendo',
  deposit: 'Depósito',
  expense: 'Gasto',
  common_fee: 'Gasto común',
}

function isRentPagePayment(p: Payment): boolean {
  return p.type !== 'dividend'
}

function effectivePaymentStatus(p: Payment): string {
  if (p.status === 'pending' && p.due_date) {
    const due = new Date(p.due_date)
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      return 'overdue'
    }
  }
  return p.status
}

const paymentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

function formatPaymentDescription(p: Payment): string {
  switch (p.type) {
    case 'rent': {
      const month = p.due_date?.slice(0, 7)
      return month ? `Arriendo ${formatMonthLabel(month)}` : 'Arriendo'
    }
    case 'deposit':
      return p.notes?.trim() || 'Depósito'
    case 'expense':
      return p.notes?.trim() || 'Gasto'
    case 'common_fee':
      return p.notes?.trim() || 'Gasto común'
    default:
      return p.notes?.trim() || paymentTypeLabels[p.type] || p.type
  }
}

function buildActiveLeaseByPropertyId(leases: Lease[]): Map<string, Lease> {
  const map = new Map<string, Lease>()
  for (const lease of leases) {
    if (lease.status !== 'active') continue
    map.set(lease.property_id, lease)
    if (lease.warehouse_property_id) map.set(lease.warehouse_property_id, lease)
    if (lease.parking_property_id) map.set(lease.parking_property_id, lease)
  }
  return map
}

/** Main lease properties only; bundled bodega/estacionamiento are paid with the dept. */
function buildMainLeasedPropertyIds(leases: Lease[]): Set<string> {
  const ids = new Set<string>()
  for (const lease of leases) {
    if (lease.status !== 'active') continue
    ids.add(lease.property_id)
  }
  return ids
}

function propertyOptionLabel(
  propertyName: string,
  propertyId: string,
  leaseByProperty: Map<string, Lease>,
  tenantMap: Map<string, string>,
): string {
  const lease = leaseByProperty.get(propertyId)
  if (!lease) return propertyName
  const tenantName = tenantMap.get(lease.tenant_id)
  return tenantName ? `${propertyName} (${tenantName})` : propertyName
}

export function PaymentsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentMonth = useCurrentMonth()
  const [open, setOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateMonth, setGenerateMonth] = useState(currentMonthValue)
  const [preview, setPreview] = useState<{ would_create: number; skipped: number; month_already_generated?: boolean } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({ queryKey: ['payments'], queryFn: () => api.getPayments(1, undefined, 500) })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const { data: leases } = useQuery({ queryKey: ['leases'], queryFn: () => api.getLeases() })
  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => api.getTenants() })

  const tenantMap = useMemo(
    () => new Map((tenants?.data ?? []).map((tenant) => [tenant.id, `${tenant.first_name} ${tenant.last_name}`])),
    [tenants],
  )
  const leaseByProperty = useMemo(
    () => buildActiveLeaseByPropertyId(leases?.data ?? []),
    [leases],
  )
  const mainLeasedPropertyIds = useMemo(
    () => buildMainLeasedPropertyIds(leases?.data ?? []),
    [leases],
  )
  const rentedProperties = useMemo(
    () => (properties?.data ?? []).filter((p) => mainLeasedPropertyIds.has(p.id)),
    [properties, mainLeasedPropertyIds],
  )
  const selectedTenantName = form.tenant_id ? tenantMap.get(form.tenant_id) ?? '' : ''

  const activeLeasesCount = useMemo(
    () => (leases?.data ?? []).filter((lease) => lease.status === 'active').length,
    [leases],
  )

  const rentPayments = useMemo(
    () => (data?.data ?? []).filter(isRentPagePayment),
    [data],
  )

  const { data: currentMonthStatus } = useQuery({
    queryKey: ['payments', 'generate-status', currentMonth],
    queryFn: () => api.generatePendingRentPayments(currentMonth, true),
    enabled: activeLeasesCount > 0,
    staleTime: 60_000,
  })

  const currentMonthAlreadyGenerated = Boolean(
    currentMonthStatus?.month_already_generated
    ?? (currentMonthStatus?.would_create === 0 && activeLeasesCount > 0),
  )

  const generateButtonDisabled = activeLeasesCount === 0 || currentMonthAlreadyGenerated
  const generateButtonTitle = currentMonthAlreadyGenerated
    ? monthAlreadyGeneratedMessage(currentMonth)
    : activeLeasesCount === 0
      ? 'No hay arriendos activos'
      : undefined

  const selectedMonthAlreadyGenerated = Boolean(
    preview?.month_already_generated ?? (preview?.would_create === 0 && (preview?.skipped ?? 0) > 0),
  )

  useEffect(() => {
    if (!generateOpen) return
    let cancelled = false
    setPreviewLoading(true)
    api.generatePendingRentPayments(generateMonth, true)
      .then((result) => {
        if (!cancelled) {
          setPreview({
            would_create: result.would_create ?? 0,
            skipped: result.skipped,
            month_already_generated: result.month_already_generated,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [generateOpen, generateMonth])

  const markPaid = useMutation({
    mutationFn: (id: string) => api.markPaymentPaid(id),
    onSuccess: () => invalidateAfterMutation(qc, 'payments'),
  })

  const generatePending = useMutation({
    mutationFn: () => api.generatePendingRentPayments(generateMonth, false),
    onSuccess: (result) => {
      invalidateAfterMutation(qc, 'payments')
      qc.invalidateQueries({ queryKey: ['payments', 'generate-status'] })
      setGenerateOpen(false)
      setPreview(null)
      const created = result.created ?? 0
      const skipped = result.skipped
      window.alert(
        created > 0
          ? `Se registraron ${created} pago(s) pendiente(s) para ${formatMonthLabel(result.month)}.${skipped > 0 ? ` ${skipped} arriendo(s) ya tenían pago en ese mes.` : ''}`
          : `No se crearon pagos nuevos. ${skipped > 0 ? `${skipped} arriendo(s) ya tenían pago registrado para ${formatMonthLabel(result.month)}.` : 'No hay arriendos activos.'}`,
      )
    },
  })

  const create = useMutation({
    mutationFn: () => api.createPayment({
      type: form.type,
      amount: Number(form.amount),
      due_date: form.due_date,
      property_id: form.property_id || undefined,
      lease_id: form.lease_id || undefined,
      tenant_id: form.tenant_id || undefined,
      ...(form.type === 'deposit' && form.notes.trim() ? { notes: form.notes.trim() } : {}),
    }),
    onSuccess: () => {
      invalidateAfterMutation(qc, 'payments')
      setForm(emptyForm)
      setOpen(false)
    },
  })

  const handlePropertyChange = (propertyId: string) => {
    const lease = propertyId ? leaseByProperty.get(propertyId) : undefined
    setForm({
      ...form,
      property_id: propertyId,
      lease_id: lease?.id ?? '',
      tenant_id: lease?.tenant_id ?? '',
    })
  }

  const [viewMode, setViewMode] = useViewMode('payments', 'tabla')

  const markPaidButton = (p: Payment) => (
    (effectivePaymentStatus(p) === 'pending' || effectivePaymentStatus(p) === 'overdue') ? (
      <Button size="sm" variant="outline" onClick={() => markPaid.mutate(p.id)}>Marcar pagado</Button>
    ) : null
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.payments')} count={rentPayments.length}
        action={
          <div className="flex flex-wrap gap-2">
            <span title={generateButtonTitle} className="inline-flex">
              <Button
                variant="outline"
                onClick={() => {
                  setGenerateMonth(currentMonthValue())
                  setPreview(null)
                  setGenerateOpen(true)
                }}
                disabled={generateButtonDisabled}
              >
                <CalendarDays className="h-4 w-4" /> Generar pagos pendientes
              </Button>
            </span>
            <Button onClick={() => { setForm(emptyForm); setOpen(true) }}>
              <Plus className="h-4 w-4" /> Registrar pago
            </Button>
          </div>
        } />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Historial de pagos de arriendo</CardTitle>
          {rentPayments.length > 0 && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          )}
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!rentPayments.length ? <EmptyState message="Sin pagos de arriendo registrados." /> : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {rentPayments.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{formatPaymentDescription(p)}</CardTitle>
                      <StatusBadge status={effectivePaymentStatus(p)} label={paymentStatusLabels[effectivePaymentStatus(p)] ?? effectivePaymentStatus(p)} />
                    </div>
                    <p className="text-xs text-muted-foreground">{paymentTypeLabels[p.type] ?? p.type}</p>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>Arrendatario: <span className="text-foreground">{p.tenant_id ? tenantMap.get(p.tenant_id) ?? '—' : '—'}</span></p>
                    <p>Monto: <span className="text-foreground font-medium">{formatCurrency(p.amount.amount, p.amount.currency)}</span></p>
                    <p>Vence: <span className="text-foreground">{formatDate(p.due_date)}</span></p>
                    <div className="pt-2">{markPaidButton(p)}</div>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {rentPayments.map((p) => (
                <DataListItem key={p.id} className="justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatPaymentDescription(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {paymentTypeLabels[p.type] ?? p.type}
                      {' · '}
                      {p.tenant_id ? tenantMap.get(p.tenant_id) ?? '—' : '—'}
                      {' · '}
                      {formatDate(p.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium">{formatCurrency(p.amount.amount, p.amount.currency)}</span>
                    <StatusBadge status={effectivePaymentStatus(p)} label={paymentStatusLabels[effectivePaymentStatus(p)] ?? effectivePaymentStatus(p)} />
                    {markPaidButton(p)}
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
                    <th className="p-4 font-medium">Descripción</th>
                    <th className="p-4 font-medium">Arrendatario</th>
                    <th className="p-4 font-medium">Estado</th>
                    <th className="p-4 font-medium">Monto</th>
                    <th className="p-4 font-medium">Vencimiento</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rentPayments.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">{paymentTypeLabels[p.type] ?? p.type}</td>
                      <td className="p-4 text-muted-foreground">{formatPaymentDescription(p)}</td>
                      <td className="p-4">{p.tenant_id ? tenantMap.get(p.tenant_id) ?? '—' : '—'}</td>
                      <td className="p-4">
                        <StatusBadge
                          status={effectivePaymentStatus(p)}
                          label={paymentStatusLabels[effectivePaymentStatus(p)] ?? effectivePaymentStatus(p)}
                        />
                      </td>
                      <td className="p-4 font-medium">
                        {formatCurrency(p.amount.amount, p.amount.currency)}
                      </td>
                      <td className="p-4">{formatDate(p.due_date)}</td>
                      <td className="p-4">{markPaidButton(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog open={open} onClose={() => setOpen(false)} title="Registrar pago"
        onSubmit={(e) => { e.preventDefault(); create.mutate() }} loading={create.isPending}>
        <FormField label="Tipo">
          <FormSelect
            value={form.type}
            onChange={(e) => {
              const type = e.target.value
              setForm({ ...form, type, notes: type === 'deposit' ? form.notes : '' })
            }}
          >
            <option value="rent">Arriendo</option><option value="deposit">Depósito</option>
            <option value="expense">Gasto</option><option value="common_fee">Gasto común</option>
          </FormSelect>
        </FormField>
        {form.type === 'deposit' && (
          <FormField label="Descripción (opcional)">
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ej: garantía por daños, mes de adelanto..."
            />
          </FormField>
        )}
        <FormField label="Monto (CLP)"><Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
        <FormField label="Vencimiento"><Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></FormField>
        <FormField label="Propiedad (opcional)">
          <FormSelect
            value={form.property_id}
            onChange={(e) => handlePropertyChange(e.target.value)}
            disabled={rentedProperties.length === 0}
          >
            {rentedProperties.length === 0 ? (
              <option value="">Sin propiedades arrendadas</option>
            ) : (
              <>
                <option value="">—</option>
                {rentedProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyOptionLabel(p.name, p.id, leaseByProperty, tenantMap)}
                  </option>
                ))}
              </>
            )}
          </FormSelect>
        </FormField>
        <FormField label="Arrendatario">
          <Input
            readOnly
            value={selectedTenantName || (form.property_id ? 'Sin arriendo activo' : 'Selecciona una propiedad')}
            className="bg-muted/50"
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={generateOpen}
        onClose={() => { setGenerateOpen(false); setPreview(null) }}
        title="Generar pagos pendientes"
        submitLabel="Confirmar"
        loading={generatePending.isPending}
        submitDisabled={previewLoading || (preview?.would_create ?? 0) === 0}
        onSubmit={(e) => {
          e.preventDefault()
          if ((preview?.would_create ?? 0) === 0) return
          generatePending.mutate()
        }}
      >
        <p className="text-sm text-muted-foreground">
          Crea un pago de arriendo pendiente por cada arriendo activo, usando el monto mensual y el día de pago configurado en el contrato.
        </p>
        <FormField label="Mes">
          <Input
            type="month"
            required
            value={generateMonth}
            onChange={(e) => setGenerateMonth(e.target.value)}
          />
        </FormField>
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          {previewLoading ? (
            <p className="text-muted-foreground">Calculando…</p>
          ) : preview ? (
            <>
              <p>
                <span className="font-medium">{preview.would_create}</span> pago(s) nuevo(s) para{' '}
                <span className="font-medium">{formatMonthLabel(generateMonth)}</span>
              </p>
              {preview.skipped > 0 && (
                <p className="text-muted-foreground">
                  {preview.skipped} arriendo(s) omitido(s) — ya tienen pago de arriendo en ese mes.
                </p>
              )}
              {preview.would_create === 0 && (
                <p className="text-muted-foreground">
                  {selectedMonthAlreadyGenerated
                    ? monthAlreadyGeneratedMessage(generateMonth)
                    : 'No hay pagos nuevos que generar para este mes.'}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No se pudo obtener la vista previa.</p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
