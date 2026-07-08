import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ArrowLeft,
  Database,
  HardDrive,
  RefreshCw,
  Server,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormSelect } from '@/components/ui/form-dialog'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { api, type SystemHealth, type SystemLogEntry } from '@/lib/api'
import { canManageUsers } from '@/lib/roles'
import { useAuthStore } from '@/stores'
import { cn, formatDateTime } from '@/lib/utils'

const LEVEL_LABELS: Record<string, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Advertencia',
  error: 'Error',
}

function componentStatus(status: string): 'sent' | 'failed' | 'pending' {
  if (status === 'ok') return 'sent'
  if (status === 'error') return 'failed'
  return 'pending'
}

function HealthCard({
  title,
  icon: Icon,
  status,
  message,
  detail,
}: {
  title: string
  icon: typeof Server
  status: string
  message?: string
  detail?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <StatusBadge status={componentStatus(status)} label={status === 'ok' ? 'Operativo' : status === 'error' ? 'Error' : 'Advertencia'} />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {detail && <p className="text-xs font-mono text-muted-foreground break-all">{detail}</p>}
      </CardContent>
    </Card>
  )
}

function LogRow({ entry }: { entry: SystemLogEntry }) {
  const level = entry.level ?? 'info'
  const status =
    level === 'error' ? 'failed' : level === 'warn' ? 'pending' : level === 'info' ? 'sent' : 'active'

  return (
    <tr className="border-b border-border/60 hover:bg-muted/30">
      <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(entry.timestamp)}
      </td>
      <td className="py-2 px-3">
        <StatusBadge status={status} label={LEVEL_LABELS[level] ?? level} />
      </td>
      <td className="py-2 px-3 text-xs font-mono text-muted-foreground">{entry.category}</td>
      <td className="py-2 px-3 text-sm">{entry.message}</td>
      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate">
        {entry.fields ? JSON.stringify(entry.fields) : '—'}
      </td>
    </tr>
  )
}

export function SystemMonitoringPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const currentRole = user?.current_role ?? user?.organizations?.[0]?.role ?? ''
  const isAdmin = canManageUsers(currentRole)

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const logFilters = useMemo(
    () => ({
      level: level || undefined,
      q: search.trim() || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      page,
      limit: 50,
    }),
    [level, search, fromDate, toDate, page],
  )

  const {
    data: health,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.getSystemHealth(),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  })

  const {
    data: metrics,
    isFetching: metricsFetching,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => api.getSystemMetrics(),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  })

  const {
    data: logs,
    isLoading: logsLoading,
    isFetching: logsFetching,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['system-logs', logFilters],
    queryFn: () => api.getSystemLogs(logFilters),
    enabled: isAdmin,
    staleTime: 10_000,
    refetchInterval: autoRefresh ? 15_000 : false,
  })

  useEffect(() => {
    setPage(1)
  }, [level, search, fromDate, toDate])

  const refreshAll = () => {
    refetchHealth()
    refetchMetrics()
    refetchLogs()
  }

  if (!isAdmin) {
    return <Navigate to="/settings" replace />
  }

  const healthData = health as SystemHealth | undefined
  const isRefreshing = healthFetching || metricsFetching || logsFetching
  const showMetricsWarning =
    healthData?.env === 'development' && healthData?.security?.metrics_protected === false
  const showMongoWarning = healthData?.security?.mongodb_without_auth === true

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {t('nav.settings')}
            </Link>
          </Button>
          <PageHeader title={t('system.title')} />
          <p className="text-sm text-muted-foreground -mt-4">{t('system.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <Activity className="h-4 w-4 mr-1.5" />
            {autoRefresh ? t('system.autoRefreshOn') : t('system.autoRefreshOff')}
          </Button>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isRefreshing && 'animate-spin')} />
            {t('system.refresh')}
          </Button>
        </div>
      </div>

      {(showMetricsWarning || showMongoWarning) && (
        <div className="space-y-2">
          {showMetricsWarning && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              {t('system.metricsPublicWarning')}
            </div>
          )}
          {showMongoWarning && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              {t('system.mongodbDevWarning')}
            </div>
          )}
        </div>
      )}

      {!healthData && healthFetching ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('system.uptime')}</CardDescription>
                <CardTitle className="text-2xl">{healthData?.uptime_human ?? '—'}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                v{healthData?.version ?? '1.0.0'} · {healthData?.env ?? '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('system.memory')}</CardDescription>
                <CardTitle className="text-2xl">
                  {metrics?.memory?.alloc_mb != null ? `${metrics.memory.alloc_mb.toFixed(1)} MB` : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metrics?.memory?.num_goroutines != null
                  ? `${metrics.memory.num_goroutines} goroutines`
                  : metricsFetching
                    ? t('system.loading')
                    : '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('system.pendingPayments')}</CardDescription>
                <CardTitle className="text-2xl">{metrics?.counts?.pending_payments ?? '—'}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('system.activeLeases')}</CardDescription>
                <CardTitle className="text-2xl">{metrics?.counts?.active_leases ?? '—'}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <HealthCard
              title="API"
              icon={Server}
              status={healthData?.components?.api?.status ?? 'ok'}
              message={healthData?.service}
            />
            <HealthCard
              title="MongoDB"
              icon={Database}
              status={healthData?.components?.mongodb?.status ?? 'ok'}
              message={healthData?.components?.mongodb?.message}
              detail={healthData?.components?.mongodb?.detail}
            />
            <HealthCard
              title={t('system.storage')}
              icon={HardDrive}
              status={healthData?.components?.storage?.status ?? 'ok'}
              message={healthData?.components?.storage?.message}
              detail={healthData?.components?.storage?.detail}
            />
          </div>

          {metrics?.counts && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('system.entityCounts')}</CardTitle>
                <CardDescription>{t('system.entityCountsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                  {[
                    { label: t('system.users'), value: metrics.counts.users },
                    { label: t('system.properties'), value: metrics.counts.properties },
                    { label: t('system.leases'), value: metrics.counts.leases },
                    { label: t('system.tenants'), value: metrics.counts.tenants },
                    { label: t('system.documents'), value: metrics.counts.documents },
                    { label: t('system.pendingPayments'), value: metrics.counts.pending_payments },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border p-3">
                      <p className="text-2xl font-semibold">{value ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('system.logs')}</CardTitle>
          <CardDescription>{t('system.logsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label={t('system.level')}>
              <FormSelect value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">{t('system.allLevels')}</option>
                <option value="info">Info</option>
                <option value="warn">Advertencia</option>
                <option value="error">Error</option>
              </FormSelect>
            </FormField>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('system.fromDate')}</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('system.toDate')}</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">{t('system.search')}</label>
              <Input
                placeholder={t('system.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {logsLoading ? (
            <LoadingSkeleton />
          ) : !logs?.data?.length ? (
            <EmptyState message={t('system.noLogs')} />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 font-medium">{t('system.timestamp')}</th>
                      <th className="py-2 px-3 font-medium">{t('system.level')}</th>
                      <th className="py-2 px-3 font-medium">{t('system.category')}</th>
                      <th className="py-2 px-3 font-medium">{t('system.message')}</th>
                      <th className="py-2 px-3 font-medium">{t('system.details')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.data.map((entry) => (
                      <LogRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {logs.total} {t('system.totalEntries')}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t('system.prev')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * (logs.limit ?? 50) >= logs.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('system.next')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
