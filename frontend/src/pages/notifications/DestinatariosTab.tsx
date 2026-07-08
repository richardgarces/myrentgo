import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, StatusBadge } from '@/components/ui/page'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type EmailRecipient, type Lease, type Property, type Tenant } from '@/lib/api'
import { cn } from '@/lib/utils'

const defaultForm = {
  linkToProperty: false,
  property_id: '',
  name: '',
  email: '',
  label: '',
  enabled: true,
  notification_types: [] as string[],
}

function tenantFullName(t: Tenant) {
  return `${t.first_name} ${t.last_name}`.trim()
}

function buildPropertyOptions(
  properties: Property[],
  leases: Lease[],
  tenants: Tenant[],
) {
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const activeLeases = leases.filter((l) => l.status === 'active')
  const leaseByProperty = new Map(activeLeases.map((l) => [l.property_id, l]))

  return properties
    .filter((p) => p.purpose === 'rent' && leaseByProperty.has(p.id))
    .map((p) => {
      const lease = leaseByProperty.get(p.id)!
      const tenant = tenantById.get(lease.tenant_id)
      const tenantName = tenant ? tenantFullName(tenant) : 'Sin arrendatario'
      const email = tenant?.contact?.email?.trim() ?? ''
      return {
        property: p,
        lease,
        tenant,
        label: `${p.name} — ${tenantName}${email ? ` (${email})` : ''}`,
        hasEmail: email.length > 0,
      }
    })
    .sort((a, b) => a.property.name.localeCompare(b.property.name, 'es'))
}

export function DestinatariosTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EmailRecipient | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmSync, setConfirmSync] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['email-recipients'],
    queryFn: () => api.getEmailRecipients(),
  })
  const { data: types } = useQuery({
    queryKey: ['email-notification-types'],
    queryFn: () => api.getEmailNotificationTypes(),
  })
  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties({ limit: 500 }),
  })
  const { data: leases } = useQuery({
    queryKey: ['leases'],
    queryFn: () => api.getLeases(1, undefined, 500),
  })
  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.getTenants(1, 500),
  })

  const propertyOptions = useMemo(
    () => buildPropertyOptions(properties?.data ?? [], leases?.data ?? [], tenants?.data ?? []),
    [properties, leases, tenants],
  )

  const propertyById = useMemo(
    () => new Map(propertyOptions.map((o) => [o.property.id, o])),
    [propertyOptions],
  )

  const propertyNameById = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p.name])),
    [properties],
  )

  const typeLabels = useMemo(
    () => new Map((types?.data ?? []).map((t) => [t.id, t.label])),
    [types],
  )

  const selectedProperty = form.property_id ? propertyById.get(form.property_id) : undefined

  useEffect(() => {
    if (!form.linkToProperty || !selectedProperty) return
    const tenantName = selectedProperty.tenant ? tenantFullName(selectedProperty.tenant) : ''
    const email = selectedProperty.tenant?.contact?.email?.trim() ?? ''
    setForm((prev) => ({
      ...prev,
      name: tenantName,
      email,
    }))
  }, [form.linkToProperty, form.property_id, selectedProperty])

  const resetForm = () => {
    setForm(defaultForm)
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    const allTypes = (types?.data ?? []).map((t) => t.id)
    if (allTypes.length > 0) {
      setForm((prev) => ({ ...prev, notification_types: allTypes }))
    }
    setOpen(true)
  }

  const openEdit = (rec: EmailRecipient) => {
    const linked = Boolean(rec.property_id)
    setEditing(rec)
    setForm({
      linkToProperty: linked,
      property_id: rec.property_id ?? '',
      name: rec.name,
      email: rec.email,
      label: rec.label ?? '',
      enabled: rec.enabled,
      notification_types: [...rec.notification_types],
    })
    setOpen(true)
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = form.linkToProperty
        ? {
            property_id: form.property_id,
            label: form.label || undefined,
            enabled: form.enabled,
            notification_types: form.notification_types,
          }
        : {
            name: form.name,
            email: form.email,
            label: form.label || undefined,
            property_id: '',
            enabled: form.enabled,
            notification_types: form.notification_types,
          }
      return editing
        ? api.updateEmailRecipient(editing.id, payload)
        : api.createEmailRecipient(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-recipients'] })
      setOpen(false)
      resetForm()
    },
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updateEmailRecipient(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-recipients'] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteEmailRecipient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-recipients'] })
      setConfirmDelete(false)
      setDeleteId(null)
    },
  })

  const syncFromLeases = useMutation({
    mutationFn: () => api.syncEmailRecipientsFromLeases(),
    onSuccess: (res) => {
      const r = res.result
      setFeedback(t('recipients.syncResult', {
        created: r.created,
        updated: r.updated ?? 0,
        alreadyExists: r.already_exists,
        skippedNoEmail: r.skipped_no_email,
        skipped: r.skipped,
      }))
      qc.invalidateQueries({ queryKey: ['email-recipients'] })
      setConfirmSync(false)
    },
    onError: (err: Error) => {
      setFeedback(err.message)
      setConfirmSync(false)
    },
  })

  const sendTest = useMutation({
    mutationFn: (recipientId: string) => api.sendTestEmail({ recipient_id: recipientId, all_formats: true }),
    onSuccess: (res) => {
      const sent = res.result?.sent_count ?? 0
      const failed = res.result?.failed_count ?? 0
      if (!res.configured) {
        setFeedback('SMTP no configurado: completa SMTP_HOST, SMTP_USER, SMTP_PASSWORD y SMTP_FROM en .env')
        return
      }
      if (failed > 0) {
        setFeedback(res.message ?? `Se enviaron ${sent} correo(s) de prueba, ${failed} fallido(s).`)
      } else {
        setFeedback(res.message ?? `${sent} correos de prueba enviados (uno por tipo de aviso).`)
      }
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const toggleType = (typeId: string) => {
    setForm((prev) => ({
      ...prev,
      notification_types: prev.notification_types.includes(typeId)
        ? prev.notification_types.filter((t) => t !== typeId)
        : [...prev.notification_types, typeId],
    }))
  }

  const canSaveLinked = form.linkToProperty && form.property_id && selectedProperty?.hasEmail && form.notification_types.length > 0
  const canSaveInternal = !form.linkToProperty && form.name.trim() && form.email.trim() && form.notification_types.length > 0
  const canSave = canSaveLinked || canSaveInternal
  const [viewMode, setViewMode] = useViewMode('notifications-destinatarios', 'tabla')
  const recipients = data?.data ?? []

  const recipientActions = (rec: EmailRecipient) => (
    <div className="flex flex-wrap gap-2 justify-end">
      <Button size="sm" variant="outline" onClick={() => sendTest.mutate(rec.id)} disabled={sendTest.isPending} title="Envía un correo de prueba por cada tipo de aviso">
        Probar formatos
      </Button>
      <Button size="sm" variant="outline" onClick={() => openEdit(rec)}>
        Editar
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          setDeleteId(rec.id)
          setConfirmDelete(true)
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )

  const renderRecipientTypes = (rec: EmailRecipient) => (
    <div className="flex flex-wrap gap-1">
      {rec.notification_types.length === 0 ? (
        <span className="text-muted-foreground">Ninguno</span>
      ) : (
        rec.notification_types.map((t) => (
          <StatusBadge key={t} status={typeLabels.get(t) ?? t} />
        ))
      )}
    </div>
  )

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setConfirmSync(true)} disabled={syncFromLeases.isPending}>
          <Users className="h-4 w-4" />
          {t('recipients.syncFromLeases')}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Agregar destinatario
        </Button>
      </div>

      {feedback && (
        <p className={`text-sm ${sendTest.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {feedback}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Destinatarios de correo</CardTitle>
          {recipients.length > 0 && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          )}
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!recipients.length ? (
            <div className="p-8 text-center space-y-3">
              <EmptyState message="Sin destinatarios de correo configurados." />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Agrega destinatarios internos (administración) o vincula un departamento con arriendo
                activo para enviar avisos al arrendatario. Para mantenciones, el destinatario debe ser
                interno (recibe todos los avisos) o estar vinculado al mismo departamento de la mantención,
                con el tipo «Recordatorio de mantención» activado.
              </p>
              <Button onClick={openCreate}>Agregar primer destinatario</Button>
            </div>
          ) : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {recipients.map((rec) => {
                const linked = Boolean(rec.property_id)
                const propertyName = linked ? propertyNameById.get(rec.property_id!) ?? '—' : '—'
                return (
                  <Card key={rec.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{rec.name}</CardTitle>
                        <StatusBadge status={linked ? 'Departamento' : 'Interno'} />
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.email}</p>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rec.enabled}
                          onChange={(e) => toggleEnabled.mutate({ id: rec.id, enabled: e.target.checked })}
                          className="h-4 w-4 rounded border"
                        />
                        Recibir mail
                      </label>
                      {linked && <p className="text-muted-foreground">Propiedad: {propertyName}</p>}
                      {rec.label && <p className="text-muted-foreground">{rec.label}</p>}
                      {renderRecipientTypes(rec)}
                      {recipientActions(rec)}
                    </CardContent>
                  </Card>
                )
              })}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {recipients.map((rec) => {
                const linked = Boolean(rec.property_id)
                return (
                  <DataListItem key={rec.id} className="justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={rec.enabled}
                        onChange={(e) => toggleEnabled.mutate({ id: rec.id, enabled: e.target.checked })}
                        className="h-4 w-4 rounded border shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{rec.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{rec.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={linked ? 'Departamento' : 'Interno'} />
                      {recipientActions(rec)}
                    </div>
                  </DataListItem>
                )
              })}
            </DataListShell>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Recibir mail</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Propiedad</th>
                    <th className="p-4 font-medium">Arrendatario / Nombre</th>
                    <th className="p-4 font-medium">Correo</th>
                    <th className="p-4 font-medium">Rol / etiqueta</th>
                    <th className="p-4 font-medium">Tipos de aviso</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((rec) => {
                    const linked = Boolean(rec.property_id)
                    const propertyName = linked
                      ? propertyNameById.get(rec.property_id!) ?? '—'
                      : '—'
                    return (
                      <tr key={rec.id} className="border-b hover:bg-muted/50">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={rec.enabled}
                            onChange={(e) => toggleEnabled.mutate({ id: rec.id, enabled: e.target.checked })}
                            aria-label={`Recibir notificaciones por mail: ${rec.name}`}
                            className="h-4 w-4 rounded border"
                          />
                        </td>
                        <td className="p-4">
                          <StatusBadge status={linked ? 'Departamento' : 'Interno'} />
                        </td>
                        <td className="p-4">{propertyName}</td>
                        <td className="p-4 font-medium">{rec.name}</td>
                        <td className="p-4">{rec.email}</td>
                        <td className="p-4 text-muted-foreground">{rec.label || '—'}</td>
                        <td className="p-4">{renderRecipientTypes(rec)}</td>
                        <td className="p-4">{recipientActions(rec)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onClose={() => { setOpen(false); resetForm() }}
        title={editing ? 'Editar destinatario' : 'Nuevo destinatario'}
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          save.mutate()
        }}
        loading={save.isPending}
      >
        <FormField label="Vincular a departamento">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.linkToProperty}
              onChange={(e) => {
                const checked = e.target.checked
                setForm((p) => ({
                  ...p,
                  linkToProperty: checked,
                  property_id: checked ? p.property_id : '',
                  name: checked ? p.name : '',
                  email: checked ? p.email : '',
                }))
              }}
              className="h-4 w-4 rounded border"
            />
            Usar arrendatario del arriendo activo
          </label>
        </FormField>

        {form.linkToProperty ? (
          <>
            <FormField label="Departamento">
              <select
                required
                value={form.property_id}
                onChange={(e) => setForm((p) => ({ ...p, property_id: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecciona un departamento…</option>
                {propertyOptions.map((opt) => (
                  <option key={opt.property.id} value={opt.property.id} disabled={!opt.hasEmail}>
                    {opt.label}{!opt.hasEmail ? ' — sin correo' : ''}
                  </option>
                ))}
              </select>
              {propertyOptions.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No hay departamentos con finalidad de arriendo y contrato activo.
                </p>
              )}
            </FormField>
            <FormField label="Arrendatario">
              <Input readOnly value={form.name} placeholder="Se completa al elegir departamento" />
            </FormField>
            <FormField label="Correo electrónico">
              <Input
                type="email"
                readOnly
                value={form.email}
                placeholder="Se completa desde el arrendatario"
              />
              {form.property_id && selectedProperty && !selectedProperty.hasEmail && (
                <p className="mt-2 text-xs text-destructive">
                  El arrendatario no tiene correo. Actualízalo en Arrendatarios antes de guardar.
                </p>
              )}
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Nombre">
              <Input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </FormField>
            <FormField label="Correo electrónico">
              <Input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </FormField>
          </>
        )}

        <FormField label="Rol o etiqueta (opcional)">
          <Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Ej: Administrador, Contador" />
        </FormField>
        <FormField label="Recibir notificaciones por mail">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border"
            />
            Habilitado
          </label>
        </FormField>
        <FormField label="Tipos de notificación">
          <div className="grid gap-2 sm:grid-cols-2">
            {(types?.data ?? []).map((t) => (
              <label key={t.id} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50')}>
                <input
                  type="checkbox"
                  checked={form.notification_types.includes(t.id)}
                  onChange={() => toggleType(t.id)}
                  className="h-4 w-4 rounded border"
                />
                {t.label}
              </label>
            ))}
          </div>
          {form.notification_types.length === 0 && (
            <p className="mt-2 text-xs text-destructive">Selecciona al menos un tipo de aviso.</p>
          )}
        </FormField>
        {save.error && (
          <p className="text-sm text-destructive">{(save.error as Error).message}</p>
        )}
      </FormDialog>

      <PinConfirmDialog
        open={confirmSync}
        title={t('recipients.syncConfirmTitle')}
        message={t('recipients.syncConfirmMessage')}
        confirmLabel={t('recipients.syncConfirmLabel')}
        loading={syncFromLeases.isPending}
        onClose={() => setConfirmSync(false)}
        onConfirm={() => syncFromLeases.mutate()}
      />

      <PinConfirmDialog
        open={confirmDelete}
        title="Eliminar destinatario"
        message="Este destinatario dejará de recibir correos."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteId && remove.mutate(deleteId)}
      />
    </div>
  )
}
