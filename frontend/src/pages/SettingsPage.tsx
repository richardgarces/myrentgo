import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getConfirmationPin, setConfirmationPin } from '@/lib/confirmation-pin'
import { useAuthStore, useThemeStore } from '@/stores'
import i18n from '@/i18n'

export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useThemeStore()
  const [pin, setPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)

  useEffect(() => {
    setPin(getConfirmationPin())
  }, [])

  const savePin = () => {
    setConfirmationPin(pin)
    setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('nav.settings')}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Email:</span> {(user?.email as string) || '—'}</p>
          <p><span className="text-muted-foreground">Nombre:</span> {user?.first_name as string} {user?.last_name as string}</p>
          <p><span className="text-muted-foreground">MFA:</span> {user?.mfa_enabled ? 'Activado' : 'Desactivado'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Apariencia</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>
            <Sun className="h-4 w-4 mr-1" /> Claro
          </Button>
          <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>
            <Moon className="h-4 w-4 mr-1" /> Oscuro
          </Button>
          <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('system')}>
            <Monitor className="h-4 w-4 mr-1" /> Sistema
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Idioma</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Button variant={i18n.language === 'es' ? 'default' : 'outline'} size="sm" onClick={() => i18n.changeLanguage('es')}>
            Español
          </Button>
          <Button variant={i18n.language === 'en' ? 'default' : 'outline'} size="sm" onClick={() => i18n.changeLanguage('en')}>
            English
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Seguridad</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">PIN de confirmación para acciones sensibles (dar de baja arriendos).</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">PIN de confirmación</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-40"
              />
            </div>
            <Button size="sm" onClick={savePin}>Guardar PIN</Button>
            {pinSaved && <span className="text-sm text-green-600">Guardado</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Organización</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Multiempresa: cambia de organización desde el selector (próximamente).</p>
          <p className="mt-2">Roles disponibles: owner, admin, manager, accountant, viewer.</p>
        </CardContent>
      </Card>
    </div>
  )
}
