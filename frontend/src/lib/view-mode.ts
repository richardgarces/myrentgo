export type ViewMode = 'lista' | 'tarjetas' | 'tabla'

export const VIEW_MODES: ViewMode[] = ['lista', 'tarjetas', 'tabla']

const VIEW_MODE_SET = new Set<string>(VIEW_MODES)

export function parseViewMode(value: string | null | undefined, fallback: ViewMode): ViewMode {
  if (value && VIEW_MODE_SET.has(value)) return value as ViewMode
  return fallback
}

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  lista: 'Lista',
  tarjetas: 'Tarjetas',
  tabla: 'Tabla',
}
