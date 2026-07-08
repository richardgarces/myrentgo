import { useState } from 'react'
import { Download, Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type Document } from '@/lib/api'
import {
  downloadDocumentFile,
  type DocumentFileRef,
  viewDocument,
} from '@/lib/document-utils'
import { cn } from '@/lib/utils'

type DocumentActionsProps = {
  doc: DocumentFileRef & Pick<Document, 'title'>
  variant?: 'buttons' | 'icons' | 'links'
  className?: string
  stopPropagation?: boolean
}

export function DocumentActions({
  doc,
  variant = 'buttons',
  className,
  stopPropagation = true,
}: DocumentActionsProps) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null)
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)
  const [wordNotice, setWordNotice] = useState(false)

  const wrapClick = (handler: () => void | Promise<void>) => (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation()
    void handler()
  }

  const handleView = async () => {
    if (!doc.file_name && !doc.file_data && !doc.id) return
    setLoading('view')
    setWordNotice(false)
    try {
      const result = await viewDocument(doc)
      if (result.action === 'preview') {
        setPreview({ url: result.url, title: result.title })
      } else if (result.action === 'open') {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else if (result.action === 'word_unavailable') {
        setWordNotice(true)
      }
    } catch {
      // silently ignore — file may be missing
    } finally {
      setLoading(null)
    }
  }

  const handleDownload = async () => {
    if (!doc.file_name && !doc.file_data && !doc.id) return
    setLoading('download')
    try {
      await downloadDocumentFile(doc)
    } finally {
      setLoading(null)
    }
  }

  const hasFile = Boolean(doc.file_name || doc.file_data || doc.id)
  if (!hasFile) return null

  return (
    <>
      <div className={cn('flex items-center gap-1', className)}>
        {variant === 'links' ? (
          <>
            <button
              type="button"
              className="text-xs text-primary hover:underline shrink-0 disabled:opacity-50"
              disabled={loading === 'view'}
              onClick={wrapClick(handleView)}
            >
              {loading === 'view' ? 'Abriendo…' : 'Ver'}
            </button>
            <button
              type="button"
              className="text-xs text-primary hover:underline shrink-0 disabled:opacity-50"
              disabled={loading === 'download'}
              onClick={wrapClick(handleDownload)}
            >
              {loading === 'download' ? 'Descargando…' : 'Descargar'}
            </button>
          </>
        ) : variant === 'icons' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={loading === 'view'}
              onClick={wrapClick(handleView)}
              title="Ver"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={loading === 'download'}
              onClick={wrapClick(handleDownload)}
              title="Descargar"
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 h-8"
              disabled={loading === 'view'}
              onClick={wrapClick(handleView)}
            >
              <Eye className="h-4 w-4" />
              {loading === 'view' ? 'Abriendo…' : 'Ver'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 h-8"
              disabled={loading === 'download'}
              onClick={wrapClick(handleDownload)}
            >
              <Download className="h-4 w-4" />
              {loading === 'download' ? '…' : 'Descargar'}
            </Button>
          </>
        )}
      </div>

      {wordNotice && (
        <p className="text-xs text-muted-foreground mt-1">
          Vista previa no disponible para Word. Usa Descargar para abrir el archivo.
        </p>
      )}

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)} aria-hidden />
          <div className="relative max-h-[90vh] max-w-[90vw] rounded-lg border bg-card shadow-lg overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
              <p className="text-sm font-medium truncate">{preview.title}</p>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPreview(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-2 bg-muted/30">
              <img
                src={preview.url}
                alt={preview.title}
                className="max-h-[calc(90vh-4rem)] max-w-full object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
