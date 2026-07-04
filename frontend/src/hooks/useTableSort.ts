import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export function useTableSort<T, K extends string>(
  items: T[] | undefined,
  defaultKey: K,
  comparators: Record<K, (a: T, b: T) => number>,
  defaultDir: SortDirection = 'asc',
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDirection>(defaultDir)

  const toggleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedItems = useMemo(() => {
    const list = [...(items ?? [])]
    const cmp = comparators[sortKey]
    if (!cmp) return list
    const dir = sortDir === 'asc' ? 1 : -1
    return list.sort((a, b) => cmp(a, b) * dir)
  }, [items, sortKey, sortDir, comparators])

  return { sortedItems, sortKey, sortDir, toggleSort }
}
