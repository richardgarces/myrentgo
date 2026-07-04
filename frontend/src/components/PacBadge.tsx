import { Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Teal styling — distinct from status badges (green/blue/amber) and dividend row defaults. */
export const pacBadgeClassName =
  'inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200'

export const pacRowClassName =
  'bg-teal-50/70 dark:bg-teal-950/30 border-l-4 border-l-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/45'

export const pacCardAccentClassName =
  'border-teal-300/80 dark:border-teal-800'

export function PacBadge({
  className,
  showIcon = false,
  title = 'Pago automático de cuenta (PAC)',
}: {
  className?: string
  showIcon?: boolean
  title?: string
}) {
  return (
    <span className={cn(pacBadgeClassName, className)} title={title}>
      {showIcon && <Landmark className="h-3 w-3 shrink-0" aria-hidden />}
      PAC
    </span>
  )
}

export function PacLegendNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted-foreground flex flex-wrap items-center gap-2', className)}>
      <PacBadge showIcon />
      <span>Pago automático de cuenta — filas resaltadas en verde azulado.</span>
    </p>
  )
}
