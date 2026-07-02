import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { api } from '@/lib/api'

const typeLabels: Record<string, string> = {
  real_estate: 'Inmobiliaria', bank: 'Banco', technician: 'Técnico', supplier: 'Proveedor', other: 'Otro',
}

export function CrmPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'real_estate', name: '', email: '', phone: '' })

  const { data, isLoading } = useQuery({ queryKey: ['crm'], queryFn: () => api.getContacts() })
  const create = useMutation({
    mutationFn: () => api.createContact(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm'] }); setOpen(false) },
  })

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.crm')} count={data?.total}
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Agregar contacto</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <p className="text-xs text-muted-foreground uppercase">{typeLabels[c.type] || c.type}</p>
              <CardTitle className="text-base">{c.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {c.contact?.email && <p>{c.contact.email}</p>}
              {c.contact?.phone && <p>{c.contact.phone}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      {!data?.data.length && <EmptyState message="Sin contactos CRM." />}

      <FormDialog open={open} onClose={() => setOpen(false)} title="Nuevo contacto CRM"
        onSubmit={(e) => { e.preventDefault(); create.mutate() }} loading={create.isPending}>
        <FormField label="Tipo">
          <FormSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="real_estate">Inmobiliaria</option><option value="bank">Banco</option>
            <option value="technician">Técnico</option><option value="supplier">Proveedor</option>
          </FormSelect>
        </FormField>
        <FormField label="Nombre"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
      </FormDialog>
    </div>
  )
}
