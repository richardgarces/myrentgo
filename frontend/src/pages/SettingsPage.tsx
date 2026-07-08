import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Building2,
  Check,
  ChevronRight,
  LogOut,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, StatusBadge } from '@/components/ui/page'
import { getConfirmationPin, setConfirmationPin } from '@/lib/confirmation-pin'
import { api } from '@/lib/api'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, canManageUsers } from '@/lib/roles'
import { useAuthStore, useThemeStore } from '@/stores'
import { TeamUsersSection } from '@/components/TeamUsersSection'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { MFASection } from '@/components/MFASection'
import { cn } from '@/lib/utils'
import i18n from '@/i18n'

const APP_VERSION = '1.0.0'

function userInitials(firstName?: string, lastName?: string, email?: string): string {
  const f = firstName?.trim().charAt(0) ?? ''
  const l = lastName?.trim().charAt(0) ?? ''
  if (f || l) return `${f}${l}`.toUpperCase()
  return (email?.charAt(0) ?? '?').toUpperCase()
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const loadUser = useAuthStore((s) => s.loadUser)
  const { theme, setTheme } = useThemeStore()
  const [pin, setPin] = useState('')
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    setPin(getConfirmationPin())
    loadUser()
  }, [loadUser])

  const { data: smtpStatus, isLoading: smtpLoading } = useQuery({
    queryKey: ['smtp-status'],
    queryFn: () => api.getSMTPStatus(),
  })

  const {
    data: apiHealth,
    isFetching: healthFetching,
    isError: healthError,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['api-health'],
    queryFn: () => api.getHealth(),
    staleTime: 60_000,
  })

  const profile = user

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'
  const currentRole = profile?.current_role ?? profile?.organizations?.[0]?.role ?? ''
  const roleLabel = ROLE_LABELS[currentRole] ?? currentRole ?? '—'
  const orgName = profile?.current_org_name || '—'
  const orgId = profile?.current_org_id ?? profile?.organizations?.[0]?.organization_id ?? ''
  const orgCount = profile?.organizations?.length ?? 0
  const mfaEnabled = Boolean(profile?.mfa_enabled)

  const initials = useMemo(
    () => userInitials(profile?.first_name, profile?.last_name, profile?.email),
    [profile?.first_name, profile?.last_name, profile?.email],
  )

  const savePin = () => {
    const trimmed = pin.trim()
    if (trimmed.length < 4) {
      setPinFeedback({ type: 'error', message: 'El PIN debe tener al menos 4 caracteres.' })
      return
    }
    setConfirmationPin(trimmed)
    setPinFeedback({ type: 'success', message: 'PIN guardado correctamente.' })
    setTimeout(() => setPinFeedback(null), 3000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={t('nav.settings')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Perfil
            </CardTitle>
            <CardDescription>Información de tu cuenta en MyRent Go.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={fullName}
                  className="h-16 w-16 rounded-full object-cover border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary border">
                  {initials}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="font-semibold truncate">{fullName}</p>
                <p className="text-sm text-muted-foreground truncate">{profile?.email ?? '—'}</p>
                {currentRole && (
                  <StatusBadge status={currentRole} label={roleLabel} />
                )}
              </div>
            </div>
            <div className="space-y-2 border-t pt-4">
              <SettingRow label="Correo">{profile?.email ?? '—'}</SettingRow>
              <SettingRow label="Rol actual">{roleLabel}</SettingRow>
            </div>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organización
            </CardTitle>
            <CardDescription>Contexto de trabajo y permisos del equipo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <SettingRow label="Nombre">{orgName}</SettingRow>
              {orgId && (
                <SettingRow label="ID">
                  <span className="font-mono text-xs text-muted-foreground break-all">{orgId}</span>
                </SettingRow>
              )}
              <SettingRow label="Organizaciones asociadas">
                {orgCount === 1 ? '1 organización' : `${orgCount} organizaciones`}
              </SettingRow>
            </div>
            {orgCount <= 1 && (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Cada cuenta opera con una organización activa. El cambio entre múltiples empresas estará disponible en una futura actualización.
              </p>
            )}
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Roles del sistema</p>
              <ul className="space-y-2">
                {ROLE_DESCRIPTIONS.map(({ key, label, description }) => (
                  <li key={key} className="text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground"> — {description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <TeamUsersSection currentUserId={profile?.id} currentRole={currentRole} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferencias</CardTitle>
          <CardDescription>Apariencia e idioma de la interfaz.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Apariencia</p>
            <div className="flex flex-wrap gap-2">
              <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>
                <Sun className="h-4 w-4 mr-1.5" /> Claro
              </Button>
              <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>
                <Moon className="h-4 w-4 mr-1.5" /> Oscuro
              </Button>
              <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('system')}>
                <Monitor className="h-4 w-4 mr-1.5" /> Sistema
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Idioma</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={i18n.language === 'es' ? 'default' : 'outline'}
                size="sm"
                onClick={() => i18n.changeLanguage('es')}
              >
                Español
              </Button>
              <Button
                variant={i18n.language === 'en' ? 'default' : 'outline'}
                size="sm"
                onClick={() => i18n.changeLanguage('en')}
              >
                English
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Seguridad
          </CardTitle>
          <CardDescription>Protección de tu cuenta y confirmación de acciones sensibles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MFASection enabled={mfaEnabled} onChanged={() => loadUser()} />

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">PIN de confirmación</p>
            <p className="text-sm text-muted-foreground">
              Se solicita al dar de baja arriendos u otras acciones sensibles. Se guarda solo en este navegador.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1.5">
                <label htmlFor="confirm-pin" className="text-sm font-medium">
                  PIN
                </label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value)
                    setPinFeedback(null)
                  }}
                  className="w-40"
                  autoComplete="off"
                />
              </div>
              <Button size="sm" onClick={savePin}>
                Guardar PIN
              </Button>
            </div>
            {pinFeedback && (
              <p
                className={cn(
                  'text-sm flex items-center gap-1.5',
                  pinFeedback.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive',
                )}
              >
                {pinFeedback.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {pinFeedback.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Correo / SMTP
            </CardTitle>
            <CardDescription>Estado del envío de notificaciones por correo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Servidor SMTP</span>
              {smtpLoading ? (
                <span className="text-sm text-muted-foreground">Comprobando…</span>
              ) : (
                <StatusBadge
                  status={smtpStatus?.configured ? 'sent' : 'pending'}
                  label={smtpStatus?.configured ? 'Configurado' : 'No configurado'}
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {smtpStatus?.configured
                ? 'El servidor de correo está listo para enviar notificaciones automáticas.'
                : 'Configura las variables SMTP en el servidor para habilitar el envío de correos.'}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/email-notifications" className="inline-flex items-center gap-1">
                Ir a notificaciones por correo
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Sistema
            </CardTitle>
            <CardDescription>Información de la aplicación y conectividad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="Versión de la app">{APP_VERSION}</SettingRow>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">Estado de la API</span>
              <div className="flex items-center gap-2">
                {healthFetching ? (
                  <span className="text-sm text-muted-foreground">Comprobando…</span>
                ) : healthError ? (
                  <StatusBadge status="failed" label="No disponible" />
                ) : (
                  <StatusBadge status="sent" label={apiHealth?.status === 'ok' ? 'Conectada' : 'Conectada'} />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => refetchHealth()}
                  disabled={healthFetching}
                  title="Comprobar de nuevo"
                >
                  <RefreshCw className={cn('h-4 w-4', healthFetching && 'animate-spin')} />
                </Button>
              </div>
            </div>
            {apiHealth?.service && (
              <p className="text-xs text-muted-foreground">Servicio: {apiHealth.service}</p>
            )}
            {canManageUsers(currentRole) && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings/system" className="inline-flex items-center gap-1">
                  Monitoreo y logs del sistema
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuenta</CardTitle>
          <CardDescription>Gestión de la sesión actual.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Sesión iniciada como <span className="font-medium text-foreground">{profile?.email ?? '—'}</span>
          </div>
          <Button variant="outline" onClick={logout} className="shrink-0">
            <LogOut className="h-4 w-4 mr-2" />
            {t('auth.logout')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
