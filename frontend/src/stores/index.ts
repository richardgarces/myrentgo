import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, isMfaLoginResponse, type UserProfile } from '@/lib/api'

interface AuthState {
  token: string | null
  user: UserProfile | null
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; mfaToken?: string }>
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: async (email, password) => {
        const res = await api.login(email, password)
        if (isMfaLoginResponse(res)) {
          return { mfaRequired: true, mfaToken: res.mfa_token }
        }
        api.setToken(res.access_token)
        const user = await api.me()
        set({ token: res.access_token, user } as Pick<AuthState, 'token' | 'user'>)
        return { mfaRequired: false }
      },
      completeMfaLogin: async (mfaToken, code) => {
        const { access_token } = await api.mfaVerify(mfaToken, code)
        api.setToken(access_token)
        const user = await api.me()
        set({ token: access_token, user } as Pick<AuthState, 'token' | 'user'>)
      },
      logout: () => {
        api.setToken(null)
        set({ token: null, user: null })
      },
      loadUser: async () => {
        const token = get().token || api.getToken()
        if (!token) {
          set({ token: null, user: null })
          return
        }
        api.setToken(token)
        try {
          const user = await api.me()
          set({ token, user } as Pick<AuthState, 'token' | 'user'>)
        } catch {
          api.setToken(null)
          set({ token: null, user: null })
        }
      },
    }),
    { name: 'myrent-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
)

interface ThemeState {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
    }),
    { name: 'myrent-theme' }
  )
)

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', isDark)
}
