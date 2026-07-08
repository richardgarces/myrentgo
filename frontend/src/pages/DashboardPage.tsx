import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSkeleton } from '@/components/ui/page'
import { api } from '@/lib/api'
import { useUF } from '@/hooks/useUF'
import { formatCurrency, formatDate, formatMonthLabel, formatUF } from '@/lib/utils'
import { CLPWithUF, UFIndicatorNote, UFWithCLP } from '@/components/UFWithCLP'
import { MetricTitleWithHelp } from '@/components/MetricHelp'
import { dashboardMetricHelp } from '@/lib/dashboard-metric-help'
import { Building2, TrendingUp, AlertTriangle, Wallet, FileText, Banknote, Landmark, Scale, Home, Clock, ArrowRight, CreditCard } from 'lucide-react'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const propertyTypeLabels: Record<string, string> = {
  house: 'Casa',
  apartment: 'Departamento',
  land: 'Terreno',
  warehouse: 'Bodega',
  office: 'Oficina',
  parking: 'Estacionamiento',
}

const paymentTypeLabels: Record<string, string> = {
  rent: 'Arriendo',
  deposit: 'Depósito',
  expense: 'Gasto',
  common_fee: 'Gasto común',
  tax: 'Impuesto',
  dividend: 'Dividendo',
}

const paymentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  overdue: 'Vencido',
}

function formatCLPDual(clp: number, ufValue: number | undefined) {
  const primary = formatCurrency(clp)
  if (!ufValue || ufValue <= 0) return primary
  return `${primary} (≈ ${formatUF(clp / ufValue)})`
}

function formatUFDual(ufAmount: number, ufValue: number | undefined) {
  const primary = formatUF(ufAmount)
  if (!ufValue) return primary
  return `${primary} (≈ ${formatCurrency(ufAmount * ufValue)})`
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: uf } = useUF()
  const ufValue = uf?.value
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  })

  if (isLoading && !data) return <LoadingSkeleton />

  const stats: Array<{
    label: string
    help: string
    value: string | number
    subtitle?: string
    icon: typeof Building2
    href?: string
  }> = [
    { label: 'Propiedades', help: dashboardMetricHelp.totalProperties, value: data?.total_properties ?? 0, icon: Building2, href: '/properties' },
    { label: t('dashboard.occupancy'), help: dashboardMetricHelp.occupancy, value: `${(data?.occupancy_rate ?? 0).toFixed(1)}%`, icon: TrendingUp, href: '/properties?disponibles=1' },
    {
      label: t('dashboard.overdue'),
      help: dashboardMetricHelp.overdue,
      value: data?.overdue_payments ?? 0,
      subtitle: (data?.overdue_payments ?? 0) > 0 ? t('dashboard.overdueCount', { count: data?.overdue_payments ?? 0 }) : undefined,
      icon: AlertTriangle,
      href: '/payments',
    },
    {
      label: t('dashboard.pendingPayments'),
      help: dashboardMetricHelp.pendingPayments,
      value: data?.pending_payments_count ?? 0,
      subtitle: (data?.total_rent_pending ?? 0) > 0
        ? t('dashboard.rentPendingSubtitle', { amount: formatCurrency(data?.total_rent_pending ?? 0) })
        : formatCurrency(data?.pending_payments_total ?? 0),
      icon: Clock,
      href: '/payments',
    },
    { label: t('dashboard.cashFlow'), help: dashboardMetricHelp.cashFlow, value: formatCurrency(data?.net_cash_flow ?? 0), icon: Wallet },
  ]

  const portfolioStats: Array<{
    label: string
    help: string
    value?: string
    clpAmount?: number
    ufAmount?: number
    ufSuffix?: string
    icon: typeof Building2
    href?: string
  }> = [
    {
      label: t('dashboard.activeLeases'),
      help: dashboardMetricHelp.activeLeases,
      value: String(data?.active_leases ?? 0),
      icon: FileText,
      href: '/leases',
    },
    {
      label: t('dashboard.totalMonthlyRent'),
      help: dashboardMetricHelp.totalMonthlyRent,
      clpAmount: data?.total_monthly_rent ?? 0,
      icon: Banknote,
      href: '/leases',
    },
    {
      label: t('dashboard.totalValueUF'),
      help: dashboardMetricHelp.totalValueUF,
      ufAmount: data?.total_value_uf ?? 0,
      icon: Landmark,
      href: '/properties',
    },
    {
      label: t('dashboard.totalDebtUF'),
      help: dashboardMetricHelp.totalDebtUF,
      ufAmount: data?.total_debt_uf ?? 0,
      icon: Scale,
    },
    {
      label: t('dashboard.totalOriginalLoanUF'),
      help: dashboardMetricHelp.totalOriginalLoanUF,
      ufAmount: data?.total_original_loan_uf ?? 0,
      icon: CreditCard,
      href: '/properties',
    },
    {
      label: t('dashboard.totalMortgageUF'),
      help: dashboardMetricHelp.totalMortgageUF,
      ufAmount: data?.total_monthly_mortgage_uf ?? 0,
      ufSuffix: '/mes',
      icon: Home,
      href: '/dividends',
    },
  ]

  const rentable = data?.rentable_properties ?? data?.total_properties ?? 0
  const rented = data?.rented_properties ?? 0

  const pieData = [
    { name: 'Arrendadas', value: rented },
    { name: 'Disponibles', value: Math.max(0, rentable - rented) },
  ]

  const cashFlowData = [
    { month: 'Ingresos', income: data?.monthly_income ?? 0, expenses: 0 },
    { month: 'Gastos', income: 0, expenses: data?.monthly_expenses ?? 0 },
    { month: 'Neto', income: data?.net_cash_flow ?? 0, expenses: 0 },
  ]

  const rentMonthLabel = data?.rent_month ? formatMonthLabel(data.rent_month) : formatMonthLabel(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  )

  const rentPaid = data?.total_rent_paid ?? 0
  const rentPending = data?.total_rent_pending ?? 0
  const rentChartData = [
    { name: t('dashboard.rentPaid'), value: rentPaid },
    { name: t('dashboard.rentPending'), value: rentPending },
  ].filter((item) => item.value > 0)

  const dividendMonthLabel = data?.dividend_month ? formatMonthLabel(data.dividend_month) : rentMonthLabel
  const dividendPaid = data?.total_dividend_paid_uf ?? 0
  const dividendPending = data?.total_dividend_pending_uf ?? 0
  const dividendChartData = [
    { name: t('dashboard.dividendsPaid'), value: dividendPaid },
    { name: t('dashboard.dividendsPending'), value: dividendPending },
  ].filter((item) => item.value > 0)

  const typeBreakdown = data?.properties_by_type ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map(({ label, help, value, subtitle, icon: Icon, href }) => (
          <Card
            key={label}
            role={href ? 'button' : undefined}
            tabIndex={href ? 0 : undefined}
            onClick={href ? () => navigate(href) : undefined}
            onKeyDown={href ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(href) } } : undefined}
            className={href ? 'hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40' : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <MetricTitleWithHelp title={label} help={help} />
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">
          <MetricTitleWithHelp title={t('dashboard.portfolioTotals')} help={dashboardMetricHelp.portfolioTotals} />
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {portfolioStats.map(({ label, help, value, clpAmount, ufAmount, ufSuffix, icon: Icon, href }) => (
            <Card
              key={label}
              role={href ? 'button' : undefined}
              tabIndex={href ? 0 : undefined}
              onClick={href ? () => navigate(href) : undefined}
              onKeyDown={href ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(href) } } : undefined}
              className={href ? 'hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40' : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <MetricTitleWithHelp title={label} help={help} />
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {ufAmount != null ? (
                  <UFWithCLP amount={ufAmount} suffix={ufSuffix} />
                ) : clpAmount != null ? (
                  <CLPWithUF amount={clpAmount} />
                ) : (
                  <div className="text-2xl font-bold">{value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <UFIndicatorNote help={dashboardMetricHelp.ufIndicator} />
      </div>

      {typeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.propertiesByType')} help={dashboardMetricHelp.propertiesByType} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {typeBreakdown.map(({ type, count }) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-sm"
                >
                  <span className="font-medium">{propertyTypeLabels[type] ?? type}</span>
                  <span className="text-muted-foreground">{count}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.cashFlow')} help={dashboardMetricHelp.cashFlowChart} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="income" fill="#10b981" name="Ingresos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" name="Gastos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.rentPaidVsPending')} help={dashboardMetricHelp.rentPaidVsPending} />
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium">{rentMonthLabel}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.rentCurrentMonth')}</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {rentPaid === 0 && rentPending === 0 ? (
              <p className="text-sm text-muted-foreground py-16">Sin datos de arriendo este mes</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={rentChartData.length > 0 ? rentChartData : [{ name: t('dashboard.rentPaid'), value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${formatCLPDual(value, ufValue)}`}
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCLPDual(v, ufValue)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-6 text-sm mt-2">
                  <span className="inline-flex items-start gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                    <span>
                      <span className="text-muted-foreground">{t('dashboard.rentPaid')}: </span>
                      <CLPWithUF amount={rentPaid} valueClassName="font-medium text-sm" />
                      {(data?.total_rent_paid_count ?? 0) > 0 && (
                        <span className="text-muted-foreground"> ({data?.total_rent_paid_count})</span>
                      )}
                    </span>
                  </span>
                  <span className="inline-flex items-start gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                    <span>
                      <span className="text-muted-foreground">{t('dashboard.rentPending')}: </span>
                      <CLPWithUF amount={rentPending} valueClassName="font-medium text-sm" />
                      {(data?.total_rent_pending_count ?? 0) > 0 && (
                        <span className="text-muted-foreground"> ({data?.total_rent_pending_count})</span>
                      )}
                    </span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/dividends')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/dividends') } }}
          className="hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40"
        >
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.dividendsPaidVsPending')} help={dashboardMetricHelp.dividendsPaidVsPending} />
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium">{dividendMonthLabel}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.dividendsCurrentMonth')}</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {dividendPaid === 0 && dividendPending === 0 ? (
              <p className="text-sm text-muted-foreground py-16">Sin dividendos este mes</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={dividendChartData.length > 0 ? dividendChartData : [{ name: t('dashboard.dividendsPaid'), value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${formatUFDual(value, ufValue)}`}
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip formatter={(v: number) => formatUFDual(v, ufValue)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-6 text-sm mt-2">
                  <span className="inline-flex items-start gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                    <span>
                      <span className="text-muted-foreground">{t('dashboard.dividendsPaid')}: </span>
                      <UFWithCLP amount={dividendPaid} valueClassName="font-medium text-sm" />
                      {(data?.total_dividend_paid_count ?? 0) > 0 && (
                        <span className="text-muted-foreground"> ({data?.total_dividend_paid_count})</span>
                      )}
                    </span>
                  </span>
                  <span className="inline-flex items-start gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                    <span>
                      <span className="text-muted-foreground">{t('dashboard.dividendsPending')}: </span>
                      <UFWithCLP amount={dividendPending} valueClassName="font-medium text-sm" />
                      {(data?.total_dividend_pending_count ?? 0) > 0 && (
                        <span className="text-muted-foreground"> ({data?.total_dividend_pending_count})</span>
                      )}
                    </span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/properties?disponibles=1')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/properties?disponibles=1') } }}
          className="hover:shadow-md transition-shadow cursor-pointer hover:border-primary/40"
        >
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.occupancy')} help={dashboardMetricHelp.occupancyChart} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.pendingPayments')} help={dashboardMetricHelp.pendingPaymentsList} />
            </CardTitle>
            {(data?.pending_payments_count ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => navigate('/payments')}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Ver todos
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardHeader>
          <CardContent>
            {(data?.pending_payments?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noPendingPayments')}</p>
            ) : (
              <ul className="space-y-2">
                {data?.pending_payments.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm border-b pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {item.tenant_name || 'Sin arrendatario'}
                        {item.property_name ? ` · ${item.property_name}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {paymentTypeLabels[item.type] ?? item.type} · Vence {formatDate(item.due_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">{formatCurrency(item.amount)}</p>
                      <span
                        className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs ${
                          item.status === 'overdue'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {paymentStatusLabels[item.status] ?? item.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {(data?.pending_payments_count ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                {t('dashboard.pendingTotal')}: {formatCurrency(data?.pending_payments_total ?? 0)}
                {(data?.overdue_payments ?? 0) > 0 && (
                  <> · {t('dashboard.overdueCount', { count: data?.overdue_payments ?? 0 })}</>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <MetricTitleWithHelp title={t('dashboard.expirations')} help={dashboardMetricHelp.expirations} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.upcoming_expirations?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sin vencimientos próximos</p>
            ) : (
              <ul className="space-y-2">
                {data?.upcoming_expirations.map((item) => (
                  <li key={item.id} className="flex justify-between text-sm border-b pb-2">
                    <span>{item.title}</span>
                    <span className="text-muted-foreground">{item.days_left} días</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
