import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'

const MAINTENANCE_TYPES = ['preventive', 'corrective', 'emergency'] as const

const maintenanceTypeLabels: Record<string, string> = {
  preventive: 'Preventiva',
  corrective: 'Correctiva',
  emergency: 'Emergencia',
}

const maintenanceStatusLabels: Record<string, string> = {
  scheduled: 'Programada',
  in_progress: 'En progreso',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export function MaintenancePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', title: '', type: 'preventive', scheduled_date: '', cost: '' })

  const { data, isLoading } = useQuery({ queryKey: ['maintenance'], queryFn: () => api.getMaintenance() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const create = useMutation({
    mutationFn: () => api.createMaintenance({
      property_id: form.property_id,
      title: form.title,
      type: form.type,
      scheduled_date: form.scheduled_date,
      cost: form.cost ? Number(form.cost) : 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); setOpen(false) },
  })

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.maintenance')} count={data?.total}
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Programar mantención</Button>} />
      <Card>
        <CardContent className="p-0">
          {!data?.data.length ? <EmptyState message="Sin mantenciones programadas." /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-4 text-left">Título</th><th className="p-4 text-left">Tipo</th>
                  <th className="p-4 text-left">Estado</th><th className="p-4 text-left">Fecha</th><th className="p-4 text-left">Costo</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-muted/50">
                    <td className="p-4 font-medium">{m.title}</td>
                    <td className="p-4">{maintenanceTypeLabels[m.type] ?? m.type}</td>
                    <td className="p-4"><StatusBadge status={m.status} label={maintenanceStatusLabels[m.status]} /></td>
                    <td className="p-4">{formatDate(m.scheduled_date)}</td>
                    <td className="p-4">{formatCurrency(m.cost?.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <FormDialog open={open} onClose={() => setOpen(false)} title="Programar mantención"
        onSubmit={(e) => { e.preventDefault(); create.mutate() }} loading={create.isPending}>
        <FormField label="Propiedad">
          <FormSelect required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            <option value="">Seleccionar…</option>
            {properties?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="Título"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
        <FormField label="Tipo">
          <FormSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {MAINTENANCE_TYPES.map((type) => (
              <option key={type} value={type}>{maintenanceTypeLabels[type]}</option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Fecha"><Input type="date" required value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></FormField>
        <FormField label="Costo estimado (CLP)"><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></FormField>
      </FormDialog>
    </div>
  )
}
