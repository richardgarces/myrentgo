import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { PaymentBankSelect } from '@/components/PaymentBankSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader } from '@/components/ui/page'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { UFIndicatorNote, UFWithCLP } from '@/components/UFWithCLP'
import { useViewMode } from '@/hooks/useViewMode'
import { api, type Mortgage, type MortgagePayload, type Property } from '@/lib/api'
import { buildBankOptions } from '@/lib/payment-banks'
import { invalidateAfterMutation } from '@/lib/query-options'
import { formatCurrency, formatMonthLabel, formatUF, filledControlClass, hasMortgageCredit, cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

/** Construye la vista de crédito desde la ficha de la propiedad (fuente de verdad). */
function propertyToMortgage(p: Property): Mortgage {
  const f = p.financials
  return {
    id: p.id,
    property_id: p.id,
    property_name: p.name,
    bank_name: f?.bank_name,
    original_loan_uf: f?.original_loan_uf,
    commercial_value_uf: f?.commercial_value_uf,
    debt_uf: f?.debt_uf,
    monthly_mortgage_uf: f?.monthly_mortgage_uf,
    loan_term_years: f?.loan_term_years,
    installments_paid: f?.installments_paid,
    interest_rate: f?.interest_rate,
    credit_number: f?.credit_number,
    payment_bank: f?.payment_bank,
    pac_enabled: f?.pac_enabled,
    payment_start_date: f?.payment_start_date,
    loan_amount: { amount: 0 },
    monthly_payment: { amount: 0 },
    present_value: 0,
    active: hasMortgageCredit(f),
  }
}

const emptyMortgageForm = {
  property_id: '',
  original_loan_uf: '',
  commercial_value_uf: '',
  debt_uf: '',
  monthly_mortgage_uf: '',
  loan_term_years: '',
  installments_paid: '',
  interest_rate: '',
  bank_name: '',
  credit_number: '',
  payment_start_date: '',
  pac_enabled: false,
  payment_bank: '',
}

function mortgageToForm(m: Mortgage) {
  return {
    property_id: m.property_id,
    original_loan_uf: m.original_loan_uf ? String(m.original_loan_uf) : '',
    commercial_value_uf: m.commercial_value_uf ? String(m.commercial_value_uf) : '',
    debt_uf: m.debt_uf ? String(m.debt_uf) : '',
    monthly_mortgage_uf: m.monthly_mortgage_uf ? String(m.monthly_mortgage_uf) : '',
    loan_term_years: m.loan_term_years ? String(m.loan_term_years) : '',
    installments_paid: m.installments_paid ? String(m.installments_paid) : '',
    interest_rate: m.interest_rate ? String(m.interest_rate) : '',
    bank_name: m.bank_name ?? '',
    credit_number: m.credit_number ?? '',
    payment_start_date: m.payment_start_date?.slice(0, 10) ?? '',
    pac_enabled: m.pac_enabled ?? false,
    payment_bank: m.payment_bank ?? '',
  }
}

function formToPayload(form: typeof emptyMortgageForm): MortgagePayload {
  return {
    property_id: form.property_id || undefined,
    original_loan_uf: form.original_loan_uf ? Number(form.original_loan_uf) : undefined,
    commercial_value_uf: form.commercial_value_uf ? Number(form.commercial_value_uf) : undefined,
    debt_uf: form.debt_uf ? Number(form.debt_uf) : undefined,
    monthly_mortgage_uf: form.monthly_mortgage_uf ? Number(form.monthly_mortgage_uf) : undefined,
    loan_term_years: form.loan_term_years ? Number(form.loan_term_years) : undefined,
    installments_paid: form.installments_paid ? Number(form.installments_paid) : undefined,
    interest_rate: form.interest_rate ? Number(form.interest_rate) : undefined,
    bank_name: form.bank_name || undefined,
    credit_number: form.credit_number || undefined,
    payment_start_date: form.payment_start_date || undefined,
    pac_enabled: form.pac_enabled,
    payment_bank: form.payment_bank || undefined,
  }
}

function MortgageFormFields({
  form,
  setForm,
  bankOptions,
  propertyOptions,
  editing,
}: {
  form: typeof emptyMortgageForm
  setForm: (next: typeof emptyMortgageForm) => void
  bankOptions: ReturnType<typeof buildBankOptions>
  propertyOptions: Array<{ id: string; name: string }>
  editing: boolean
}) {
  const { t } = useTranslation()
  const filled = filledControlClass

  return (
    <>
      {!editing && (
        <FormField label={t('finance.mortgage.property')}>
          <FormSelect
            required
            value={form.property_id}
            onChange={(e) => setForm({ ...form, property_id: e.target.value })}
            className={filled(Boolean(form.property_id))}
          >
            <option value="">—</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </FormSelect>
        </FormField>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label={t('finance.mortgage.originalLoan')}>
          <Input
            type="number"
            step="any"
            min="0"
            value={form.original_loan_uf}
            onChange={(e) => setForm({ ...form, original_loan_uf: e.target.value })}
            placeholder="2000"
            className={filled(form.original_loan_uf.trim() !== '')}
          />
          {(Number(form.original_loan_uf) || 0) > 0 && (
            <UFWithCLP amount={Number(form.original_loan_uf)} valueClassName="text-xs text-muted-foreground" />
          )}
        </FormField>
        <FormField label={t('finance.mortgage.debt')}>
          <Input
            type="number"
            step="any"
            min="0"
            value={form.debt_uf}
            onChange={(e) => setForm({ ...form, debt_uf: e.target.value })}
            placeholder="1800"
            className={filled(form.debt_uf.trim() !== '')}
          />
          {(Number(form.debt_uf) || 0) > 0 && (
            <UFWithCLP amount={Number(form.debt_uf)} valueClassName="text-xs text-muted-foreground" />
          )}
        </FormField>
        <FormField label={t('finance.mortgage.monthly')}>
          <Input
            type="number"
            step="any"
            min="0"
            value={form.monthly_mortgage_uf}
            onChange={(e) => setForm({ ...form, monthly_mortgage_uf: e.target.value })}
            placeholder="11.5"
            className={filled(form.monthly_mortgage_uf.trim() !== '')}
          />
          {(Number(form.monthly_mortgage_uf) || 0) > 0 && (
            <UFWithCLP amount={Number(form.monthly_mortgage_uf)} valueClassName="text-xs text-muted-foreground" />
          )}
        </FormField>
      </div>
      <FormField label={t('finance.mortgage.commercialValue') + ' (UF)'}>
        <Input
          type="number"
          step="any"
          min="0"
          value={form.commercial_value_uf}
          onChange={(e) => setForm({ ...form, commercial_value_uf: e.target.value })}
          placeholder="3200"
          className={filled(form.commercial_value_uf.trim() !== '')}
        />
        {(Number(form.commercial_value_uf) || 0) > 0 && (
          <UFWithCLP amount={Number(form.commercial_value_uf)} valueClassName="text-xs text-muted-foreground" />
        )}
      </FormField>
      <FormField label={t('finance.mortgage.paymentStart')}>
        <Input
          type="date"
          value={form.payment_start_date}
          onChange={(e) => setForm({ ...form, payment_start_date: e.target.value })}
          className={filled(form.payment_start_date.trim() !== '')}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label={t('finance.mortgage.termYears')}>
          <Input
            type="number"
            step="1"
            min="0"
            value={form.loan_term_years}
            onChange={(e) => setForm({ ...form, loan_term_years: e.target.value })}
            placeholder="30"
            className={filled(form.loan_term_years.trim() !== '')}
          />
        </FormField>
        <FormField label={t('finance.mortgage.installmentsPaid')}>
          <Input
            type="number"
            step="1"
            min="0"
            value={form.installments_paid}
            onChange={(e) => setForm({ ...form, installments_paid: e.target.value })}
            placeholder="24"
            className={filled(form.installments_paid.trim() !== '')}
          />
        </FormField>
        <FormField label={t('finance.mortgage.interestRate')}>
          <Input
            type="number"
            step="any"
            min="0"
            value={form.interest_rate}
            onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
            placeholder="4.5"
            className={filled(form.interest_rate.trim() !== '')}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('dividends.creditInstitution')}>
          <Input
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            placeholder="Banco de Chile"
            className={filled(form.bank_name.trim() !== '')}
          />
        </FormField>
        <FormField label={t('finance.mortgage.creditNumber')}>
          <Input
            value={form.credit_number}
            onChange={(e) => setForm({ ...form, credit_number: e.target.value })}
            placeholder="1234567890"
            className={filled(form.credit_number.trim() !== '')}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('dividends.paymentBank')}>
          <PaymentBankSelect
            value={form.payment_bank}
            onChange={(payment_bank) => setForm({ ...form, payment_bank })}
            options={bankOptions}
            placeholder={t('dividends.paymentBankCustomPlaceholder')}
          />
        </FormField>
        <FormField label={t('dividends.pac')}>
          <label
            className={cn(
              'flex items-center gap-2 h-10 text-sm',
              form.pac_enabled && 'text-emerald-600 dark:text-emerald-300',
            )}
          >
            <input
              type="checkbox"
              checked={form.pac_enabled}
              onChange={(e) => setForm({ ...form, pac_enabled: e.target.checked })}
            />
            {t('finance.mortgage.pacHint')}
          </label>
        </FormField>
      </div>
      <UFIndicatorNote help={t('finance.mortgage.ufHelp')} />
    </>
  )
}

function MortgageRowActions({
  mortgage,
  onEdit,
  onDelete,
}: {
  mortgage: Mortgage
  onEdit: (m: Mortgage) => void
  onDelete: (m: Mortgage) => void
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(mortgage)} aria-label="Editar">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(mortgage)} aria-label="Eliminar">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

export function FinancePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [profitView, setProfitView] = useViewMode('finance-profitability', 'tabla')
  const [mortgageView, setMortgageView] = useViewMode('finance-mortgages', 'tabla')
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Mortgage | null>(null)
  const [form, setForm] = useState(emptyMortgageForm)

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  })
  const { data: mortgages } = useQuery({
    queryKey: ['mortgages'],
    queryFn: () => api.getMortgages(1, 500),
  })
  const { data: properties, isLoading: propertiesLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties({ limit: 500 }),
  })
  const { data: crmBanks } = useQuery({
    queryKey: ['crm', 'banks'],
    queryFn: () => api.getContacts(1, 'bank', 500),
  })

  const bankOptions = useMemo(
    () => buildBankOptions({ crmBanks: crmBanks?.data ?? [] }),
    [crmBanks?.data],
  )

  // Fuente de verdad: créditos registrados en propiedades. El endpoint /mortgages
  // aporta equivalentes en CLP / valor presente cuando está disponible.
  const mortgageList = useMemo(() => {
    const fromProps = (properties?.data ?? [])
      .filter((p) => hasMortgageCredit(p.financials))
      .map(propertyToMortgage)
      .sort((a, b) => a.property_name.localeCompare(b.property_name, 'es'))
    if (!fromProps.length) {
      return (mortgages?.data ?? []).slice().sort((a, b) =>
        a.property_name.localeCompare(b.property_name, 'es'),
      )
    }
    const byId = new Map((mortgages?.data ?? []).map((m) => [m.property_id, m]))
    return fromProps.map((m) => {
      const enriched = byId.get(m.property_id)
      if (!enriched) return m
      return {
        ...m,
        present_value: enriched.present_value || m.present_value,
        loan_amount: enriched.loan_amount ?? m.loan_amount,
        monthly_payment: enriched.monthly_payment ?? m.monthly_payment,
        commercial_value: enriched.commercial_value ?? m.commercial_value,
      }
    })
  }, [properties?.data, mortgages?.data])

  const propertyOptions = useMemo(() => {
    const withCredit = new Set(mortgageList.map((m) => m.property_id))
    return (properties?.data ?? [])
      .filter((p) => !withCredit.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }))
  }, [properties?.data, mortgageList])

  const invalidateMortgageQueries = () => {
    invalidateAfterMutation(qc, 'mortgages', 'properties', 'dividends')
  }

  const createMutation = useMutation({
    mutationFn: (payload: MortgagePayload) => api.createMortgage(payload),
    onSuccess: () => {
      invalidateMortgageQueries()
      setOpen(false)
      setForm(emptyMortgageForm)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<MortgagePayload, 'property_id'> }) =>
      api.updateMortgage(id, payload),
    onSuccess: () => {
      invalidateMortgageQueries()
      setEditOpen(false)
      setEditing(null)
      setForm(emptyMortgageForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMortgage(id),
    onSuccess: () => {
      invalidateMortgageQueries()
      setDeleteOpen(false)
      setEditing(null)
    },
  })

  if ((dashLoading && !dash) || (propertiesLoading && !properties)) return <LoadingSkeleton />

  const cashFlow = [
    { name: 'Ingresos', value: dash?.monthly_income ?? 0 },
    { name: 'Gastos', value: dash?.monthly_expenses ?? 0 },
    { name: 'Neto', value: dash?.net_cash_flow ?? 0 },
  ]

  const profitability = dash?.profitability ?? []

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formToPayload(form))
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const { property_id: _ignored, ...payload } = formToPayload(form)
    updateMutation.mutate({ id: editing.id, payload })
  }

  const openEdit = (m: Mortgage) => {
    setEditing(m)
    setForm(mortgageToForm(m))
    setEditOpen(true)
  }

  const openDelete = (m: Mortgage) => {
    setEditing(m)
    setDeleteOpen(true)
  }

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
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(dash?.monthly_expenses ?? 0)}</p>
            {(dash?.monthly_expenses_uf ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{formatUF(dash?.monthly_expenses_uf ?? 0)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Flujo neto</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(dash?.net_cash_flow ?? 0)}</p></CardContent>
        </Card>
      </div>

      {(dash?.total_monthly_mortgage_uf ?? 0) > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Dividendos hipotecarios</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {dash?.dividend_month ? formatMonthLabel(dash.dividend_month) : 'Mes actual'}
              </p>
            </div>
            <Link to="/dividends" className="text-sm text-primary hover:underline">Ver módulo →</Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total mensual UF</p>
                <UFWithCLP amount={dash?.total_monthly_mortgage_uf ?? 0} valueClassName="text-xl font-bold" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pagado mes</p>
                <UFWithCLP amount={dash?.total_dividend_paid_uf ?? 0} valueClassName="text-xl font-bold text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendiente mes</p>
                <UFWithCLP amount={dash?.total_dividend_pending_uf ?? 0} valueClassName="text-xl font-bold text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          {(dash?.monthly_expenses_uf ?? 0) > 0 && (
            <UFIndicatorNote help="Los gastos en UF se convierten a pesos con la UF del día para el flujo de caja y la rentabilidad." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Rentabilidad por propiedad</CardTitle>
          {profitability.length > 0 && (
            <ViewModeToggle value={profitView} onChange={setProfitView} />
          )}
        </CardHeader>
        <CardContent className={profitView === 'tabla' ? 'p-0' : undefined}>
          {!profitability.length ? (
            <EmptyState message="Sin datos de rentabilidad aún." />
          ) : profitView === 'tarjetas' ? (
            <DataCardGrid>
              {profitability.map((p) => (
                <Card key={p.property_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{p.property_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>Ingresos: <span className="text-foreground">{formatCurrency(p.income)}</span></p>
                    <p>Gastos: <span className="text-foreground">{formatCurrency(p.expenses)}</span></p>
                    <p>Utilidad: <span className="text-foreground font-medium">{formatCurrency(p.profit)}</span></p>
                    <p>ROI: <span className="text-foreground">{p.roi.toFixed(1)}%</span></p>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : profitView === 'lista' ? (
            <DataListShell>
              {profitability.map((p) => (
                <DataListItem key={p.property_id} className="justify-between">
                  <div>
                    <p className="font-medium">{p.property_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ingresos {formatCurrency(p.income)} · Gastos {formatCurrency(p.expenses)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-medium">{formatCurrency(p.profit)}</p>
                    <p className="text-xs text-muted-foreground">{p.roi.toFixed(1)}% ROI</p>
                  </div>
                </DataListItem>
              ))}
            </DataListShell>
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
                {profitability.map((p) => (
                  <tr key={p.property_id} className="border-b">
                    <td className="p-4">{p.property_name}</td>
                    <td className="p-4">{formatCurrency(p.income)}</td>
                    <td className="p-4">
                      <div>{formatCurrency(p.expenses)}</div>
                      {(p.expenses_uf ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">{formatUF(p.expenses_uf ?? 0)}</p>
                      )}
                    </td>
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t('finance.mortgage.title')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t('finance.mortgage.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mortgageList.length > 0 && (
              <ViewModeToggle value={mortgageView} onChange={setMortgageView} />
            )}
            <Button size="sm" onClick={() => { setForm(emptyMortgageForm); setOpen(true) }}>
              <Plus className="h-4 w-4 mr-1" />
              {t('finance.mortgage.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className={mortgageView === 'tabla' ? 'p-0' : undefined}>
          {!mortgageList.length ? (
            <div className="p-8 text-center space-y-2">
              <EmptyState message={t('finance.mortgage.empty')} />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Los créditos se toman de las fichas de propiedad. Completa dividendo, deuda o institución en{' '}
                <Link to="/properties" className="underline underline-offset-2 font-medium">
                  Propiedades
                </Link>
                , o usa «Agregar crédito» aquí.
              </p>
            </div>
          ) : mortgageView === 'tarjetas' ? (
            <DataCardGrid>
              {mortgageList.map((m) => (
                <Card key={m.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{m.property_name}</CardTitle>
                      {m.bank_name && (
                        <p className="text-xs text-muted-foreground mt-1">{m.bank_name}</p>
                      )}
                    </div>
                    <MortgageRowActions mortgage={m} onEdit={openEdit} onDelete={openDelete} />
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {(m.monthly_mortgage_uf ?? 0) > 0 && (
                      <div>
                        <p>{t('finance.mortgage.monthly')}</p>
                        <UFWithCLP amount={m.monthly_mortgage_uf!} valueClassName="text-foreground font-medium" />
                      </div>
                    )}
                    {(m.debt_uf ?? 0) > 0 && (
                      <div>
                        <p>{t('finance.mortgage.debt')}</p>
                        <UFWithCLP amount={m.debt_uf!} valueClassName="text-foreground font-medium" />
                      </div>
                    )}
                    {(m.commercial_value_uf ?? 0) > 0 && (
                      <div>
                        <p>{t('finance.mortgage.commercialValue')}</p>
                        <UFWithCLP amount={m.commercial_value_uf!} valueClassName="text-foreground font-medium" />
                      </div>
                    )}
                    {(m.interest_rate ?? 0) > 0 && (
                      <p>{t('finance.mortgage.interestRate')}: <span className="text-foreground">{m.interest_rate}%</span></p>
                    )}
                    <p>{t('finance.mortgage.presentValue')}: <span className="text-foreground font-medium">{formatCurrency(m.present_value)}</span></p>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : mortgageView === 'lista' ? (
            <DataListShell>
              {mortgageList.map((m) => (
                <DataListItem key={m.id} className="justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.property_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.bank_name || '—'}
                      {(m.monthly_mortgage_uf ?? 0) > 0 && ` · ${formatUF(m.monthly_mortgage_uf!)}`}
                      {(m.commercial_value_uf ?? 0) > 0 && ` · ${formatUF(m.commercial_value_uf!)}`}
                      {(m.interest_rate ?? 0) > 0 && ` · ${m.interest_rate}%`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="font-medium">{formatCurrency(m.present_value)}</p>
                    <MortgageRowActions mortgage={m} onEdit={openEdit} onDelete={openDelete} />
                  </div>
                </DataListItem>
              ))}
            </DataListShell>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-4 text-left">{t('finance.mortgage.property')}</th>
                  <th className="p-4 text-left">{t('dividends.creditInstitution')}</th>
                  <th className="p-4 text-left">{t('finance.mortgage.monthly')}</th>
                  <th className="p-4 text-left">{t('finance.mortgage.debt')}</th>
                  <th className="p-4 text-left">{t('finance.mortgage.commercialValue')}</th>
                  <th className="p-4 text-left">{t('finance.mortgage.interestRate')}</th>
                  <th className="p-4 text-left">{t('finance.mortgage.presentValue')}</th>
                  <th className="p-4 text-right">{t('finance.mortgage.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {mortgageList.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="p-4">{m.property_name}</td>
                    <td className="p-4">{m.bank_name || '—'}</td>
                    <td className="p-4">
                      {(m.monthly_mortgage_uf ?? 0) > 0 ? (
                        <UFWithCLP amount={m.monthly_mortgage_uf!} valueClassName="font-medium" />
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      {(m.debt_uf ?? 0) > 0 ? (
                        <UFWithCLP amount={m.debt_uf!} valueClassName="font-medium" />
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      {(m.commercial_value_uf ?? 0) > 0 ? (
                        <UFWithCLP amount={m.commercial_value_uf!} valueClassName="font-medium" />
                      ) : '—'}
                    </td>
                    <td className="p-4">{(m.interest_rate ?? 0) > 0 ? `${m.interest_rate}%` : '—'}</td>
                    <td className="p-4 font-medium">{formatCurrency(m.present_value)}</td>
                    <td className="p-4">
                      <div className="flex justify-end">
                        <MortgageRowActions mortgage={m} onEdit={openEdit} onDelete={openDelete} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mortgageList.length > 0 && (
            <div className="px-4 pb-4">
              <UFIndicatorNote help={t('finance.mortgage.ufHelp')} />
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('finance.mortgage.add')}
        onSubmit={handleCreate}
        loading={createMutation.isPending}
        submitDisabled={!form.property_id}
      >
        <MortgageFormFields
          form={form}
          setForm={setForm}
          bankOptions={bankOptions}
          propertyOptions={propertyOptions}
          editing={false}
        />
      </FormDialog>

      <FormDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditing(null) }}
        title={t('finance.mortgage.edit')}
        onSubmit={handleUpdate}
        loading={updateMutation.isPending}
      >
        {editing && (
          <p className="text-sm text-muted-foreground -mt-2 mb-2">{editing.property_name}</p>
        )}
        <MortgageFormFields
          form={form}
          setForm={setForm}
          bankOptions={bankOptions}
          propertyOptions={propertyOptions}
          editing
        />
      </FormDialog>

      <PinConfirmDialog
        open={deleteOpen}
        title={t('finance.mortgage.deleteTitle')}
        message={t('finance.mortgage.deleteMessage', { name: editing?.property_name ?? '' })}
        confirmLabel={t('finance.mortgage.deleteConfirm')}
        loading={deleteMutation.isPending}
        onClose={() => { setDeleteOpen(false); setEditing(null) }}
        onConfirm={() => editing && deleteMutation.mutate(editing.id)}
      />
    </div>
  )
}
