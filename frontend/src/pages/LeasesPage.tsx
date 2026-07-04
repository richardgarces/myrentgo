import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, StatusBadge } from '@/components/ui/page'
import { api, type Lease, type Property } from '@/lib/api'
import { formatCurrency, formatDate, propertyLinkLabel } from '@/lib/utils'

const emptyForm = {
  property_id: '', tenant_id: '', start_date: '', end_date: '',
  monthly_rent: '', ipc_adjustment: true, payment_day: '5',
  include_warehouse: false, include_parking: false,
}

const LEASE_STATUSES = ['active', 'terminated', 'draft', 'expired'] as const

const leaseStatusLabels: Record<string, string> = {
  active: 'Activo',
  terminated: 'Terminado',
  draft: 'Borrador',
  expired: 'Expirado',
}

type LeaseFilters = {
  estado: '' | (typeof LEASE_STATUSES)[number]
  q: string
  propiedad: string
  arrendatario: string
}

function parseFiltersFromURL(searchParams: URLSearchParams): LeaseFilters {
  const estadoParam = searchParams.get('estado') ?? ''
  const estado = LEASE_STATUSES.includes(estadoParam as (typeof LEASE_STATUSES)[number])
    ? (estadoParam as LeaseFilters['estado'])
    : ''

  return {
    estado,
    q: searchParams.get('q') ?? '',
    propiedad: searchParams.get('propiedad') ?? '',
    arrendatario: searchParams.get('arrendatario') ?? '',
  }
}

function filtersToSearchParams(filters: LeaseFilters): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.estado) next.set('estado', filters.estado)
  const q = filters.q.trim()
  if (q) next.set('q', q)
  if (filters.propiedad) next.set('propiedad', filters.propiedad)
  if (filters.arrendatario) next.set('arrendatario', filters.arrendatario)
  return next
}

function countActiveFilters(filters: LeaseFilters): number {
  let count = 0
  if (filters.estado) count++
  if (filters.q.trim()) count++
  if (filters.propiedad) count++
  if (filters.arrendatario) count++
  return count
}

function matchesLeaseSearch(
  lease: Lease,
  query: string,
  propertyMap: Map<string, string>,
  tenantMap: Map<string, string>,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const propertyName = propertyMap.get(lease.property_id) ?? ''
  const tenantName = tenantMap.get(lease.tenant_id) ?? ''
  const haystack = [propertyName, tenantName].join(' ').toLowerCase()
  return haystack.includes(needle)
}

function applyLeaseFilters(
  leases: Lease[],
  filters: LeaseFilters,
  propertyMap: Map<string, string>,
  tenantMap: Map<string, string>,
): Lease[] {
  return leases.filter((lease) => {
    if (filters.estado && lease.status !== filters.estado) return false
    if (filters.propiedad && lease.property_id !== filters.propiedad) return false
    if (filters.arrendatario && lease.tenant_id !== filters.arrendatario) return false
    if (!matchesLeaseSearch(lease, filters.q, propertyMap, tenantMap)) return false
    return true
  })
}

type LeaseForm = typeof emptyForm

function toDateInput(value?: string): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function leaseToForm(l: Lease): LeaseForm {
  return {
    property_id: l.property_id,
    tenant_id: l.tenant_id,
    start_date: toDateInput(l.start_date),
    end_date: toDateInput(l.end_date),
    monthly_rent: String(l.monthly_rent.amount),
    ipc_adjustment: l.ipc_adjustment,
    payment_day: String(l.payment_day),
    include_warehouse: Boolean(l.warehouse_property_id),
    include_parking: Boolean(l.parking_property_id),
  }
}

function formToPayload(form: LeaseForm, apartment?: Property) {
  return {
    property_id: form.property_id,
    tenant_id: form.tenant_id,
    start_date: form.start_date || undefined,
    end_date: form.end_date || undefined,
    monthly_rent: Number(form.monthly_rent),
    ipc_adjustment: form.ipc_adjustment,
    payment_day: Number(form.payment_day),
    warehouse_property_id: form.include_warehouse && apartment?.warehouse_property_id
      ? apartment.warehouse_property_id
      : '',
    parking_property_id: form.include_parking && apartment?.parking_property_id
      ? apartment.parking_property_id
      : '',
  }
}

function leasedPropertyIds(leases: Lease[], excludeLeaseId?: string): Set<string> {
  const ids = new Set<string>()
  for (const lease of leases) {
    if (lease.status !== 'active') continue
    if (excludeLeaseId && lease.id === excludeLeaseId) continue
    ids.add(lease.property_id)
    if (lease.warehouse_property_id) ids.add(lease.warehouse_property_id)
    if (lease.parking_property_id) ids.add(lease.parking_property_id)
  }
  return ids
}

function leasedTenantIds(leases: Lease[], excludeLeaseId?: string): Set<string> {
  const ids = new Set<string>()
  for (const lease of leases) {
    if (lease.status !== 'active') continue
    if (excludeLeaseId && lease.id === excludeLeaseId) continue
    ids.add(lease.tenant_id)
  }
  return ids
}

function availableProperties(
  properties: Property[] | undefined,
  leases: Lease[] | undefined,
  excludeLeaseId?: string,
  currentPropertyId?: string,
) {
  const leased = leasedPropertyIds(leases ?? [], excludeLeaseId)
  return (properties ?? []).filter((p) => {
    if (leased.has(p.id)) return false
    if (p.purpose === 'rent') return true
    if (currentPropertyId && p.id === currentPropertyId) return true
    return false
  })
}

function availableTenants(
  tenants: { id: string; first_name: string; last_name: string }[] | undefined,
  leases: Lease[] | undefined,
  excludeLeaseId?: string,
) {
  const leased = leasedTenantIds(leases ?? [], excludeLeaseId)
  return (tenants ?? []).filter((t) => !leased.has(t.id))
}

function linkedIncludedAvailable(
  apartment: Property | undefined,
  leases: Lease[] | undefined,
  field: 'warehouse_property_id' | 'parking_property_id',
  excludeLeaseId?: string,
): boolean {
  const linkedId = apartment?.[field]
  if (!linkedId) return false
  const leased = leasedPropertyIds(leases ?? [], excludeLeaseId)
  return !leased.has(linkedId)
}

function formatLeaseProperty(
  lease: Lease,
  propertyMap: Map<string, string>,
): string {
  const main = propertyMap.get(lease.property_id) ?? '—'
  const extras: string[] = []
  if (lease.warehouse_property_id) {
    extras.push(`Bodega: ${propertyMap.get(lease.warehouse_property_id) ?? 'Vinculada'}`)
  }
  if (lease.parking_property_id) {
    extras.push(`Estacionamiento: ${propertyMap.get(lease.parking_property_id) ?? 'Vinculado'}`)
  }
  if (!extras.length) return main
  return `${main} (+ ${extras.join(', ')})`
}

function LeaseFormFields({
  form,
  setForm,
  properties,
  tenants,
  mode,
  editingLeaseId,
  leases,
}: {
  form: LeaseForm
  setForm: (form: LeaseForm) => void
  properties?: { data: Property[] }
  tenants?: { data: { id: string; first_name: string; last_name: string }[] }
  mode: 'create' | 'edit'
  editingLeaseId?: string | null
  leases?: Lease[]
}) {
  const excludeLeaseId = mode === 'edit' ? editingLeaseId ?? undefined : undefined
  const currentPropertyId = mode === 'edit' ? form.property_id || undefined : undefined
  const selectableProperties = availableProperties(properties?.data, leases, excludeLeaseId, currentPropertyId)
  const selectableTenants = availableTenants(tenants?.data, leases, excludeLeaseId)
  const hasRentPurposeProperties = (properties?.data ?? []).some((p) => p.purpose === 'rent')
  const noPropertiesAvailable = selectableProperties.length === 0
  const noTenantsAvailable = selectableTenants.length === 0
  const selectedProperty = properties?.data.find((p) => p.id === form.property_id)
  const isApartment = selectedProperty?.type === 'apartment'
  const linkedWarehouseId = isApartment ? selectedProperty?.warehouse_property_id : undefined
  const linkedParkingId = isApartment ? selectedProperty?.parking_property_id : undefined
  const warehouseAvailable = linkedIncludedAvailable(selectedProperty, leases, 'warehouse_property_id', excludeLeaseId)
  const parkingAvailable = linkedIncludedAvailable(selectedProperty, leases, 'parking_property_id', excludeLeaseId)
  const warehouseName = linkedWarehouseId
    ? propertyLinkLabel(properties?.data.find((p) => p.id === linkedWarehouseId) ?? { name: 'Bodega vinculada' })
    : ''
  const parkingName = linkedParkingId
    ? propertyLinkLabel(properties?.data.find((p) => p.id === linkedParkingId) ?? { name: 'Estacionamiento vinculado' })
    : ''

  const onPropertyChange = (propertyId: string) => {
    const apartment = properties?.data.find((p) => p.id === propertyId)
    const next: LeaseForm = {
      ...form,
      property_id: propertyId,
      include_warehouse: false,
      include_parking: false,
    }
    if (mode === 'create' && apartment?.type === 'apartment') {
      const leased = leasedPropertyIds(leases ?? [], excludeLeaseId)
      next.include_warehouse = Boolean(apartment.warehouse_property_id && !leased.has(apartment.warehouse_property_id))
      next.include_parking = Boolean(apartment.parking_property_id && !leased.has(apartment.parking_property_id))
    }
    setForm(next)
  }

  return (
    <>
      <FormField label="Propiedad">
        <FormSelect
          required
          disabled={noPropertiesAvailable}
          value={form.property_id}
          onChange={(e) => onPropertyChange(e.target.value)}
        >
          <option value="">{noPropertiesAvailable ? 'Sin propiedades disponibles' : 'Seleccionar…'}</option>
          {selectableProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FormSelect>
        {noPropertiesAvailable && (
          <p className="text-sm text-muted-foreground">
            {mode === 'create'
              ? hasRentPurposeProperties
                ? 'Todas las propiedades para arrendar tienen un arriendo activo. Termina un contrato existente para liberar una propiedad.'
                : 'No hay propiedades con destino para arrendar. Registra una propiedad con destino "Para arrendar" o cambia el destino de una existente.'
              : 'No hay otras propiedades para arrendar disponibles sin arriendo activo.'}
          </p>
        )}
      </FormField>
      {isApartment && linkedWarehouseId && (
        <label className={`flex items-center gap-2 text-sm ${!warehouseAvailable ? 'opacity-60' : ''}`}>
          <input
            type="checkbox"
            checked={form.include_warehouse}
            disabled={!warehouseAvailable}
            onChange={(e) => setForm({ ...form, include_warehouse: e.target.checked })}
          />
          Incluir bodega vinculada: {warehouseName}
          {!warehouseAvailable && (
            <span className="text-muted-foreground">(ya tiene arriendo activo)</span>
          )}
        </label>
      )}
      {isApartment && linkedParkingId && (
        <label className={`flex items-center gap-2 text-sm ${!parkingAvailable ? 'opacity-60' : ''}`}>
          <input
            type="checkbox"
            checked={form.include_parking}
            disabled={!parkingAvailable}
            onChange={(e) => setForm({ ...form, include_parking: e.target.checked })}
          />
          Incluir estacionamiento vinculado: {parkingName}
          {!parkingAvailable && (
            <span className="text-muted-foreground">(ya tiene arriendo activo)</span>
          )}
        </label>
      )}
      <FormField label="Arrendatario">
        <FormSelect
          required
          disabled={noTenantsAvailable}
          value={form.tenant_id}
          onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
        >
          <option value="">{noTenantsAvailable ? 'Sin arrendatarios disponibles' : 'Seleccionar…'}</option>
          {selectableTenants.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
        </FormSelect>
        {noTenantsAvailable && (
          <p className="text-sm text-muted-foreground">
            {mode === 'create'
              ? 'Todos los arrendatarios tienen un arriendo activo. Termina un contrato existente para liberar un arrendatario.'
              : 'No hay otros arrendatarios disponibles sin arriendo activo.'}
          </p>
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Inicio"><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></FormField>
        <FormField label="Fin"><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></FormField>
      </div>
      <FormField label="Arriendo mensual (CLP)"><Input type="number" required value={form.monthly_rent} onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })} /></FormField>
      <FormField label="Día de pago"><Input type="number" min={1} max={28} value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} /></FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.ipc_adjustment} onChange={(e) => setForm({ ...form, ipc_adjustment: e.target.checked })} />
        Reajuste IPC
      </label>
    </>
  )
}

export function LeasesPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmTerminate, setConfirmTerminate] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['leases'], queryFn: () => api.getLeases() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => api.getTenants() })

  const propertyMap = useMemo(
    () => new Map(
      (properties?.data ?? []).map((p) => [
        p.id,
        p.type === 'parking' || p.type === 'warehouse' ? propertyLinkLabel(p) : p.name,
      ]),
    ),
    [properties],
  )
  const tenantMap = useMemo(
    () => new Map((tenants?.data ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name}`])),
    [tenants],
  )
  const leases = data?.data ?? []
  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchParams])
  const activeFilterCount = countActiveFilters(filters)

  const updateFilters = (patch: Partial<LeaseFilters>) => {
    const next = { ...filters, ...patch }
    setSearchParams(filtersToSearchParams(next), { replace: true })
  }

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const displayedLeases = useMemo(
    () => applyLeaseFilters(leases, filters, propertyMap, tenantMap),
    [leases, filters, propertyMap, tenantMap],
  )

  const leasePropertyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const lease of leases) ids.add(lease.property_id)
    return ids
  }, [leases])

  const leaseTenantIds = useMemo(() => {
    const ids = new Set<string>()
    for (const lease of leases) ids.add(lease.tenant_id)
    return ids
  }, [leases])

  const filterableProperties = useMemo(
    () => (properties?.data ?? [])
      .filter((p) => leasePropertyIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [properties, leasePropertyIds],
  )

  const filterableTenants = useMemo(
    () => (tenants?.data ?? [])
      .filter((t) => leaseTenantIds.has(t.id))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'es')),
    [tenants, leaseTenantIds],
  )

  const totalCount = data?.total ?? leases.length
  const filteredCount = displayedLeases.length

  const editingLease = leases.find((l) => l.id === editingId)
  const selectedApartment = properties?.data.find((p) => p.id === form.property_id && p.type === 'apartment')

  const closeDialog = () => {
    setOpen(false)
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setConfirmTerminate(false)
  }

  const openCreate = () => {
    setMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (lease: Lease) => {
    setMode('edit')
    setEditingId(lease.id)
    setForm(leaseToForm(lease))
    setOpen(true)
  }

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['leases'] })
    closeDialog()
  }

  const buildPayload = () => formToPayload(form, selectedApartment)

  const create = useMutation({
    mutationFn: () => api.createLease(buildPayload()),
    onSuccess,
  })

  const update = useMutation({
    mutationFn: () => api.updateLease(editingId!, buildPayload()),
    onSuccess,
  })

  const terminate = useMutation({
    mutationFn: () => api.terminateLease(editingId!),
    onSuccess,
  })

  const isSaving = create.isPending || update.isPending
  const mutationError = create.error || update.error || terminate.error
  const canTerminate = editingLease?.status !== 'terminated'

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.leases')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeFilterCount > 0
              ? t('leases.filteredCount', { filtered: filteredCount, total: totalCount })
              : t('leases.totalCount', { count: totalCount })}
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo arriendo</Button>
      </div>

      {leases.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Filtros</CardTitle>
              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('leases.activeFilters', { count: activeFilterCount })}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                    <X className="h-4 w-4" />
                    {t('leases.clearFilters')}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormSelect
              value={filters.estado}
              onChange={(e) => updateFilters({ estado: e.target.value as LeaseFilters['estado'] })}
            >
              <option value="">Estado: todos</option>
              {LEASE_STATUSES.map((status) => (
                <option key={status} value={status}>{leaseStatusLabels[status] ?? status}</option>
              ))}
            </FormSelect>
            <FormSelect
              value={filters.propiedad}
              onChange={(e) => updateFilters({ propiedad: e.target.value })}
            >
              <option value="">Propiedad: todas</option>
              {filterableProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </FormSelect>
            <FormSelect
              value={filters.arrendatario}
              onChange={(e) => updateFilters({ arrendatario: e.target.value })}
            >
              <option value="">Arrendatario: todos</option>
              {filterableTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.first_name} {tenant.last_name}
                </option>
              ))}
            </FormSelect>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.q}
                onChange={(e) => updateFilters({ q: e.target.value })}
                placeholder="Buscar propiedad o arrendatario…"
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Contratos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!leases.length ? (
            <EmptyState message="Sin arriendos. Primero agrega propiedades y arrendatarios." />
          ) : !displayedLeases.length ? (
            <EmptyState message={t('leases.noResults')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Estado</th>
                    <th className="p-4 font-medium">Propiedad</th>
                    <th className="p-4 font-medium">Arrendatario</th>
                    <th className="p-4 font-medium">Inicio</th>
                    <th className="p-4 font-medium">Fin</th>
                    <th className="p-4 font-medium">Arriendo</th>
                    <th className="p-4 font-medium">IPC</th>
                    <th className="p-4 font-medium">Día pago</th>
                    <th className="p-4 font-medium w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLeases.map((l) => (
                    <tr key={l.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <StatusBadge status={l.status} label={leaseStatusLabels[l.status]} />
                      </td>
                      <td className="p-4">{formatLeaseProperty(l, propertyMap)}</td>
                      <td className="p-4">{tenantMap.get(l.tenant_id) ?? '—'}</td>
                      <td className="p-4">{l.start_date ? formatDate(l.start_date) : '—'}</td>
                      <td className="p-4">{l.end_date ? formatDate(l.end_date) : '—'}</td>
                      <td className="p-4 font-medium">{formatCurrency(l.monthly_rent.amount)}</td>
                      <td className="p-4">{l.ipc_adjustment ? 'Sí' : 'No'}</td>
                      <td className="p-4">{l.payment_day}</td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(l)} title="Editar arriendo">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {l.status !== 'terminated' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => { setEditingId(l.id); setConfirmTerminate(true) }}
                              title="Dar de baja"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
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
        title={mode === 'edit' ? 'Editar arriendo' : 'Nuevo contrato de arriendo'}
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'create' && (
            availableProperties(properties?.data, leases).length === 0 ||
            availableTenants(tenants?.data, leases).length === 0
          )) {
            return
          }
          if (mode === 'edit') update.mutate()
          else create.mutate()
        }}
        loading={isSaving}
        footerStart={mode === 'edit' && canTerminate ? (
          <Button type="button" variant="destructive" onClick={() => setConfirmTerminate(true)} disabled={isSaving || terminate.isPending}>
            Dar de baja
          </Button>
        ) : undefined}
      >
        <LeaseFormFields
          form={form}
          setForm={setForm}
          properties={properties}
          tenants={tenants}
          mode={mode}
          editingLeaseId={editingId}
          leases={leases}
        />
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <PinConfirmDialog
        open={confirmTerminate}
        title="Dar de baja arriendo"
        message="Esta acción dará de baja el contrato de arriendo. Ingresa el PIN de confirmación para continuar."
        confirmLabel="Dar de baja"
        loading={terminate.isPending}
        onClose={() => {
          setConfirmTerminate(false)
          if (!open) setEditingId(null)
        }}
        onConfirm={() => terminate.mutate(undefined, { onSuccess })}
      />
    </div>
  )
}
