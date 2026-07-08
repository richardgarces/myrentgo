import { useMemo, useState } from 'react'
import { AlertCircle, Pencil, Search } from 'lucide-react'
import { DataListItem, DataListShell } from '@/components/DataListViews'
import { ViewModeToggle } from '@/components/ViewModeToggle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Property } from '@/lib/api'
import {
  COMPLETENESS_CATEGORY_LABELS,
  completenessBarColor,
  completenessColor,
  evaluateAllProperties,
  type CompletenessCategory,
  type PropertyCompletenessResult,
} from '@/lib/property-completeness'
import { useViewMode } from '@/hooks/useViewMode'
import { cn } from '@/lib/utils'

const PROPERTY_TYPES = ['apartment', 'parking', 'warehouse', 'house', 'office', 'land'] as const

const typeLabels: Record<string, string> = {
  house: 'Casa',
  apartment: 'Departamento',
  land: 'Terreno',
  warehouse: 'Bodega',
  office: 'Oficina',
  parking: 'Estacionamiento',
}

const CATEGORIES: CompletenessCategory[] = ['general', 'financial', 'insurance', 'services', 'links']

type CompletenessFilters = {
  tipo: string
  category: '' | CompletenessCategory
  maxPercent: number
  q: string
  onlyIncomplete: boolean
}

const defaultFilters: CompletenessFilters = {
  tipo: '',
  category: '',
  maxPercent: 100,
  q: '',
  onlyIncomplete: true,
}

function matchesSearch(property: Property, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    property.name,
    property.owner_name,
    property.address?.street,
    property.address?.commune,
    property.address?.property_rol,
    property.unit_number,
    typeLabels[property.type],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

function CompletenessBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', completenessBarColor(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn('text-sm font-medium tabular-nums w-10 text-right', completenessColor(percent))}>
        {percent}%
      </span>
    </div>
  )
}

function MissingBadges({ result }: { result: PropertyCompletenessResult }) {
  if (result.missing.length === 0) {
    return <span className="text-xs text-green-600 dark:text-green-400">Completa</span>
  }
  const visible = result.missing.slice(0, 4)
  const rest = result.missing.length - visible.length
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((field) => (
        <span
          key={field.id}
          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          title={COMPLETENESS_CATEGORY_LABELS[field.category]}
        >
          {field.label}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          +{rest} más
        </span>
      )}
    </div>
  )
}

function CompletenessRow({
  result,
  onEdit,
}: {
  result: PropertyCompletenessResult
  onEdit: (property: Property) => void
}) {
  const { property, percent } = result
  return (
    <DataListItem onClick={() => onEdit(property)} className="items-start sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium truncate">{property.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {typeLabels[property.type] ?? property.type}
          </span>
        </div>
        <MissingBadges result={result} />
      </div>
      <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
        <CompletenessBar percent={percent} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(property)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          Completar
        </Button>
      </div>
    </DataListItem>
  )
}

export function PropertyCompletenessView({
  properties,
  onEdit,
}: {
  properties: Property[]
  onEdit: (property: Property) => void
}) {
  const [filters, setFilters] = useState<CompletenessFilters>(defaultFilters)
  const [viewMode, setViewMode] = useViewMode('properties-completeness', 'lista')

  const allResults = useMemo(
    () => evaluateAllProperties(properties),
    [properties],
  )

  const filteredResults = useMemo(() => {
    return allResults
      .filter((result) => {
        if (filters.tipo && result.property.type !== filters.tipo) return false
        if (filters.onlyIncomplete && result.percent === 100) return false
        if (result.percent > filters.maxPercent) return false
        if (filters.category && !(result.missingByCategory[filters.category]?.length)) return false
        if (!matchesSearch(result.property, filters.q)) return false
        return true
      })
      .sort((a, b) => a.percent - b.percent || a.property.name.localeCompare(b.property.name, 'es'))
  }, [allResults, filters])

  const summary = useMemo(() => {
    const incomplete = allResults.filter((r) => r.percent < 100)
    const avg = allResults.length
      ? Math.round(allResults.reduce((sum, r) => sum + r.percent, 0) / allResults.length)
      : 100
    const byCategory: Partial<Record<CompletenessCategory, number>> = {}
    for (const result of incomplete) {
      for (const field of result.missing) {
        byCategory[field.category] = (byCategory[field.category] ?? 0) + 1
      }
    }
    return { total: allResults.length, incomplete: incomplete.length, avg, byCategory }
  }, [allResults])

  const updateFilter = <K extends keyof CompletenessFilters>(key: K, value: CompletenessFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Con datos faltantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.incomplete}</p>
            <p className="text-xs text-muted-foreground">de {summary.total} propiedades</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completitud promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold', completenessColor(summary.avg))}>{summary.avg}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campos pendientes por categoría</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const count = summary.byCategory[cat] ?? 0
              if (count === 0) return null
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => updateFilter('category', filters.category === cat ? '' : cat)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    filters.category === cat
                      ? 'border-primary bg-primary/15'
                      : 'bg-muted/50 hover:bg-muted',
                  )}
                >
                  {COMPLETENESS_CATEGORY_LABELS[cat]}
                  <span className="font-medium">{count}</span>
                </button>
              )
            })}
            {Object.keys(summary.byCategory).length === 0 && (
              <span className="text-xs text-muted-foreground">Sin pendientes</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Filtros de completitud
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormSelect value={filters.tipo} onChange={(e) => updateFilter('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>{typeLabels[type] ?? type}</option>
            ))}
          </FormSelect>
          <FormSelect
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value as CompletenessFilters['category'])}
          >
            <option value="">Categoría: todas</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{COMPLETENESS_CATEGORY_LABELS[cat]}</option>
            ))}
          </FormSelect>
          <FormSelect
            value={String(filters.maxPercent)}
            onChange={(e) => updateFilter('maxPercent', Number(e.target.value))}
          >
            <option value="100">Completitud: todas</option>
            <option value="90">Menos del 90%</option>
            <option value="75">Menos del 75%</option>
            <option value="50">Menos del 50%</option>
            <option value="25">Menos del 25%</option>
          </FormSelect>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => updateFilter('q', e.target.value)}
              placeholder="Buscar propiedad…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input
              type="checkbox"
              checked={filters.onlyIncomplete}
              onChange={(e) => updateFilter('onlyIncomplete', e.target.checked)}
              className="rounded border-input"
            />
            Solo propiedades con datos faltantes
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <ViewModeToggle value={viewMode} onChange={setViewMode} modes={['lista', 'tabla']} />
          </div>
        </CardContent>
      </Card>

      {filteredResults.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {summary.incomplete === 0
            ? 'Todas las propiedades tienen los datos importantes completos.'
            : 'Ninguna propiedad coincide con los filtros de completitud.'}
        </p>
      ) : viewMode === 'tabla' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Propiedad</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Completitud</th>
                    <th className="p-4 font-medium">Datos faltantes</th>
                    <th className="p-4 font-medium w-28" />
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => (
                    <tr
                      key={result.property.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                      onClick={() => onEdit(result.property)}
                    >
                      <td className="p-4 font-medium">{result.property.name}</td>
                      <td className="p-4 text-muted-foreground">
                        {typeLabels[result.property.type] ?? result.property.type}
                      </td>
                      <td className="p-4">
                        <CompletenessBar percent={result.percent} />
                      </td>
                      <td className="p-4 max-w-md">
                        <MissingBadges result={result} />
                      </td>
                      <td className="p-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(result.property)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Completar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DataListShell>
          {filteredResults.map((result) => (
            <CompletenessRow key={result.property.id} result={result} onEdit={onEdit} />
          ))}
        </DataListShell>
      )}
    </div>
  )
}
