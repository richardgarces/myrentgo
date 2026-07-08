import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { useViewMode } from '@/hooks/useViewMode'
import { api } from '@/lib/api'

export function TicketsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', title: '', description: '', priority: 'medium' })
  const [viewMode, setViewMode] = useViewMode('tickets', 'lista')

  const { data, isLoading } = useQuery({ queryKey: ['tickets'], queryFn: () => api.getTickets() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const create = useMutation({
    mutationFn: () => api.createTicket(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); setOpen(false) },
  })

  const propertyMap = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p.name])),
    [properties],
  )

  const tickets = data?.data ?? []

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.tickets')} count={data?.total}
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo ticket</Button>} />

      {tickets.length > 0 && (
        <div className="flex justify-end">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      )}

      {!tickets.length ? (
        <EmptyState message="Sin tickets abiertos." />
      ) : viewMode === 'tabla' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Título</th>
                    <th className="p-4 font-medium">Propiedad</th>
                    <th className="p-4 font-medium">Prioridad</th>
                    <th className="p-4 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((tk) => (
                    <tr key={tk.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="font-medium">{tk.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{tk.description}</div>
                      </td>
                      <td className="p-4">{propertyMap.get(tk.property_id) ?? '—'}</td>
                      <td className="p-4"><StatusBadge status={tk.priority} /></td>
                      <td className="p-4"><StatusBadge status={tk.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'tarjetas' ? (
        <DataCardGrid>
          {tickets.map((tk) => (
            <Card key={tk.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tk.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{propertyMap.get(tk.property_id) ?? '—'}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{tk.description}</p>
                <div className="flex gap-2">
                  <StatusBadge status={tk.priority} />
                  <StatusBadge status={tk.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </DataCardGrid>
      ) : (
        <DataListShell>
          {tickets.map((tk) => (
            <DataListItem key={tk.id} className="justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tk.title}</p>
                <p className="text-xs text-muted-foreground truncate">{tk.description}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <StatusBadge status={tk.priority} />
                <StatusBadge status={tk.status} />
              </div>
            </DataListItem>
          ))}
        </DataListShell>
      )}

      <FormDialog open={open} onClose={() => setOpen(false)} title="Nuevo ticket / incidencia"
        onSubmit={(e) => { e.preventDefault(); create.mutate() }} loading={create.isPending}>
        <FormField label="Propiedad">
          <FormSelect required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            <option value="">Seleccionar…</option>
            {properties?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="Título"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
        <FormField label="Descripción"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
        <FormField label="Prioridad">
          <FormSelect value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Baja</option><option value="medium">Media</option>
            <option value="high">Alta</option><option value="critical">Crítica</option>
          </FormSelect>
        </FormField>
      </FormDialog>
    </div>
  )
}
