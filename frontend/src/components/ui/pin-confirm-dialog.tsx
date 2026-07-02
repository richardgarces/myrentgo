import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { validateConfirmationPin } from '@/lib/confirmation-pin'

export function PinConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  useEffect(() => {
    if (!open) {
      setPin('')
      setPinError('')
    }
  }, [open])

  const handleClose = () => {
    setPin('')
    setPinError('')
    onClose()
  }

  const handleConfirm = () => {
    if (!validateConfirmationPin(pin)) {
      setPinError('PIN incorrecto')
      return
    }
    setPinError('')
    onConfirm()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <FormField label="Ingresa PIN de confirmación">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError('') }}
            placeholder="••••"
          />
        </FormField>
        {pinError && <p className="text-sm text-destructive mt-2">{pinError}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Cancelar</Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={loading || !pin}>
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
