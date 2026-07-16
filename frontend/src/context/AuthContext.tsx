import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, type AuthUser } from '../lib/api'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  canWrite: boolean
  canManageUsers: boolean
  login: (email: string, password: string) => Promise<void>
  updateProfile: (payload: { first_name: string; last_name: string; email: string; audit_mode?: boolean }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    canWrite: user?.role === 'admin' || user?.role === 'superadmin',
    canManageUsers: user?.role === 'superadmin',
    login: async (email, password) => {
      const result = await api.login(email, password)
      setUser(result.user)
    },
    updateProfile: async payload => {
      const result = await api.updateProfile(payload)
      setUser(result)
    },
    logout: async () => {
      await api.logout().catch(() => undefined)
      setUser(null)
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
