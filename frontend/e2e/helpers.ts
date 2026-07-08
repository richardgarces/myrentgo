import { expect, type Page } from '@playwright/test'

const API_BASE = process.env.E2E_API_URL || 'http://localhost:7070'

const adminProfile = {
  id: 'admin-1',
  email: 'admin@myrent.local',
  first_name: 'Admin',
  last_name: 'User',
  active: true,
  mfa_enabled: false,
  current_role: 'owner',
  current_org_id: 'org-1',
  current_org_name: 'Demo Org',
  organizations: [{ organization_id: 'org-1', role: 'owner', name: 'Demo Org' }],
}

const emptyPage = { data: [] as unknown[], total: 0, page: 1, limit: 100 }

export async function isApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function fillLoginForm(page: Page, email = 'admin', password = 'admin123') {
  await page.getByLabel('Correo').fill(email)
  await page.locator('#password').fill(password)
}

export async function setupMockApi(page: Page) {
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'my-rent-go-api' }),
    })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^.*\/api\/v1/, '')
    const method = route.request().method().toUpperCase()

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/auth/login' && method === 'POST') {
      return json({
        access_token: 'e2e-token',
        refresh_token: 'e2e-refresh',
        expires_in: 3600,
      })
    }
    if (path === '/auth/me') return json(adminProfile)
    if (path.startsWith('/properties')) return json(emptyPage)
    if (path.startsWith('/documents')) return json(emptyPage)
    if (path.startsWith('/leases')) return json(emptyPage)
    if (path.startsWith('/tenants')) return json(emptyPage)
    if (path.startsWith('/users')) return json(emptyPage)
    if (path.startsWith('/crm/contacts')) return json(emptyPage)
    if (path === '/email-recipients/smtp-status') return json({ configured: false })
    if (path.startsWith('/email-recipients')) return json(emptyPage)
    if (path.startsWith('/dashboard')) return json({})
    if (path.startsWith('/indicators/uf')) return json({ value: 38000 })

    return route.continue()
  })
}

export async function loginWithMockApi(page: Page) {
  await setupMockApi(page)
  await page.goto('/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

export async function loginAsAdmin(page: Page) {
  if (await isApiAvailable()) {
    await page.goto('/login')
    await fillLoginForm(page)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    return
  }
  await loginWithMockApi(page)
}
