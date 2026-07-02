import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page'
import {
  exportDatasetLabels,
  exportDatasets,
  type ExportDataset,
  type ExportFormat,
} from '@/lib/export-utils'
import { cn } from '@/lib/utils'

const allDatasets: ExportDataset[] = ['properties', 'tenants', 'leases', 'payments']
const formats: ExportFormat[] = ['csv', 'json']

export function ExportPage() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<ExportDataset>>(new Set(allDatasets))
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (dataset: ExportDataset) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(dataset)) next.delete(dataset)
      else next.add(dataset)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(allDatasets))
  const clearAll = () => setSelected(new Set())

  const handleExport = async () => {
    if (selected.size === 0) return
    setExporting(true)
    setError(null)
    try {
      await exportDatasets([...selected], format)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar los datos')
    } finally {
      setExporting(false)
    }
  }

  const downloadLabel = format === 'json' ? t('export.downloadJson') : t('export.downloadCsv')

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title={t('export.title')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            {t('export.selectDatasets')}
          </CardTitle>
          <CardDescription>{t('export.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('export.format')}</p>
            <div className="flex gap-2">
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
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={exporting}>
              {t('export.selectAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll} disabled={exporting}>
              {t('export.clearAll')}
            </Button>
          </div>

          <div className="space-y-2">
            {allDatasets.map((dataset) => (
              <label
                key={dataset}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors',
                  selected.has(dataset) ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  exporting && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={selected.has(dataset)}
                  onChange={() => toggle(dataset)}
                  disabled={exporting}
                />
                <span className="text-sm font-medium">{exportDatasetLabels[dataset]}</span>
              </label>
            ))}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? t('export.exporting') : downloadLabel}
          </Button>

          {selected.size > 1 && !exporting && (
            <p className="text-xs text-muted-foreground">
              {format === 'json' ? t('export.multipleJsonHint') : t('export.multipleFilesHint')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
