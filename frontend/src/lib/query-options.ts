import type { QueryClient } from '@tanstack/react-query'

/** Background polling intervals (ms). */
export const REFRESH_INTERVALS = {
  listing: 60_000,
  dashboard: 45_000,
} as const

/** staleTime values (ms). */
export const STALE_TIMES = {
  default: 60_000,
  listing: 30_000,
  dashboard: 30_000,
  settings: 5 * 60_000,
  indicators: 60 * 60_000,
} as const

/** Primary entity lists polled on an interval while the tab is focused. */
export const LISTING_QUERY_KEYS = [
  'properties',
  'leases',
  'tenants',
  'payments',
  'dividends',
  'documents',
  'crm',
  'maintenance',
  'tickets',
  'notifications',
  'email-recipients',
  'calendar',
  'reminders',
  'mortgages',
  'team-users',
] as const

const SETTINGS_QUERY_KEYS = [
  'smtp-status',
  'api-health',
  'email-notification-types',
  'email-automation-settings',
  'export-counts',
] as const

const SYSTEM_QUERY_KEYS = ['system-health', 'system-metrics', 'system-logs'] as const

/** Apply per-key React Query defaults (listing poll, dashboard, static settings). */
export function applyQueryDefaults(client: QueryClient) {
  for (const key of LISTING_QUERY_KEYS) {
    client.setQueryDefaults([key], {
      staleTime: STALE_TIMES.listing,
      refetchInterval: REFRESH_INTERVALS.listing,
    })
  }

  client.setQueryDefaults(['dashboard'], {
    staleTime: STALE_TIMES.dashboard,
    refetchInterval: REFRESH_INTERVALS.dashboard,
  })

  for (const key of SETTINGS_QUERY_KEYS) {
    client.setQueryDefaults([key], {
      staleTime: STALE_TIMES.settings,
      refetchInterval: false,
    })
  }

  client.setQueryDefaults(['indicators'], {
    staleTime: STALE_TIMES.indicators,
    refetchInterval: false,
  })

  for (const key of SYSTEM_QUERY_KEYS) {
    client.setQueryDefaults([key], {
      refetchInterval: false,
    })
  }
}

/** Invalidate entity list(s) and dashboard after create/update/delete. */
export function invalidateAfterMutation(qc: QueryClient, ...queryKeys: string[]) {
  for (const key of queryKeys) {
    qc.invalidateQueries({ queryKey: [key] })
  }
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}
