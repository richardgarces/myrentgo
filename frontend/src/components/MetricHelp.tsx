import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type MetricHelpProps = {
  content: string
  className?: string
}

export function MetricHelp({ content, className }: MetricHelpProps) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const visible = pinned || hovered

  useEffect(() => {
    if (!pinned) return
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setPinned(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [pinned])

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex shrink-0', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          setPinned((value) => !value)
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Ayuda sobre este indicador"
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
      >
        <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 top-full left-0 mt-1.5 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground shadow-md"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {content}
        </div>
      )}
    </div>
  )
}

type MetricTitleWithHelpProps = {
  title: string
  help: string
  className?: string
}

export function MetricTitleWithHelp({ title, help, className }: MetricTitleWithHelpProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span>{title}</span>
      <MetricHelp content={help} />
    </span>
  )
}
