import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppLogo } from '@/components/layout/AppLogo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-dialog'
import { PasswordInput } from '@/components/PasswordInput'
import { Input, Label } from '@/components/ui/input'
import { LoadingSkeleton } from '@/components/ui/page'
import { api } from '@/lib/api'

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [valid, setValid] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setLoading(false)
        setValid(false)
        return
      }
      try {
        const res = await api.verifyEmail(token)
        if (!cancelled) {
          setValid(res.valid)
          setEmail(res.email ?? '')
          setFirstName(res.first_name ?? '')
        }
      } catch {
        if (!cancelled) setValid(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.setPasswordFromInvite({ token, new_password: password })
      setSuccess(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verifyEmailError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <AppLogo size="lg" />
          </div>
          <CardTitle className="text-2xl">{t('auth.verifyEmailTitle')}</CardTitle>
          <CardDescription>{t('auth.verifyEmailDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : !token || !valid ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">{t('auth.verifyEmailInvalid')}</p>
              <Button asChild variant="outline">
                <Link to="/login">{t('auth.backToLogin')}</Link>
              </Button>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
              <Button asChild className="w-full">
                <Link to="/login">{t('auth.login')}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {firstName && (
                <p className="text-sm text-muted-foreground">
                  {t('auth.verifyEmailGreeting', { name: firstName })}
                </p>
              )}
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <Input type="email" value={email} readOnly className="bg-muted" />
              </div>
              <FormField label={t('auth.newPassword')}>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                />
              </FormField>
              <FormField label={t('auth.confirmPassword')}>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </FormField>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('auth.saving') : t('auth.verifyAndSetPassword')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
