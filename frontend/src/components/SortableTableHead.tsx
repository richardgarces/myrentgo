import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortDirection } from '@/hooks/useTableSort'

type SortableTableHeadProps<K extends string> = {
  label: string
  sortKey: K
  activeKey: K
  direction: SortDirection
  onSort: (key: K) => void
  className?: string
}

export function SortableTableHead<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: SortableTableHeadProps<K>) {
  const active = sortKey === activeKey
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <th className={cn('p-4 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      </button>
    </th>
  )
}
