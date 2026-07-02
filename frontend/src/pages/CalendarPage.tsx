import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

const typeLabels: Record<string, string> = {
  lease: 'Arriendo', payment: 'Pago', maintenance: 'Mantención',
}

export function CalendarPage() {
  const { t } = useTranslation()
  const { data: events, isLoading } = useQuery({ queryKey: ['calendar'], queryFn: () => api.getCalendar(90) })
  const { data: reminders } = useQuery({ queryKey: ['reminders'], queryFn: () => api.getReminders() })

  if (isLoading) return <LoadingSkeleton />

  const sorted = [...(events?.data ?? [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.calendar')} count={sorted.length} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Próximos vencimientos (90 días)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!sorted.length ? (
            <EmptyState message="Sin eventos próximos." />
          ) : (
            <ul className="divide-y">
              {sorted.map((ev) => (
                <li key={`${ev.type}-${ev.id}`} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">{typeLabels[ev.type] || ev.type}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{formatDate(ev.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {reminders?.data.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Recordatorios programados</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {reminders.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-muted-foreground">{r.channel} → {r.recipient}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={r.status} />
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(r.scheduled_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
