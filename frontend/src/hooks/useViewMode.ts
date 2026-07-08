import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseViewMode, type ViewMode } from '@/lib/view-mode'

const STORAGE_PREFIX = 'myrent-view:'

type UseViewModeOptions = {
  syncUrl?: boolean
  urlParam?: string
}

function readStoredMode(pageKey: string, fallback: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`)
    if (stored) return parseViewMode(stored, fallback)
  } catch {
    // ignore storage errors
  }
  return fallback
}

function resolveInitialMode(
  pageKey: string,
  defaultMode: ViewMode,
  syncUrl: boolean,
  urlParam: string,
  searchParams: URLSearchParams,
): ViewMode {
  if (syncUrl) {
    const fromUrl = searchParams.get(urlParam)
    if (fromUrl) return parseViewMode(fromUrl, defaultMode)
  }
  return readStoredMode(pageKey, defaultMode)
}

export function useViewMode(
  pageKey: string,
  defaultMode: ViewMode = 'tabla',
  options: UseViewModeOptions = {},
) {
  const { syncUrl = false, urlParam = 'vista' } = options
  const [searchParams, setSearchParams] = useSearchParams()

  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    resolveInitialMode(pageKey, defaultMode, syncUrl, urlParam, searchParams),
  )

  useEffect(() => {
    if (!syncUrl) return
    const fromUrl = searchParams.get(urlParam)
    const next = fromUrl ? parseViewMode(fromUrl, defaultMode) : defaultMode
    setViewModeState(next)
  }, [searchParams, urlParam, defaultMode, syncUrl])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, mode)
    } catch {
      // ignore storage errors
    }

    if (syncUrl) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (mode === defaultMode) next.delete(urlParam)
        else next.set(urlParam, mode)
        return next
      }, { replace: true })
    }
  }, [pageKey, defaultMode, syncUrl, urlParam, setSearchParams])

  return [viewMode, setViewMode] as const
}
