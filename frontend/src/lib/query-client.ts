import { QueryClient } from '@tanstack/react-query'
import { applyQueryDefaults, STALE_TIMES } from './query-options'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.default,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
})

applyQueryDefaults(queryClient)
