import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSkeleton } from '@/components/ui/page'
import { api } from '@/lib/api'

export function AutomatizacionTab() {
  const qc = useQueryClient()
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data: types, isLoading: typesLoading } = useQuery({
    queryKey: ['email-notification-types'],
    queryFn: () => api.getEmailNotificationTypes(),
  })
  const { data: smtpStatus, isLoading: smtpLoading } = useQuery({
    queryKey: ['smtp-status'],
    queryFn: () => api.getSMTPStatus(),
  })
  const { data: automation, isLoading: automationLoading } = useQuery({
    queryKey: ['email-automation-settings'],
    queryFn: () => api.getEmailAutomationSettings(),
  })

  const typeLabels = useMemo(
    () => new Map((types?.data ?? []).map((t) => [t.id, t.label])),
    [types],
  )

  const sendPending = useMutation({
    mutationFn: () => api.sendEmailNotifications(),
    onSuccess: (res) => {
      const sent = res.result?.sent_count ?? 0
      setFeedback(`Se enviaron notificaciones a ${sent} destinatario(s)`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const runScheduler = useMutation({
    mutationFn: () => api.runEmailScheduler(),
    onSuccess: (res) => {
      const r = res.result
      setFeedback(
        `${r.created} creadas, ${r.sent} enviadas, ${r.skipped} omitidas, ${r.failed} fallidas (${r.checked_payments} pagos revisados)`,
      )
      qc.invalidateQueries({ queryKey: ['email-automation-settings'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const updateAutomation = useMutation({
    mutationFn: (rules: Array<{ id: string; enabled: boolean }>) =>
      api.updateEmailAutomationSettings(rules),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation-settings'] }),
  })

  const isLoading = typesLoading || smtpLoading || automationLoading
  if (isLoading && !automation) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => runScheduler.mutate()}
          disabled={runScheduler.isPending}
        >
          <Clock className="h-4 w-4" />
          {runScheduler.isPending ? 'Generando…' : 'Generar notificaciones automáticas'}
        </Button>
        <Button
          variant="outline"
          onClick={() => sendPending.mutate()}
          disabled={sendPending.isPending}
        >
          <Send className="h-4 w-4" />
          Enviar pendientes
        </Button>
      </div>

      {feedback && (
        <p className={`text-sm ${runScheduler.isError || sendPending.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {feedback}
        </p>
      )}

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
              : 'SMTP no configurado. Completa las variables SMTP en .env para enviar correos reales.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reglas automáticas de arriendo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Los correos se envían automáticamente a destinatarios habilitados según el tipo de aviso configurado.
            El scheduler revisa pagos de arriendo pendientes o vencidos cada día.
          </p>
          <div className="space-y-3">
            {(automation?.rules ?? []).map((rule) => (
              <label
                key={rule.id}
                className="flex items-start gap-3 rounded-md border px-4 py-3 text-sm hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  disabled={updateAutomation.isPending}
                  onChange={(e) => {
                    const next = (automation?.rules ?? []).map((r) =>
                      r.id === rule.id ? { id: r.id, enabled: e.target.checked } : { id: r.id, enabled: r.enabled },
                    )
                    updateAutomation.mutate(next)
                  }}
                  className="mt-0.5 h-4 w-4 rounded border"
                />
                <span>
                  <span className="font-medium block">{rule.label}</span>
                  <span className="text-muted-foreground">
                    {rule.days_offset < 0
                      ? `${Math.abs(rule.days_offset)} días antes del vencimiento`
                      : `${rule.days_offset} día(s) después del vencimiento`}
                    {' · '}
                    tipo: {typeLabels.get(rule.type) ?? rule.type}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {automation?.last_run_at && (
            <p className="text-xs text-muted-foreground">
              Última ejecución: {new Date(automation.last_run_at).toLocaleString('es-CL')}
              {automation.last_run_summary ? ` — ${automation.last_run_summary}` : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
