const typeLabels: Record<string, string> = {
  payment_due: 'Recordatorio de pago',
  payment_overdue: 'Pago vencido',
  late_interest: 'Multas por mora',
  dividend_due: 'Dividendo por vencer',
  lease_expiring: 'Arriendo por vencer',
  maintenance_due: 'Recordatorio de mantención',
}

const noRecipientsPattern = /no enabled recipients for type (\w+)/i
const noRecipientsMaintenancePattern = /no enabled recipients for type maintenance_due/i

function labelForType(typeId: string): string {
  return typeLabels[typeId] ?? typeId
}

function noRecipientsMessage(typeId: string): string {
  return `No hay destinatarios habilitados para «${labelForType(typeId)}». Configúralos en la pestaña Destinatarios.`
}

export function isNoRecipientsError(message?: string): boolean {
  if (!message?.trim()) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('no enabled recipients') ||
    lower.includes('no hay destinatarios habilitados') ||
    lower.includes('no hay destinatarios para «') ||
    lower.includes('no hay destinatarios internos')
  )
}

export function formatNotificationError(message?: string): string | undefined {
  if (!message?.trim()) return undefined

  if (message.includes('No hay destinatarios habilitados')) return message
  if (message.includes('No hay destinatarios para «')) return message
  if (message.includes('El arrendatario no tiene correo configurado')) return message

  const match = message.match(noRecipientsPattern)
  if (match) return noRecipientsMessage(match[1])

  if (noRecipientsMaintenancePattern.test(message)) {
    return noRecipientsMessage('maintenance_due')
  }

  if (message.includes('no valid email addresses')) {
    return 'No hay direcciones de correo válidas configuradas para los destinatarios habilitados.'
  }
  if (message.includes('No hay direcciones de correo válidas')) return message

  if (message.toLowerCase().includes('smtp')) {
    return 'Error de configuración SMTP. Revisa las variables SMTP en .env.'
  }

  return message
}

export function formatSchedulerErrors(errors?: string[]): string[] {
  if (!errors?.length) return []
  return errors.map((e) => formatNotificationError(e) ?? e)
}

type NotifyResult = {
  created?: number
  sent?: number
  skipped?: number
  failed?: number
  errors?: string[]
  details?: Array<{ message?: string; action?: string; property_name?: string }>
}

export function formatMaintenanceNotifyFeedback(result?: NotifyResult): {
  message: string
  warning?: string
  variant: 'success' | 'warning' | 'error'
} {
  const sent = result?.sent ?? 0
  const failed = result?.failed ?? 0
  const errors = formatSchedulerErrors(result?.errors)
  const detailErrors = (result?.details ?? [])
    .filter((d) => d.action === 'failed' && d.message)
    .map((d) => formatNotificationError(d.message) ?? d.message!)
  const allErrors = [...errors, ...detailErrors]

  if (failed > 0) {
    const firstError = allErrors[0]
    const summary = sent > 0
      ? `Notificación enviada: ${sent} correo(s), ${failed} fallido(s).`
      : `No se pudo enviar la notificación (${failed} fallido(s)).`
    if (firstError) {
      return {
        message: summary,
        warning: firstError,
        variant: allErrors.some(isNoRecipientsError) ? 'warning' : 'error',
      }
    }
    return { message: summary, variant: 'error' }
  }

  if (sent > 0) {
    return {
      message: `Notificación enviada: ${sent} correo(s).`,
      variant: 'success',
    }
  }

  const skipped = result?.skipped ?? 0
  if (skipped > 0) {
    return {
      message: 'La notificación ya fue registrada anteriormente para esta mantención.',
      variant: 'warning',
    }
  }

  return {
    message: 'Notificación procesada sin envíos.',
    variant: 'warning',
  }
}

export function formatMaintenanceBulkFeedback(result?: NotifyResult): {
  message: string
  warning?: string
  variant: 'success' | 'warning' | 'error'
} {
  const created = result?.created ?? 0
  const sent = result?.sent ?? 0
  const skipped = result?.skipped ?? 0
  const failed = result?.failed ?? 0
  const errors = formatSchedulerErrors(result?.errors)
  const detailErrors = (result?.details ?? [])
    .filter((d) => d.action === 'failed' && d.message)
    .map((d) => formatNotificationError(d.message) ?? d.message!)
  const allErrors = [...errors, ...detailErrors]
  const summary = `Procesadas: ${created} creadas, ${sent} enviadas, ${skipped} omitidas, ${failed} fallidas.`

  if (failed > 0) {
    const firstError = allErrors[0]
    if (firstError) {
      return {
        message: summary,
        warning: firstError,
        variant: allErrors.some(isNoRecipientsError) ? 'warning' : 'error',
      }
    }
    return { message: summary, variant: 'error' }
  }

  return { message: summary, variant: 'success' }
}

export function findFirstNoRecipientsError(errors?: string[]): string | undefined {
  if (!errors?.length) return undefined
  return formatSchedulerErrors(errors).find(isNoRecipientsError)
}

export function schedulerHasNoRecipientsError(result?: {
  errors?: string[]
  details?: Array<{ message?: string }>
}): boolean {
  if (result?.errors?.some(isNoRecipientsError)) return true
  return (result?.details ?? []).some((d) => isNoRecipientsError(d.message))
}
