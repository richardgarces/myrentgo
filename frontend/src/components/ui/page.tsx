import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const colors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  open: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  terminated: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('text-xs px-2 py-1 rounded-full capitalize', colors[status] || 'bg-muted text-muted-foreground')}>
      {label ?? status}
    </span>
  )
}

export function PageHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {count !== undefined && <p className="text-sm text-muted-foreground mt-1">{count} registros</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingSkeleton() {
  return <div className="animate-pulse h-64 bg-muted rounded-lg" />
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground text-center py-12">{message}</p>
}
