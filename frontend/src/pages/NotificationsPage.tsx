import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { History, Mail, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AutomatizacionTab } from '@/pages/notifications/AutomatizacionTab'
import { DestinatariosTab } from '@/pages/notifications/DestinatariosTab'
import { HistorialTab } from '@/pages/notifications/HistorialTab'

export type NotificationTab = 'historial' | 'destinatarios' | 'automatizacion'

const tabs: Array<{ id: NotificationTab; label: string; icon: typeof History }> = [
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'destinatarios', label: 'Destinatarios', icon: Mail },
  { id: 'automatizacion', label: 'Automatización', icon: Settings2 },
]

function parseTab(value: string | null): NotificationTab {
  if (value === 'destinatarios' || value === 'automatizacion') return value
  return 'historial'
}

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get('tab'))

  const { data: notifications } = useQuery({
    queryKey: ['notifications', {}],
    queryFn: () => api.getNotifications({}),
  })
  const { data: recipients } = useQuery({
    queryKey: ['email-recipients'],
    queryFn: () => api.getEmailRecipients(),
  })

  const count = useMemo(() => {
    if (activeTab === 'destinatarios') return recipients?.total
    return notifications?.total
  }, [activeTab, notifications?.total, recipients?.total])

  const setTab = (tab: NotificationTab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'historial') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notificaciones" count={count} />

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'historial' && <HistorialTab />}
      {activeTab === 'destinatarios' && <DestinatariosTab />}
      {activeTab === 'automatizacion' && <AutomatizacionTab />}
    </div>
  )
}
