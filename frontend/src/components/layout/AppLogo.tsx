import { cn } from '@/lib/utils'

type AppLogoProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  name?: string
}

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
}

export function AppLogo({ className, size = 'sm', showText = false, name = 'MyRent Go' }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src="/logo.svg"
        alt={name}
        className={cn('shrink-0', sizes[size])}
      />
      {showText && <span className="font-semibold">{name}</span>}
    </div>
  )
}
