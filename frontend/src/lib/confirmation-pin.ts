const STORAGE_KEY = 'confirmation_pin'

export function getConfirmationPin(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  return import.meta.env.VITE_CONFIRM_PIN || '1234'
}

export function setConfirmationPin(pin: string) {
  if (pin) localStorage.setItem(STORAGE_KEY, pin)
  else localStorage.removeItem(STORAGE_KEY)
}

export function validateConfirmationPin(input: string): boolean {
  return input === getConfirmationPin()
}
