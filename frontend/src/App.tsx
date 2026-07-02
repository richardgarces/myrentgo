import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingSkeleton } from '@/components/ui/page'
import { queryClient } from '@/lib/query-client'
import { setOnUnauthorized } from '@/lib/api'
import { useAuthStore, applyTheme, useThemeStore } from '@/stores'

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const PropertiesPage = lazy(() => import('@/pages/PropertiesPage').then((m) => ({ default: m.PropertiesPage })))
const LeasesPage = lazy(() => import('@/pages/LeasesPage').then((m) => ({ default: m.LeasesPage })))
const TenantsPage = lazy(() => import('@/pages/TenantsPage').then((m) => ({ default: m.TenantsPage })))
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const FinancePage = lazy(() => import('@/pages/FinancePage').then((m) => ({ default: m.FinancePage })))
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const CrmPage = lazy(() => import('@/pages/CrmPage').then((m) => ({ default: m.CrmPage })))
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })))
const TicketsPage = lazy(() => import('@/pages/TicketsPage').then((m) => ({ default: m.TicketsPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ExportPage = lazy(() => import('@/pages/ExportPage').then((m) => ({ default: m.ExportPage })))

function PageLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const loadUser = useAuthStore((s) => s.loadUser)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const validate = () => {
      loadUser().finally(() => {
        if (!cancelled) setReady(true)
      })
    }
    if (useAuthStore.persist.hasHydrated()) {
      validate()
      return () => { cancelled = true }
    }
    const unsub = useAuthStore.persist.onFinishHydration(validate)
    return () => {
      cancelled = true
      unsub()
    }
  }, [loadUser])

  if (!ready) return <LoadingSkeleton />
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    setOnUnauthorized(() => {
      useAuthStore.getState().logout()
      queryClient.clear()
    })
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PageLoader>
                <LoginPage />
              </PageLoader>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PageLoader><DashboardPage /></PageLoader>} />
            <Route path="properties" element={<PageLoader><PropertiesPage /></PageLoader>} />
            <Route path="leases" element={<PageLoader><LeasesPage /></PageLoader>} />
            <Route path="tenants" element={<PageLoader><TenantsPage /></PageLoader>} />
            <Route path="payments" element={<PageLoader><PaymentsPage /></PageLoader>} />
            <Route path="finance" element={<PageLoader><FinancePage /></PageLoader>} />
            <Route path="documents" element={<PageLoader><DocumentsPage /></PageLoader>} />
            <Route path="calendar" element={<PageLoader><CalendarPage /></PageLoader>} />
            <Route path="crm" element={<PageLoader><CrmPage /></PageLoader>} />
            <Route path="maintenance" element={<PageLoader><MaintenancePage /></PageLoader>} />
            <Route path="tickets" element={<PageLoader><TicketsPage /></PageLoader>} />
            <Route path="notifications" element={<PageLoader><NotificationsPage /></PageLoader>} />
            <Route path="export" element={<PageLoader><ExportPage /></PageLoader>} />
            <Route path="settings" element={<PageLoader><SettingsPage /></PageLoader>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
