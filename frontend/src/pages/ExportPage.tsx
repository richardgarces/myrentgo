import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, Download, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page'
import {
  allExportDatasets,
  exportCategoryLabels,
  exportCategoryOrder,
  exportDatasetConfig,
  exportDatasets,
  fetchExportCounts,
  type ExportDataset,
  type ExportFormat,
  type ExportJsonMode,
} from '@/lib/export-utils'
import { useAuthStore } from '@/stores'
import { cn } from '@/lib/utils'

const formats: ExportFormat[] = ['csv', 'json']
const jsonModes: ExportJsonMode[] = ['structured', 'raw']

function datasetsByCategory() {
  return exportCategoryOrder.map((category) => ({
    category,
    label: exportCategoryLabels[category],
    datasets: allExportDatasets.filter((d) => exportDatasetConfig[d].category === category),
  }))
}

export function ExportPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [selected, setSelected] = useState<Set<ExportDataset>>(() => new Set(allExportDatasets))
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [jsonMode, setJsonMode] = useState<ExportJsonMode>('structured')
  const [zipCsv, setZipCsv] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const orgName = (user?.current_org_name as string) || undefined
  const orgId = (user?.current_org_id as string) || undefined

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ['export-counts'],
    queryFn: () => fetchExportCounts(),
    staleTime: 60_000,
  })

  const grouped = useMemo(() => datasetsByCategory(), [])
  const selectedCount = selected.size
  const totalSelectedRecords = useMemo(() => {
    if (!counts) return null
    let sum = 0
    for (const d of selected) {
      const n = counts[d]
      if (typeof n === 'number') sum += n
    }
    return sum
  }, [counts, selected])

  const toggle = (dataset: ExportDataset) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(dataset)) next.delete(dataset)
      else next.add(dataset)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(allExportDatasets))
  const clearAll = () => setSelected(new Set())

  const handleExport = async (asZip?: boolean) => {
    if (selected.size === 0) return
    setExporting(true)
    setError(null)
    try {
      await exportDatasets([...selected], {
        format,
        jsonMode,
        zipCsv: asZip ?? (format === 'csv' && zipCsv && selected.size > 1),
        organizationId: orgId,
        organizationName: orgName,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('export.error'))
    } finally {
      setExporting(false)
    }
  }

  const formatCount = (dataset: ExportDataset) => {
    if (countsLoading) return '…'
    const n = counts?.[dataset]
    if (n == null) return '—'
    return n.toLocaleString('es-CL')
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={t('export.title')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            {t('export.selectDatasets')}
          </CardTitle>
          <CardDescription>{t('export.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(orgName || orgId) && (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium">{t('export.orgContext')}</p>
              <p className="text-muted-foreground">
                {orgName ? `${orgName}` : t('export.orgUnknown')}
                {orgId && <span className="ml-2 text-xs font-mono">({orgId.slice(0, 8)}…)</span>}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('export.format')}</p>
            <div className="flex flex-wrap gap-2">
              {formats.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={format === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormat(option)}
                  disabled={exporting}
                >
                  {option.toUpperCase()}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {format === 'csv' ? t('export.csvHint') : t('export.jsonHint')}
            </p>
          </div>

          {format === 'json' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('export.jsonStructure')}</p>
              <div className="flex flex-wrap gap-2">
                {jsonModes.map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={jsonMode === mode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setJsonMode(mode)}
                    disabled={exporting}
                  >
                    {mode === 'structured' ? t('export.jsonStructured') : t('export.jsonRaw')}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {format === 'csv' && selectedCount > 1 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={zipCsv}
                onChange={(e) => setZipCsv(e.target.checked)}
                disabled={exporting}
              />
              {t('export.zipOption')}
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={exporting}>
              {t('export.selectAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll} disabled={exporting}>
              {t('export.clearAll')}
            </Button>
            {selectedCount > 0 && totalSelectedRecords != null && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t('export.selectedSummary', { collections: selectedCount, records: totalSelectedRecords.toLocaleString('es-CL') })}
              </span>
            )}
          </div>

          <div className="space-y-5">
            {grouped.map(({ category, label, datasets }) => (
              datasets.length > 0 && (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h3>
                  <div className="space-y-2">
                    {datasets.map((dataset) => {
                      const info = exportDatasetConfig[dataset]
                      return (
                        <label
                          key={dataset}
                          className={cn(
                            'flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors',
                            selected.has(dataset) ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                            exporting && 'pointer-events-none opacity-60',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 mt-0.5 rounded border-input accent-primary shrink-0"
                            checked={selected.has(dataset)}
                            onChange={() => toggle(dataset)}
                            disabled={exporting}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{info.label}</span>
                              <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                                {formatCount(dataset)} {t('export.records')}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            ))}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleExport()}
              disabled={exporting || selectedCount === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting
                ? t('export.exporting')
                : format === 'json'
                  ? t('export.downloadJson')
                  : zipCsv && selectedCount > 1
                    ? t('export.downloadZip')
                    : t('export.downloadCsv')}
            </Button>
            {format === 'csv' && selectedCount > 1 && zipCsv && !exporting && (
              <Button variant="outline" onClick={() => handleExport(false)} disabled={exporting || selectedCount === 0}>
                <Archive className="h-4 w-4 mr-2" />
                {t('export.downloadSeparateCsv')}
              </Button>
            )}
          </div>

          {selectedCount > 1 && !exporting && format === 'csv' && !zipCsv && (
            <p className="text-xs text-muted-foreground">{t('export.multipleFilesHint')}</p>
          )}
          {selectedCount > 1 && !exporting && format === 'json' && jsonMode === 'structured' && (
            <p className="text-xs text-muted-foreground">{t('export.multipleJsonHint')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
