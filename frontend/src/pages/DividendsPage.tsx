import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Landmark, Pencil, Plus } from 'lucide-react'
import { DataCardGrid, DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '@/components/ui/page'
import { PacBadge, PacLegendNote, pacRowClassName } from '@/components/PacBadge'
import { PaymentBankSelect } from '@/components/PaymentBankSelect'
import { SortableTableHead } from '@/components/SortableTableHead'
import { UFIndicatorNote, UFWithCLP } from '@/components/UFWithCLP'
import { useViewMode } from '@/hooks/useViewMode'
import { useTableSort } from '@/hooks/useTableSort'
import { api, type DividendPayment, type Property } from '@/lib/api'
import { buildBankOptions, resolveBankId } from '@/lib/payment-banks'
import { cn, dividendDueDateForMonth, formatDate, formatMonthLabel, formatUF } from '@/lib/utils'

const emptyForm = {
  property_id: '',
  bank_name: '',
  bank_id: '',
  payment_bank: '',
  pac_enabled: false,
  amount: '',
  currency: 'UF',
  due_date: '',
  notes: '',
}

function currentMonthValue(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'UF') return formatUF(amount)
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: currency || 'CLP' }).format(amount)
}

function monthAlreadyGeneratedMessage(month: string): string {
  return `Dividendos de ${formatMonthLabel(month)} ya generados.`
}

type DividendSortKey = 'property' | 'institution' | 'payment_bank' | 'pac' | 'amount' | 'due_date' | 'status'

const DIVIDEND_STATUS_ORDER: Record<string, number> = {
  overdue: 0,
  pending: 1,
  paid: 2,
}

export function DividendsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateMonth, setGenerateMonth] = useState(currentMonthValue)
  const [preview, setPreview] = useState<{ would_create: number; skipped: number; month_already_generated?: boolean } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const filterMonth = searchParams.get('month') || currentMonthValue()
  const filterStatus = searchParams.get('status') || ''
  const filterProperty = searchParams.get('property_id') || ''
  const filterBank = searchParams.get('bank_name') || ''

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dividends', 'stats', filterMonth],
    queryFn: () => api.getDividendStats(filterMonth),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['dividends', filterMonth, filterStatus, filterProperty, filterBank],
    queryFn: () => api.getDividends({
      month: filterMonth,
      status: filterStatus || undefined,
      property_id: filterProperty || undefined,
      bank_name: filterBank || undefined,
      limit: 100,
    }),
  })

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties({ limit: 500 }),
  })
  const { data: crmBanks } = useQuery({
    queryKey: ['crm', 'banks'],
    queryFn: () => api.getContacts(1, 'bank', 500),
  })
  const { data: dividendBanks } = useQuery({
    queryKey: ['dividends', 'banks', filterMonth],
    queryFn: () => api.getDividendBanks(filterMonth),
  })

  const propertyMap = useMemo(
    () => new Map((properties?.data ?? []).map((p) => [p.id, p.name])),
    [properties],
  )

  const dividendComparators = useMemo<Record<DividendSortKey, (a: DividendPayment, b: DividendPayment) => number>>(() => ({
    property: (a, b) => (propertyMap.get(a.property_id ?? '') ?? '').localeCompare(
      propertyMap.get(b.property_id ?? '') ?? '',
      'es',
    ),
    institution: (a, b) => (a.bank_name ?? '').localeCompare(b.bank_name ?? '', 'es'),
    payment_bank: (a, b) => (a.payment_bank || a.bank_name || '').localeCompare(
      b.payment_bank || b.bank_name || '',
      'es',
    ),
    pac: (a, b) => Number(a.pac_enabled ?? false) - Number(b.pac_enabled ?? false),
    amount: (a, b) => a.amount.amount - b.amount.amount,
    due_date: (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    status: (a, b) => {
      const orderA = DIVIDEND_STATUS_ORDER[a.status] ?? 99
      const orderB = DIVIDEND_STATUS_ORDER[b.status] ?? 99
      if (orderA !== orderB) return orderA - orderB
      return a.status.localeCompare(b.status, 'es')
    },
  }), [propertyMap])

  const { sortedItems: sortedDividends, sortKey, sortDir, toggleSort } = useTableSort<DividendPayment, DividendSortKey>(
    data?.data,
    'due_date',
    dividendComparators,
    'asc',
  )

  const mortgageProperties = useMemo(
    () => (properties?.data ?? []).filter((p) => (p.financials?.monthly_mortgage_uf ?? 0) > 0),
    [properties],
  )

  const crmBankList = useMemo(
    () => (crmBanks?.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    [crmBanks],
  )

  const bankOptions = useMemo(
    () => buildBankOptions({
      crmBanks: crmBankList,
      dividendBanks: dividendBanks?.data,
      properties: mortgageProperties,
      statsBanks: stats?.by_bank,
    }),
    [crmBankList, dividendBanks, mortgageProperties, stats],
  )

  const mortgageCount = stats?.mortgage_property_count ?? mortgageProperties.length
  const totalMonthlyMortgageUF = stats?.total_monthly_mortgage_uf
    ?? mortgageProperties.reduce((sum, p) => sum + (p.financials?.monthly_mortgage_uf ?? 0), 0)

  const { data: currentMonthStatus, isLoading: generateStatusLoading } = useQuery({
    queryKey: ['dividends', 'generate-status', filterMonth],
    queryFn: () => api.generatePendingDividends(filterMonth, true),
    enabled: mortgageCount > 0,
    staleTime: 60_000,
  })

  const currentMonthAlreadyGenerated = currentMonthStatus?.month_already_generated === true

  useEffect(() => {
    if (!generateOpen) return
    let cancelled = false
    setPreviewLoading(true)
    api.generatePendingDividends(generateMonth, true)
      .then((result) => {
        if (!cancelled) {
          setPreview({
            would_create: result.would_create ?? 0,
            skipped: result.skipped,
            month_already_generated: result.month_already_generated,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [generateOpen, generateMonth])

  const markPaid = useMutation({
    mutationFn: (id: string) => api.markDividendPaid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dividends'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const generatePending = useMutation({
    mutationFn: () => api.generatePendingDividends(generateMonth, false),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['dividends'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setGenerateOpen(false)
      setPreview(null)
      const created = result.created ?? 0
      const skipped = result.skipped
      window.alert(
        created > 0
          ? `Se registraron ${created} dividendo(s) pendiente(s) para ${formatMonthLabel(result.month)}.${skipped > 0 ? ` ${skipped} propiedad(es) omitida(s).` : ''}`
          : `No se crearon dividendos nuevos. ${skipped > 0 ? `${skipped} propiedad(es) ya tenían dividendo en ${formatMonthLabel(result.month)}.` : 'No hay propiedades con dividendo configurado.'}`,
      )
    },
  })

  const create = useMutation({
    mutationFn: () => api.createDividend({
      property_id: form.property_id,
      bank_id: form.bank_id || undefined,
      bank_name: form.bank_name || undefined,
      payment_bank: form.payment_bank || undefined,
      pac_enabled: form.pac_enabled,
      amount: Number(form.amount),
      currency: form.currency,
      due_date: form.due_date,
      notes: form.notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dividends'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setForm(emptyForm)
      setOpen(false)
    },
  })

  const update = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('missing id')
      return api.updateDividend(editingId, {
        bank_id: form.bank_id || undefined,
        bank_name: form.bank_name || undefined,
        payment_bank: form.payment_bank || undefined,
        pac_enabled: form.pac_enabled,
        amount: Number(form.amount),
        currency: form.currency,
        due_date: form.due_date,
        notes: form.notes.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dividends'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setForm(emptyForm)
      setEditingId(null)
      setEditOpen(false)
    },
  })

  const applyPropertyDefaults = (prop: Property | undefined, propertyId: string) => {
    const bankName = prop?.financials?.bank_name?.trim() ?? ''
    const paymentBank = prop?.financials?.payment_bank?.trim()
      || bankName
    const bankId = resolveBankId(bankName, crmBankList)
    const amountUF = prop?.financials?.monthly_mortgage_uf ?? 0
    setForm({
      ...form,
      property_id: propertyId,
      bank_name: bankName,
      bank_id: bankId,
      payment_bank: paymentBank,
      pac_enabled: prop?.financials?.pac_enabled ?? false,
      amount: amountUF > 0 ? String(amountUF) : '',
      currency: 'UF',
      due_date: prop
        ? dividendDueDateForMonth(currentMonthValue(), prop.financials?.payment_start_date)
        : '',
    })
  }

  const openEdit = (d: DividendPayment) => {
    setEditingId(d.id)
    setForm({
      property_id: d.property_id ?? '',
      bank_name: d.bank_name ?? '',
      bank_id: d.bank_id ?? '',
      payment_bank: d.payment_bank ?? d.bank_name ?? '',
      pac_enabled: d.pac_enabled ?? false,
      amount: String(d.amount.amount),
      currency: d.amount.currency,
      due_date: d.due_date.slice(0, 10),
      notes: d.notes ?? '',
    })
    setEditOpen(true)
  }

  const handlePropertyChange = (propertyId: string) => {
    const prop = mortgageProperties.find((p) => p.id === propertyId)
    applyPropertyDefaults(prop, propertyId)
  }

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const [viewMode, setViewMode] = useViewMode('dividends', 'tabla')

  const dividendActions = (d: DividendPayment) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => openEdit(d)} title="Editar">
        <Pencil className="h-4 w-4" />
      </Button>
      {(d.status === 'pending' || d.status === 'overdue') && (
        <Button size="sm" variant="outline" onClick={() => markPaid.mutate(d.id)}>
          Marcar pagado
        </Button>
      )}
    </div>
  )

  const renderDividendAmount = (d: DividendPayment) => (
    d.amount.currency === 'UF' ? (
      <UFWithCLP amount={d.amount.amount} valueClassName="font-medium" />
    ) : (
      formatAmount(d.amount.amount, d.amount.currency)
    )
  )

  if ((isLoading && !data) || statsLoading) return <LoadingSkeleton />

  const summaryCards = [
    {
      label: t('dividends.totalMonthlyUF'),
      ufAmount: totalMonthlyMortgageUF,
      sub: `${mortgageCount} propiedad(es) con crédito`,
    },
    {
      label: t('dividends.paidMonth'),
      ufAmount: stats?.total_paid_uf ?? 0,
      valueClassName: 'text-2xl font-bold text-emerald-600 dark:text-emerald-400',
      sub: `${stats?.total_paid_count ?? 0} pagado(s)`,
    },
    {
      label: t('dividends.pendingMonth'),
      ufAmount: stats?.total_pending_uf ?? 0,
      valueClassName: 'text-2xl font-bold text-amber-600 dark:text-amber-400',
      sub: `${stats?.total_pending_count ?? 0} pendiente(s)`,
    },
    {
      label: t('dividends.byInstitution'),
      value: String(bankOptions.length),
      sub: 'instituciones activas',
    },
  ]

  const mutationError = create.error || update.error

  const generateDisabledReason = mortgageCount === 0
    ? 'No hay propiedades con crédito hipotecario configurado. Edita una propiedad y completa el dividendo mensual en UF.'
    : currentMonthAlreadyGenerated
      ? monthAlreadyGeneratedMessage(filterMonth)
      : generateStatusLoading
        ? 'Verificando estado del mes…'
        : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.dividends')}
        count={data?.total}
        action={
          <div className="flex flex-wrap gap-2">
            <span title={generateDisabledReason} className="inline-flex">
              <Button
                variant="outline"
                onClick={() => {
                  setGenerateMonth(filterMonth)
                  setPreview(null)
                  setGenerateOpen(true)
                }}
                disabled={mortgageCount === 0 || currentMonthAlreadyGenerated || generateStatusLoading}
              >
                <CalendarDays className="h-4 w-4" /> {t('dividends.generateMonth')}
              </Button>
            </span>
            <Button
              onClick={() => { setForm(emptyForm); setOpen(true) }}
              disabled={mortgageCount === 0}
              title={mortgageCount === 0 ? 'Registra primero el crédito hipotecario en una propiedad.' : undefined}
            >
              <Plus className="h-4 w-4" /> {t('dividends.register')}
            </Button>
          </div>
        }
      />

      {mortgageCount === 0 && (
        <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-100">
            No hay propiedades con crédito hipotecario. En <strong>Propiedades</strong>, edita una ficha y completa
            {' '}<em>Dividendo mensual (UF)</em>, <em>Institución (Banco)</em> y <em>Fecha inicio de pago</em> para habilitar este módulo.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, ufAmount, valueClassName, sub }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {ufAmount != null ? (
                <UFWithCLP amount={ufAmount} valueClassName={valueClassName} />
              ) : (
                <div className="text-2xl font-bold">{value}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <UFIndicatorNote />

      {(stats?.by_bank?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              {t('dividends.byInstitution')} — {formatMonthLabel(filterMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Institución</th>
                    <th className="p-4 font-medium">Propiedades</th>
                    <th className="p-4 font-medium">Pagado (UF)</th>
                    <th className="p-4 font-medium">Pendiente (UF)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats!.by_bank.map((b) => (
                    <tr key={b.bank_name} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-medium">{b.bank_name}</td>
                      <td className="p-4">{b.property_count}</td>
                      <td className="p-4">
                        <UFWithCLP
                          amount={b.paid_uf}
                          valueClassName="text-emerald-600 dark:text-emerald-400 font-medium"
                        />
                      </td>
                      <td className="p-4">
                        <UFWithCLP
                          amount={b.pending_uf}
                          valueClassName="text-amber-600 dark:text-amber-400 font-medium"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dividends.list')}</CardTitle>
          <PacLegendNote className="pt-1" />
          <div className="flex flex-wrap gap-3 pt-2">
            <FormField label="Mes">
              <Input
                type="month"
                value={filterMonth}
                onChange={(e) => updateFilter('month', e.target.value)}
              />
            </FormField>
            <FormField label="Estado">
              <FormSelect value={filterStatus} onChange={(e) => updateFilter('status', e.target.value)}>
                <option value="">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
                <option value="overdue">Vencido</option>
              </FormSelect>
            </FormField>
            <FormField label="Propiedad">
              <FormSelect value={filterProperty} onChange={(e) => updateFilter('property_id', e.target.value)}>
                <option value="">Todas</option>
                {mortgageProperties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Banco">
              <FormSelect value={filterBank} onChange={(e) => updateFilter('bank_name', e.target.value)}>
                <option value="">Todos</option>
                {bankOptions.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </FormSelect>
            </FormField>
            <div className="sm:col-span-2 lg:col-span-4">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </CardHeader>
        <CardContent className={viewMode === 'tabla' ? 'p-0' : undefined}>
          {!data?.data.length ? (
            <EmptyState message={t('dividends.empty')} />
          ) : viewMode === 'tarjetas' ? (
            <DataCardGrid>
              {sortedDividends.map((d: DividendPayment) => (
                <Card
                  key={d.id}
                  className={cn(d.pac_enabled && pacRowClassName)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{propertyMap.get(d.property_id ?? '') ?? '—'}</CardTitle>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{d.bank_name || '—'}</p>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    {d.pac_enabled && <PacBadge showIcon />}
                    <p>Banco pago: {d.payment_bank || d.bank_name || '—'}</p>
                    <div>{renderDividendAmount(d)}</div>
                    <p>Vence: {formatDate(d.due_date)}</p>
                    <div className="pt-2">{dividendActions(d)}</div>
                  </CardContent>
                </Card>
              ))}
            </DataCardGrid>
          ) : viewMode === 'lista' ? (
            <DataListShell>
              {sortedDividends.map((d: DividendPayment) => (
                <DataListItem
                  key={d.id}
                  className={cn('justify-between', d.pac_enabled && pacRowClassName)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium flex items-center gap-2 flex-wrap">
                      {propertyMap.get(d.property_id ?? '') ?? '—'}
                      {d.pac_enabled && <PacBadge showIcon />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.bank_name || '—'}
                      {' · '}
                      {formatDate(d.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {renderDividendAmount(d)}
                    <StatusBadge status={d.status} />
                    {dividendActions(d)}
                  </div>
                </DataListItem>
              ))}
            </DataListShell>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <SortableTableHead label="Propiedad" sortKey="property" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Institución" sortKey="institution" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Banco de pago" sortKey="payment_bank" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="PAC" sortKey="pac" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Monto" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Vencimiento" sortKey="due_date" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Estado" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDividends.map((d: DividendPayment) => (
                    <tr
                      key={d.id}
                      className={cn(
                        'border-b hover:bg-muted/50',
                        d.pac_enabled && pacRowClassName,
                      )}
                    >
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{propertyMap.get(d.property_id ?? '') ?? '—'}</span>
                          {d.pac_enabled && <PacBadge showIcon />}
                        </div>
                      </td>
                      <td className="p-4">{d.bank_name || '—'}</td>
                      <td className="p-4">{d.payment_bank || d.bank_name || '—'}</td>
                      <td className="p-4">
                        {d.pac_enabled ? (
                          <PacBadge showIcon />
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="p-4">{renderDividendAmount(d)}</td>
                      <td className="p-4">{formatDate(d.due_date)}</td>
                      <td className="p-4"><StatusBadge status={d.status} /></td>
                      <td className="p-4">{dividendActions(d)}</td>
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
        onClose={() => setOpen(false)}
        title={t('dividends.register')}
        onSubmit={(e) => { e.preventDefault(); create.mutate() }}
        loading={create.isPending}
      >
        <FormField label="Propiedad">
          <FormSelect
            required
            value={form.property_id}
            onChange={(e) => handlePropertyChange(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {mortgageProperties.length === 0 ? (
              <option value="" disabled>Sin propiedades con crédito hipotecario</option>
            ) : (
              mortgageProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            )}
          </FormSelect>
        </FormField>
        <FormField label="Institución del crédito">
          <FormSelect
            value={form.bank_name}
            onChange={(e) => {
              const name = e.target.value
              setForm({ ...form, bank_name: name, bank_id: resolveBankId(name, crmBankList) })
            }}
          >
            <option value="">—</option>
            {bankOptions.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label={t('dividends.paymentBank')}>
          <PaymentBankSelect
            value={form.payment_bank}
            onChange={(payment_bank) => setForm({ ...form, payment_bank })}
            options={bankOptions}
          />
        </FormField>
        <FormField label="PAC (pago automático)">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.pac_enabled}
              onChange={(e) => setForm({ ...form, pac_enabled: e.target.checked })}
            />
            Dividendo sujeto a PAC
          </label>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto">
            <Input type="number" step="any" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField label="Moneda">
            <FormSelect value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="UF">UF</option>
              <option value="CLP">CLP</option>
            </FormSelect>
          </FormField>
        </div>
        <FormField label="Vencimiento">
          <Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </FormField>
        <FormField label="Notas (opcional)">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Referencia de pago…" />
        </FormField>
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <FormDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditingId(null); setForm(emptyForm) }}
        title="Editar dividendo"
        onSubmit={(e) => { e.preventDefault(); update.mutate() }}
        loading={update.isPending}
      >
        <FormField label="Institución del crédito">
          <FormSelect
            value={form.bank_name}
            onChange={(e) => {
              const name = e.target.value
              setForm({ ...form, bank_name: name, bank_id: resolveBankId(name, crmBankList) })
            }}
          >
            <option value="">—</option>
            {bankOptions.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label={t('dividends.paymentBank')}>
          <PaymentBankSelect
            value={form.payment_bank}
            onChange={(payment_bank) => setForm({ ...form, payment_bank })}
            options={bankOptions}
          />
        </FormField>
        <FormField label="PAC (pago automático)">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.pac_enabled}
              onChange={(e) => setForm({ ...form, pac_enabled: e.target.checked })}
            />
            Dividendo sujeto a PAC
          </label>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto">
            <Input type="number" step="any" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField label="Moneda">
            <FormSelect value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="UF">UF</option>
              <option value="CLP">CLP</option>
            </FormSelect>
          </FormField>
        </div>
        <FormField label="Vencimiento">
          <Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </FormField>
        <FormField label="Notas (opcional)">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Referencia de pago…" />
        </FormField>
        {mutationError && <p className="text-sm text-destructive">{(mutationError as Error).message}</p>}
      </FormDialog>

      <FormDialog
        open={generateOpen}
        onClose={() => { setGenerateOpen(false); setPreview(null) }}
        title={t('dividends.generateMonth')}
        submitLabel="Confirmar"
        loading={generatePending.isPending}
        submitDisabled={previewLoading || preview?.month_already_generated === true || (preview?.would_create ?? 0) === 0}
        onSubmit={(e) => {
          e.preventDefault()
          if (preview?.month_already_generated || (preview?.would_create ?? 0) === 0) return
          generatePending.mutate()
        }}
      >
        <p className="text-sm text-muted-foreground">
          Crea un dividendo hipotecario pendiente por cada propiedad con dividendo mensual configurado, usando institución, banco de pago, PAC y monto en UF de la ficha de la propiedad.
        </p>
        {mortgageCount === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No hay propiedades con crédito hipotecario configurado.
          </p>
        )}
        <FormField label="Mes">
          <Input type="month" required value={generateMonth} onChange={(e) => setGenerateMonth(e.target.value)} />
        </FormField>
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          {previewLoading ? (
            <p className="text-muted-foreground">Calculando…</p>
          ) : preview ? (
            <>
              <p>
                <span className="font-medium">{preview.would_create}</span> dividendo(s) nuevo(s) para{' '}
                <span className="font-medium">{formatMonthLabel(generateMonth)}</span>
              </p>
              {preview.skipped > 0 && (
                <p className="text-muted-foreground">{preview.skipped} propiedad(es) omitida(s).</p>
              )}
              {preview.would_create === 0 && (
                <p className="text-muted-foreground">
                  {preview.month_already_generated
                    ? monthAlreadyGeneratedMessage(generateMonth)
                    : mortgageCount === 0
                      ? 'Configura el dividendo mensual en al menos una propiedad.'
                      : 'No hay dividendos nuevos que generar para este mes.'}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No se pudo obtener la vista previa.</p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
