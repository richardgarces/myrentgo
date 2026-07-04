import { formatCurrency, formatDate, formatUF } from '@/lib/utils'
import { useUF } from '@/hooks/useUF'
import { MetricHelp } from '@/components/MetricHelp'

type UFWithCLPProps = {
  amount: number
  suffix?: string
  className?: string
  valueClassName?: string
}

export function UFWithCLP({ amount, suffix, className, valueClassName = 'text-2xl font-bold' }: UFWithCLPProps) {
  const { data: uf } = useUF()
  const clp = uf ? amount * uf.value : null

  return (
    <div className={className}>
      <div className={valueClassName}>
        {formatUF(amount)}{suffix ?? ''}
      </div>
      {clp != null && (
        <p className="text-xs text-muted-foreground mt-1">≈ {formatCurrency(clp)}</p>
      )}
    </div>
  )
}

type CLPWithUFProps = {
  amount: number
  className?: string
  valueClassName?: string
}

export function CLPWithUF({ amount, className, valueClassName = 'text-2xl font-bold' }: CLPWithUFProps) {
  const { data: uf } = useUF()
  const ufAmount = uf && uf.value > 0 ? amount / uf.value : null

  return (
    <div className={className}>
      <div className={valueClassName}>
        {formatCurrency(amount)}
      </div>
      {ufAmount != null && (
        <p className="text-xs text-muted-foreground mt-1">≈ {formatUF(ufAmount)}</p>
      )}
    </div>
  )
}

export function UFIndicatorNote({ help }: { help?: string }) {
  const { data: uf } = useUF()
  if (!uf) return null

  return (
    <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1.5">
      <span>
        UF al día ({formatDate(uf.date)}): {formatCurrency(uf.value)}
      </span>
      {help ? <MetricHelp content={help} /> : null}
    </p>
  )
}
