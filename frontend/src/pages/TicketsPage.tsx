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

export function TicketsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', title: '', description: '', priority: 'medium' })

  const { data, isLoading } = useQuery({ queryKey: ['tickets'], queryFn: () => api.getTickets() })
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  const create = useMutation({
    mutationFn: () => api.createTicket(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); setOpen(false) },
  })

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.tickets')} count={data?.total}
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo ticket</Button>} />
      <div className="space-y-3">
        {data?.data.map((tk) => (
          <Card key={tk.id}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-medium">{tk.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{tk.description}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <StatusBadge status={tk.priority} />
                <StatusBadge status={tk.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!data?.data.length && <EmptyState message="Sin tickets abiertos." />}

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
