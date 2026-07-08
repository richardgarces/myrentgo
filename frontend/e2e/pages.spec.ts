import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('properties page loads', async ({ page }) => {
    await page.goto('/properties')
    await expect(page.getByRole('heading', { name: 'Propiedades', level: 1 })).toBeVisible({ timeout: 15_000 })
  })

  test('documents page loads', async ({ page }) => {
    await page.goto('/documents')
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible({ timeout: 15_000 })
  })

  test('settings shows team users section for admin', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Usuarios del equipo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nuevo usuario' })).toBeVisible()
  })
})
