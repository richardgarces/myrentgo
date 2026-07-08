import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/PasswordInput'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/page'
import { FormField } from '@/components/ui/form-dialog'
import { api } from '@/lib/api'

interface MFASectionProps {
  enabled: boolean
  onChanged: () => void
}

export function MFASection({ enabled, onChanged }: MFASectionProps) {
  const { t } = useTranslation()
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null)
  const [enableCode, setEnableCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetMessages = () => {
    setError('')
    setSuccess('')
  }

  const startSetup = async () => {
    resetMessages()
    setLoading(true)
    try {
      const data = await api.mfaSetup()
      setSetupData(data)
      setEnableCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mfa.setupError'))
    } finally {
      setLoading(false)
    }
  }

  const cancelSetup = () => {
    setSetupData(null)
    setEnableCode('')
    resetMessages()
  }

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      const res = await api.mfaEnable(enableCode.trim())
      setSuccess(res.message)
      setSetupData(null)
      setEnableCode('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mfa.enableError'))
    } finally {
      setLoading(false)
    }
  }

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      const res = await api.mfaDisable({
        password: disablePassword,
        code: disableCode.trim(),
      })
      setSuccess(res.message)
      setDisablePassword('')
      setDisableCode('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mfa.disableError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start gap-3">
        {enabled ? (
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldOff className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{t('mfa.title')}</p>
            <StatusBadge status={enabled ? 'active' : 'pending'} label={enabled ? t('mfa.enabled') : t('mfa.disabled')} />
          </div>
          <p className="text-sm text-muted-foreground">
            {enabled ? t('mfa.enabledDescription') : t('mfa.disabledDescription')}
          </p>
        </div>
      </div>

      {!enabled && !setupData && (
        <Button size="sm" onClick={startSetup} disabled={loading}>
          {loading ? t('mfa.loading') : t('mfa.activate')}
        </Button>
      )}

      {!enabled && setupData && (
        <form onSubmit={confirmEnable} className="space-y-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">{t('mfa.scanInstructions')}</p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="rounded-lg border bg-white p-3 shrink-0">
              <QRCodeSVG value={setupData.otpauth_url} size={160} level="M" />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-medium">{t('mfa.manualSecret')}</p>
              <code className="block text-xs font-mono break-all rounded bg-muted px-2 py-1.5">{setupData.secret}</code>
            </div>
          </div>
          <FormField label={t('mfa.verificationCode')}>
            <Input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={enableCode}
              onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              placeholder="000000"
              className="w-40 tracking-widest font-mono text-center text-lg"
              autoComplete="one-time-code"
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={loading || enableCode.length !== 6}>
              {loading ? t('mfa.loading') : t('mfa.confirmEnable')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelSetup} disabled={loading}>
              {t('mfa.cancel')}
            </Button>
          </div>
        </form>
      )}

      {enabled && (
        <form onSubmit={confirmDisable} className="space-y-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">{t('mfa.disableInstructions')}</p>
          <FormField label={t('auth.password')}>
            <PasswordInput
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </FormField>
          <FormField label={t('mfa.verificationCode')}>
            <Input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              placeholder="000000"
              className="w-40 tracking-widest font-mono text-center text-lg"
              autoComplete="one-time-code"
            />
          </FormField>
          <Button type="submit" variant="destructive" size="sm" disabled={loading || disableCode.length !== 6}>
            {loading ? t('mfa.loading') : t('mfa.deactivate')}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
    </div>
  )
}
