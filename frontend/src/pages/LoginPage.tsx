import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLogo } from '@/components/layout/AppLogo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField } from '@/components/ui/form-dialog'
import { PasswordInput } from '@/components/PasswordInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores'

type ForgotStep = 'email' | 'reset'
type LoginStep = 'credentials' | 'mfa'

export function LoginPage() {
  const { t } = useTranslation()
  const login = useAuthStore((s) => s.login)
  const completeMfaLogin = useAuthStore((s) => s.completeMfaLogin)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginStep, setLoginStep] = useState<LoginStep>('credentials')
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotPin, setForgotPin] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const resetForgotForm = () => {
    setForgotStep('email')
    setForgotEmail('')
    setForgotPin('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
    setForgotError('')
    setForgotSuccess('')
  }

  const openForgot = () => {
    resetForgotForm()
    setForgotEmail(email.includes('@') ? email : '')
    setForgotOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setUnverifiedEmail(null)
    setResendMessage('')
    try {
      const result = await login(email, password)
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken)
        setMfaCode('')
        setLoginStep('mfa')
        return
      }
      window.location.href = '/'
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email.includes('@') ? email : `${email}@myrent.local`)
        setError(t('auth.emailNotVerified'))
      } else {
        setError(err instanceof Error ? err.message : 'Error')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return
    setResendLoading(true)
    setResendMessage('')
    try {
      const res = await api.resendVerification(unverifiedEmail)
      setResendMessage(res.message)
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : t('auth.resendVerificationError'))
    } finally {
      setResendLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await completeMfaLogin(mfaToken, mfaCode.trim())
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mfa.verifyError'))
    } finally {
      setLoading(false)
    }
  }

  const backToCredentials = () => {
    setLoginStep('credentials')
    setMfaToken('')
    setMfaCode('')
    setError('')
  }

  const handleForgotEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    setForgotError('')
    setForgotSuccess('')
    try {
      const res = await api.forgotPassword(forgotEmail.trim())
      setForgotSuccess(res.message)
      setForgotStep('reset')
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : t('auth.forgotError'))
    } finally {
      setForgotLoading(false)
    }
  }

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError(t('auth.passwordMismatch'))
      return
    }
    setForgotLoading(true)
    setForgotError('')
    try {
      const res = await api.resetPassword({
        email: forgotEmail.trim(),
        pin: forgotPin.trim(),
        new_password: forgotNewPassword,
      })
      setForgotSuccess(res.message)
      setTimeout(() => {
        setForgotOpen(false)
        resetForgotForm()
      }, 2000)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : t('auth.resetError'))
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <AppLogo size="lg" />
          </div>
          <CardTitle className="text-2xl">MyRent Go</CardTitle>
          <CardDescription>
            {loginStep === 'mfa' ? t('mfa.loginStepDescription') : t('auth.login')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loginStep === 'credentials' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {unverifiedEmail && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3 space-y-2">
                <p className="text-sm text-amber-900 dark:text-amber-100">{t('auth.emailNotVerifiedHint')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading ? t('auth.saving') : t('auth.resendVerification')}
                </Button>
                {resendMessage && (
                  <p className="text-xs text-muted-foreground">{resendMessage}</p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : t('auth.login')}
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={openForgot}
                className="text-sm text-primary hover:underline"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
          </form>
          ) : (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('mfa.loginInstructions')}</p>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">{t('mfa.verificationCode')}</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                placeholder="000000"
                className="tracking-widest font-mono text-center text-lg"
                autoComplete="one-time-code"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
              {loading ? '...' : t('mfa.verifyLogin')}
            </Button>
            <div className="text-center">
              <button type="button" onClick={backToCredentials} className="text-sm text-primary hover:underline">
                {t('mfa.backToLogin')}
              </button>
            </div>
          </form>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={forgotOpen}
        onClose={() => {
          setForgotOpen(false)
          resetForgotForm()
        }}
        title={forgotStep === 'email' ? t('auth.forgotTitle') : t('auth.resetTitle')}
        onSubmit={forgotStep === 'email' ? handleForgotEmail : handleForgotReset}
        submitLabel={forgotStep === 'email' ? t('auth.sendPin') : t('auth.resetPassword')}
        loading={forgotLoading}
        closeOnBackdrop
      >
        {forgotStep === 'email' ? (
          <>
            <p className="text-sm text-muted-foreground">{t('auth.forgotDescription')}</p>
            <FormField label={t('auth.email')}>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </FormField>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('auth.resetDescription')}</p>
            {forgotSuccess && forgotStep === 'reset' && !forgotError && (
              <p className="text-sm text-green-600 dark:text-green-400">{forgotSuccess}</p>
            )}
            <FormField label={t('auth.email')}>
              <Input type="email" value={forgotEmail} readOnly className="bg-muted" />
            </FormField>
            <FormField label={t('auth.pin')}>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={forgotPin}
                onChange={(e) => setForgotPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                placeholder="000000"
                className="tracking-widest font-mono text-center text-lg"
              />
            </FormField>
            <FormField label={t('auth.newPassword')}>
              <PasswordInput
                value={forgotNewPassword}
                onChange={(e) => setForgotNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label={t('auth.confirmPassword')}>
              <PasswordInput
                value={forgotConfirmPassword}
                onChange={(e) => setForgotConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </FormField>
          </>
        )}
        {forgotError && <p className="text-sm text-destructive">{forgotError}</p>}
        {forgotSuccess && forgotStep === 'email' && (
          <p className="text-sm text-green-600 dark:text-green-400">{forgotSuccess}</p>
        )}
      </FormDialog>
    </div>
  )
}
