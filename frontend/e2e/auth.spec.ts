import { test, expect } from '@playwright/test'
import { fillLoginForm, isApiAvailable } from './helpers'

test.describe('Authentication', () => {
  test('login with admin credentials', async ({ page }) => {
    test.skip(!(await isApiAvailable()), 'Requires API on http://localhost:7070 (MongoDB + backend)')

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'MyRent Go' })).toBeVisible()

    await fillLoginForm(page)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    await expect(page).toHaveURL(/\/(dashboard|\/)?$/, { timeout: 15_000 })
    await expect(page.getByText('Propiedades').first()).toBeVisible({ timeout: 15_000 })
  })

  test('forgot password dialog opens', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
    await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enviar PIN' })).toBeVisible()
  })

  test('shows MFA step UI when backend requires MFA', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mfa_required: true, mfa_token: 'test-mfa-token' }),
      })
    })

    await page.goto('/login')
    await fillLoginForm(page)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    await expect(page.getByText('Verificación en dos pasos')).toBeVisible()
    await expect(page.getByLabel('Código de verificación')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Verificar e ingresar' })).toBeDisabled()
  })
})
