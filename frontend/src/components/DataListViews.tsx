import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DataListShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('divide-y rounded-lg border bg-card overflow-hidden', className)}>
      {children}
    </div>
  )
}

export function DataListItem({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/50',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DataCardGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
    </div>
  )
}
