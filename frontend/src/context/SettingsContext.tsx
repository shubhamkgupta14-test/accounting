import { createContext, useContext, useEffect, useState } from 'react'
import { api, type AppSettings } from '../lib/api'
import { appName } from '../config/app'
import { useAuth } from './AuthContext'

const fallback: AppSettings = {
  company: { company_name: appName, gstin: '', pan: '', email: '', phone: '', business_type: 'Private Limited', registered_address: '' },
  fiscal: { start: 'April 1', end: 'March 31', financial_year: '2026-27', currency: 'INR', date_format: 'DD/MM/YYYY', voucher_numbering: 'auto' },
  notifications: { pending_vouchers: true, daily_digest: true, low_balance: true, gst_reminders: true, journal_posted: true },
  partners: [],
}

const SettingsContext = createContext({ settings: fallback, loading: true, reload: async () => {}, formatMoney: (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, formatDate: (value: string) => value, currencySymbol: '₹' })

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState(fallback)
  const [loading, setLoading] = useState(true)
  const reload = async () => { if (user) setSettings(await api.settings()) }
  useEffect(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    api.settings().then(setSettings).catch(() => undefined).finally(() => setLoading(false))
  }, [user])
  const formatMoney = (value: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: settings.fiscal.currency || 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
  const currencySymbol = new Intl.NumberFormat('en-IN', { style: 'currency', currency: settings.fiscal.currency || 'INR' }).formatToParts(0).find(part => part.type === 'currency')?.value || settings.fiscal.currency
  const formatDate = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-')
    if (!year || !month || !day) return value
    if (settings.fiscal.date_format === 'MM/DD/YYYY') return `${month}/${day}/${year}`
    if (settings.fiscal.date_format === 'YYYY-MM-DD') return `${year}-${month}-${day}`
    return `${day}/${month}/${year}`
  }
  return <SettingsContext.Provider value={{ settings, loading, reload, formatMoney, formatDate, currencySymbol }}>{children}</SettingsContext.Provider>
}

export const useAppSettings = () => useContext(SettingsContext)
