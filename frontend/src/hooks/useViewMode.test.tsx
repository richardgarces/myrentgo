import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useViewMode } from '@/hooks/useViewMode'

const STORAGE_KEY = 'myrent-view:properties'

function wrapper(initialEntry = '/properties') {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/properties" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default mode when nothing stored', () => {
    const { result } = renderHook(() => useViewMode('properties', 'tabla'), { wrapper: wrapper() })
    expect(result.current[0]).toBe('tabla')
  })

  it('restores mode from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'lista')
    const { result } = renderHook(() => useViewMode('properties', 'tabla'), { wrapper: wrapper() })
    expect(result.current[0]).toBe('lista')
  })

  it('updates state and persists selected mode in localStorage', () => {
    const { result } = renderHook(() => useViewMode('properties', 'tabla'), { wrapper: wrapper() })

    act(() => {
      result.current[1]('tarjetas')
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('tarjetas')
    expect(result.current[0]).toBe('tarjetas')
  })

  it('reads mode from URL when syncUrl is enabled', () => {
    const { result } = renderHook(
      () => useViewMode('properties', 'tabla', { syncUrl: true, urlParam: 'vista' }),
      { wrapper: wrapper('/properties?vista=lista') },
    )
    expect(result.current[0]).toBe('lista')
  })
})
