import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { api, type EmailRecipient } from '@/lib/api'
import { cn } from '@/lib/utils'

const defaultForm = {
  name: '',
  email: '',
  label: '',
  enabled: true,
  notification_types: [] as string[],
}

export function EmailNotificationsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EmailRecipient | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
  const { data: smtpStatus } = useQuery({
    queryKey: ['smtp-status'],
    queryFn: () => api.getSMTPStatus(),
  })

  const typeLabels = useMemo(
    () => new Map((types?.data ?? []).map((t) => [t.id, t.label])),
    [types],
  )

  const resetForm = () => {
    setForm(defaultForm)
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    setOpen(true)
  }

  const openEdit = (rec: EmailRecipient) => {
    setEditing(rec)
    setForm({
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
      const payload = {
        name: form.name,
        email: form.email,
        label: form.label || undefined,
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

  const sendTest = useMutation({
    mutationFn: (recipientId: string) => api.sendTestEmail({ recipient_id: recipientId }),
    onSuccess: (res) => {
      setFeedback(res.message ?? 'Correo de prueba enviado')
      if (!res.configured) {
        setFeedback('SMTP no configurado: el envío se registró en logs del servidor (modo desarrollo)')
      }
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const sendPending = useMutation({
    mutationFn: () => api.sendEmailNotifications(),
    onSuccess: (res) => {
      const sent = res.result?.sent_count ?? 0
      setFeedback(`Se enviaron notificaciones a ${sent} destinatario(s)`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
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

  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones por correo"
        count={data?.total}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => sendPending.mutate()} disabled={sendPending.isPending}>
              <Send className="h-4 w-4" />
              Enviar pendientes
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Agregar destinatario
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Estado SMTP
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            {smtpStatus?.configured
              ? 'SMTP configurado. Los correos se enviarán a los destinatarios habilitados.'
              : 'SMTP no configurado. En desarrollo los envíos se registran en logs sin error.'}
          </p>
          {feedback && <p className="text-foreground pt-2">{feedback}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinatarios</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data?.data.length ? (
            <EmptyState message="Sin destinatarios de correo configurados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Recibir mail</th>
                    <th className="p-4 font-medium">Nombre</th>
                    <th className="p-4 font-medium">Correo</th>
                    <th className="p-4 font-medium">Rol / etiqueta</th>
                    <th className="p-4 font-medium">Tipos de aviso</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((rec) => (
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
                      <td className="p-4 font-medium">{rec.name}</td>
                      <td className="p-4">{rec.email}</td>
                      <td className="p-4 text-muted-foreground">{rec.label || '—'}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {rec.notification_types.length === 0 ? (
                            <span className="text-muted-foreground">Ninguno</span>
                          ) : (
                            rec.notification_types.map((t) => (
                              <StatusBadge key={t} status={typeLabels.get(t) ?? t} />
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => sendTest.mutate(rec.id)} disabled={sendTest.isPending}>
                            Probar
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
        onClose={() => { setOpen(false); resetForm() }}
        title={editing ? 'Editar destinatario' : 'Nuevo destinatario'}
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        loading={save.isPending}
      >
        <FormField label="Nombre">
          <Input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </FormField>
        <FormField label="Correo electrónico">
          <Input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </FormField>
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
        </FormField>
        {save.error && (
          <p className="text-sm text-destructive">{(save.error as Error).message}</p>
        )}
      </FormDialog>

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
