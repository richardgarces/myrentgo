import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import { PasswordInput } from '@/components/PasswordInput'

function renderPasswordInput() {
  return render(
    <I18nextProvider i18n={i18n}>
      <PasswordInput aria-label="password" defaultValue="secret" />
    </I18nextProvider>,
  )
}

describe('PasswordInput', () => {
  it('starts hidden and toggles visibility', async () => {
    const user = userEvent.setup()
    renderPasswordInput()

    const input = screen.getByLabelText('password')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /ocultar contraseña/i }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
