import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { formatNotificationError, isNoRecipientsError } from '@/lib/notification-errors'

type Props = {
  message: string
  className?: string
}

export function NoRecipientsBanner({ message, className }: Props) {
  const formatted = formatNotificationError(message) ?? message
  const isRecipients = isNoRecipientsError(message)

  return (
    <div
      className={
        className ??
        `rounded-md border px-4 py-3 text-sm ${
          isRecipients
            ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        }`
      }
    >
      <div className="flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>{formatted}</p>
          {isRecipients && (
            <Link
              to="/notifications?tab=destinatarios"
              className="inline-block font-medium underline underline-offset-2 hover:no-underline"
            >
              Ir a Destinatarios →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
