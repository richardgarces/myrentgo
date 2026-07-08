import type { ReactNode } from 'react'
import { LayoutGrid, List, Table } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VIEW_MODE_LABELS, type ViewMode } from '@/lib/view-mode'
import { cn } from '@/lib/utils'

const MODE_ICONS: Record<ViewMode, typeof List> = {
  lista: List,
  tarjetas: LayoutGrid,
  tabla: Table,
}

type ViewModeToggleProps = {
  value?: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
  showLabel?: boolean
  modes?: ViewMode[]
  extra?: ReactNode
}

export function ViewModeToggle({
  value,
  onChange,
  className,
  showLabel = true,
  modes = ['lista', 'tarjetas', 'tabla'],
  extra,
}: ViewModeToggleProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {showLabel && (
        <span className="text-xs text-muted-foreground shrink-0">Vista:</span>
      )}
      <div className="flex rounded-md border p-0.5 bg-muted/30">
        {modes.map((mode) => {
          const Icon = MODE_ICONS[mode]
          return (
            <Button
              key={mode}
              type="button"
              variant={value === mode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => onChange(mode)}
              title={VIEW_MODE_LABELS[mode]}
              aria-label={VIEW_MODE_LABELS[mode]}
              aria-pressed={value === mode}
            >
              <Icon className="h-4 w-4" />
            </Button>
          )
        })}
      </div>
      {extra}
    </div>
  )
}
