import { cn } from '@/lib/utils'

interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  onSubmit: (e: React.FormEvent) => void
  submitLabel?: string
  loading?: boolean
  submitDisabled?: boolean
  footerStart?: React.ReactNode
  closeOnBackdrop?: boolean
}

export function FormDialog({ open, onClose, title, children, onSubmit, submitLabel = 'Guardar', loading, submitDisabled, footerStart, closeOnBackdrop = false }: FormDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={closeOnBackdrop ? onClose : undefined} aria-hidden />
      <div className={cn('relative w-full max-w-xl rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto')}>
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div>{footerStart}</div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border hover:bg-accent">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || submitDisabled}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Guardando…' : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

export function FormSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    />
  )
}
