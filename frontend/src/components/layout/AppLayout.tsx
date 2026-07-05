import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Building2, Calendar, CreditCard, FileText, LayoutDashboard,
  Menu, Moon, Settings, Sun, Users, Wrench, X, Briefcase, Ticket, BarChart3, Bell, Download, Landmark,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore, useThemeStore } from '@/stores'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, key: 'dashboard' },
  { to: '/properties', icon: Building2, key: 'properties' },
  { to: '/leases', icon: FileText, key: 'leases' },
  { to: '/tenants', icon: Users, key: 'tenants' },
  { to: '/payments', icon: CreditCard, key: 'payments' },
  { to: '/dividends', icon: Landmark, key: 'dividends' },
  { to: '/finance', icon: BarChart3, key: 'finance' },
  { to: '/documents', icon: FileText, key: 'documents' },
  { to: '/calendar', icon: Calendar, key: 'calendar' },
  { to: '/crm', icon: Briefcase, key: 'crm' },
  { to: '/maintenance', icon: Wrench, key: 'maintenance' },
  { to: '/tickets', icon: Ticket, key: 'tickets' },
  { to: '/notifications', icon: Bell, key: 'notifications' },
  { to: '/export', icon: Download, key: 'export' },
  { to: '/settings', icon: Settings, key: 'settings' },
]

export function AppLayout() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboard() })
    queryClient.prefetchQuery({ queryKey: ['properties'], queryFn: () => api.getProperties() })
  }, [queryClient])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const Sidebar = () => (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Building2 className="h-6 w-6 mr-2" />
        <span className="font-semibold">{t('app.name')}</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground truncate mb-2">
          {(user?.email as string) || ''}
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          {t('auth.logout')}
        </Button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <p className="text-sm text-muted-foreground hidden sm:block">{t('app.tagline')}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
