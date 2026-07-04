import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const ONE_HOUR = 60 * 60 * 1000

export function useUF() {
  return useQuery({
    queryKey: ['indicators', 'uf'],
    queryFn: () => api.getUF(),
    staleTime: ONE_HOUR,
    retry: 1,
  })
}
