import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function FinancePage() {
  const { t } = useTranslation()
  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  })
  const { data: mortgages, isLoading: mLoading } = useQuery({
    queryKey: ['mortgages'],
    queryFn: () => api.getMortgages(),
  })

  if ((dashLoading && !dash) || mLoading) return <LoadingSkeleton />

  const cashFlow = [
    { name: 'Ingresos', value: dash?.monthly_income ?? 0 },
    { name: 'Gastos', value: dash?.monthly_expenses ?? 0 },
    { name: 'Neto', value: dash?.net_cash_flow ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.finance')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ingresos mes</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(dash?.monthly_income ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gastos mes</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(dash?.monthly_expenses ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Flujo neto</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(dash?.net_cash_flow ?? 0)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Flujo de caja</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cashFlow}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rentabilidad por propiedad</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!dash?.profitability?.length ? (
            <EmptyState message="Sin datos de rentabilidad aún." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-4 text-left">Propiedad</th>
                  <th className="p-4 text-left">Ingresos</th>
                  <th className="p-4 text-left">Gastos</th>
                  <th className="p-4 text-left">Utilidad</th>
                  <th className="p-4 text-left">ROI</th>
                </tr>
              </thead>
              <tbody>
                {dash.profitability.map((p) => (
                  <tr key={p.property_id} className="border-b">
                    <td className="p-4">{p.property_name}</td>
                    <td className="p-4">{formatCurrency(p.income)}</td>
                    <td className="p-4">{formatCurrency(p.expenses)}</td>
                    <td className="p-4 font-medium">{formatCurrency(p.profit)}</td>
                    <td className="p-4">{p.roi.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Créditos hipotecarios</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!mortgages?.data.length ? (
            <EmptyState message="Sin hipotecas registradas." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-4 text-left">Monto préstamo</th>
                  <th className="p-4 text-left">Dividendo</th>
                  <th className="p-4 text-left">Tasa</th>
                  <th className="p-4 text-left">Valor presente</th>
                </tr>
              </thead>
              <tbody>
                {mortgages.data.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="p-4">{formatCurrency(m.loan_amount.amount)}</td>
                    <td className="p-4">{formatCurrency(m.monthly_payment.amount)}</td>
                    <td className="p-4">{m.interest_rate}%</td>
                    <td className="p-4 font-medium">{formatCurrency(m.present_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
