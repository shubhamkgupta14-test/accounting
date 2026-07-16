import { useEffect, useState } from 'react'
import { Save, Building2, User, Lock, Bell, Database, Globe, Users, Trash2 } from 'lucide-react'
import { api, type CompanySettings, type FiscalSettings, type NotificationSettings, type PartnerCapitalSettings } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'
import { useAuth } from '../context/AuthContext'
import { downloadJson, exportRowsAsExcel } from '../lib/export'
import { useAppSettings } from '../context/SettingsContext'
import PasswordInput from '../components/PasswordInput'
import { SettingsSkeleton } from '../components/Loading'

type Tab = 'company' | 'profile' | 'security' | 'notifications' | 'data' | 'fiscal' | 'partners'

const tabs: { id: Tab; label: string; icon: React.ReactNode; roles: Array<'superadmin' | 'admin' | 'user'> }[] = [
  { id: 'company', label: 'Company', icon: <Building2 size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'profile', label: 'Profile', icon: <User size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'security', label: 'Security', icon: <Lock size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'data', label: 'Data & Backup', icon: <Database size={14} />, roles: ['superadmin'] },
  { id: 'partners', label: 'Partner Capital', icon: <Users size={14} />, roles: ['superadmin'] },
  { id: 'fiscal', label: 'Fiscal Year', icon: <Globe size={14} />, roles: ['superadmin', 'admin', 'user'] },
]

const newPartner = (index: number): PartnerCapitalSettings => ({
  partner_name: '',
  account_name: '',
  account_code: `PARTNER-CAP-${String(index + 1).padStart(2, '0')}`,
  share_percentage: index === 0 ? 100 : 0,
  opening_balance: 0,
})

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const { showToast } = useToast()
  const { user, updateProfile } = useAuth()
  const { settings, loading: settingsLoading, reload } = useAppSettings()
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [profile, setProfile] = useState({ first_name: '', last_name: '', email: '', audit_mode: false })
  const [company, setCompany] = useState<CompanySettings>(settings.company)
  const [fiscal, setFiscal] = useState<FiscalSettings>(settings.fiscal)
  const [notifications, setNotifications] = useState<NotificationSettings>(settings.notifications)
  const [partners, setPartners] = useState<PartnerCapitalSettings[]>(settings.partners.length ? settings.partners : [newPartner(0)])
  const [exporting, setExporting] = useState(false)
  const role = user?.role || 'user'
  const canManageGlobalSettings = role === 'superadmin'
  const visibleTabs = tabs.filter(tab => tab.roles.includes(role))

  useEffect(() => {
    if (user) setProfile({ first_name: user.first_name, last_name: user.last_name, email: user.email, audit_mode: Boolean(user.audit_mode) })
  }, [user])
  useEffect(() => { setCompany(settings.company); setFiscal(settings.fiscal); setNotifications(settings.notifications); setPartners(settings.partners.length ? settings.partners : [newPartner(0)]) }, [settings])
  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) setActiveTab(visibleTabs[0]?.id || 'profile')
  }, [activeTab, role])

  const saveCompany = async () => {
    try { await api.updateCompanySettings(company); await reload(); showToast('success', 'Company settings saved to the database.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save company settings.') }
  }
  const saveFiscal = async () => {
    try { await api.updateFiscalSettings(fiscal); await reload(); showToast('success', 'Fiscal settings saved to the database.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save fiscal settings.') }
  }
  const savePartners = async () => {
    const total = partners.reduce((sum, partner) => sum + Number(partner.share_percentage || 0), 0)
    if (partners.length && Math.abs(total - 100) > 0.001) {
      showToast('error', 'Partner profit/loss shares must total 100%.')
      return
    }
    try { await api.updatePartnerSettings(partners); await reload(); showToast('success', 'Partner capital accounts and shares saved.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save partner capital settings.') }
  }
  const exportData = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      const backup = await api.exportDatabase()
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'json') downloadJson(`accounting-backup-${stamp}`, backup)
      else {
        const rows = Object.entries(backup.data).flatMap(([collection, documents]) =>
          documents.map(document => ({ collection, ...document, data: JSON.stringify(document) })))
        exportRowsAsExcel(`accounting-data-${stamp}`, rows)
      }
      showToast('success', `Database ${format.toUpperCase()} export downloaded.`)
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to export data.') }
    finally { setExporting(false) }
  }
  const toggleNotification = async (key: keyof NotificationSettings) => {
    const next = { ...notifications, [key]: !notifications[key] }
    setNotifications(next)
    try { await api.updateNotificationSettings(next); await reload(); showToast('success', 'Notification preference saved.') }
    catch (err) { setNotifications(notifications); showToast('error', err instanceof Error ? err.message : 'Unable to save preference.') }
  }

  if (settingsLoading) return <SettingsSkeleton />

  return (
    <div>
      <div className="page-header">
        <PageIntro id="settings" />
      </div>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Sidebar tabs */}
        <div className="card settings-tabs" style={{ height: 'fit-content', padding: '8px' }}>
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: activeTab === t.id ? '#EFF6FF' : 'transparent',
                color: activeTab === t.id ? '#1D4ED8' : '#475569',
                fontWeight: activeTab === t.id ? 600 : 400,
                fontSize: 13.5, fontFamily: 'Inter, sans-serif',
                marginBottom: 2, transition: 'all 0.12s',
                textAlign: 'left',
              }}
              onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.background = '#F8FAFC' }}
              onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.background = 'transparent' }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div>
          {activeTab === 'company' && (
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Company Information</h2>
              {!canManageGlobalSettings && <div className="badge badge-slate" style={{ marginBottom: 16 }}>View only</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {[
                  { label: 'Company Name', key: 'company_name', type: 'text' },
                  { label: 'GST Number (GSTIN)', key: 'gstin', type: 'text' },
                  { label: 'PAN Number', key: 'pan', type: 'text' },
                  { label: 'Email Address', key: 'email', type: 'email' },
                  { label: 'Phone Number', key: 'phone', type: 'tel' },
                  { label: 'Business Type', key: 'business_type', type: 'select' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="form-label">{f.label}</label>
                    {f.type === 'select' ? (
                      <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={company[f.key as keyof CompanySettings]} onChange={e => setCompany(c => ({ ...c, [f.key]: e.target.value }))}>
                        <option>Private Limited</option>
                        <option>Partnership</option>
                        <option>Sole Proprietorship</option>
                        <option>LLP</option>
                      </select>
                    ) : (
                      <input disabled={!canManageGlobalSettings} className="input" type={f.type} value={company[f.key as keyof CompanySettings]} onChange={e => setCompany(c => ({ ...c, [f.key]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18 }}>
                <label className="form-label">Registered Address</label>
                <textarea disabled={!canManageGlobalSettings} className="input" rows={3} style={{ resize: 'vertical' }}
                  value={company.registered_address} onChange={e => setCompany(c => ({ ...c, registered_address: e.target.value }))} />
              </div>
              {canManageGlobalSettings && <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={saveCompany}><Save size={14} /> Save Changes</button>
              </div>}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Your Profile</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white' }}>{`${profile.first_name[0] || 'F'}${profile.last_name[0] || 'L'}`.toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{profile.first_name} {profile.last_name}</div>
                  <div style={{ color: '#64748B', fontSize: 13 }}>{user?.role || 'user'}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div><label className="form-label required">First Name</label><input className="input" value={profile.first_name} onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} /></div>
                <div><label className="form-label required">Last Name</label><input className="input" value={profile.last_name} onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} /></div>
                <div><label className="form-label required">Email</label><input className="input" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} /></div>
                <div><label className="form-label">Role</label><input className="input" value={user?.role || ''} disabled /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 20, cursor: 'pointer', padding: '14px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
                <input type="checkbox" checked={profile.audit_mode} onChange={e => setProfile(p => ({ ...p, audit_mode: e.target.checked }))} style={{ width: 16, height: 16, marginTop: 2, accentColor: '#2563EB' }} />
                <span>
                  <span style={{ display: 'block', color: '#0F172A', fontSize: 13.5, fontWeight: 600 }}>Audit mode</span>
                  <span style={{ display: 'block', color: '#64748B', fontSize: 12.5, marginTop: 3 }}>Show matching checkboxes in Trial Balance, Trading Account, Profit & Loss, and Balance Sheet.</span>
                </span>
              </label>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={async () => {
                  try {
                    await updateProfile(profile)
                    showToast('success', 'Profile updated successfully.')
                  } catch (err) {
                    showToast('error', err instanceof Error ? err.message : 'Unable to update profile.')
                  }
                }}><Save size={14} /> Save Changes</button>
              </div>
            </div>
          )}

          {activeTab === 'fiscal' && (
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Fiscal Year Settings</h2>
              {!canManageGlobalSettings && <div className="badge badge-slate" style={{ marginBottom: 16 }}>View only</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="form-label">Fiscal Year Start</label>
                  <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={fiscal.start} onChange={e => setFiscal(f => ({ ...f, start: e.target.value }))}>
                    <option>April 1</option><option>January 1</option><option>July 1</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Fiscal Year End</label>
                  <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={fiscal.end} onChange={e => setFiscal(f => ({ ...f, end: e.target.value }))}>
                    <option>March 31</option><option>December 31</option><option>June 30</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Current Financial Year</label>
                  <input disabled={!canManageGlobalSettings} className="input" value={fiscal.financial_year} onChange={e => setFiscal(f => ({ ...f, financial_year: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={fiscal.currency} onChange={e => setFiscal(f => ({ ...f, currency: e.target.value }))}>
                    <option value="INR">INR (₹) — Indian Rupee</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Date Format</label>
                  <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={fiscal.date_format} onChange={e => setFiscal(f => ({ ...f, date_format: e.target.value }))}>
                    <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Voucher Numbering</label>
                  <select disabled={!canManageGlobalSettings} className="select" style={{ width: '100%' }} value={fiscal.voucher_numbering} onChange={e => setFiscal(f => ({ ...f, voucher_numbering: e.target.value }))}>
                    <option value="auto">Auto (JV-001, JV-002…)</option><option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              {canManageGlobalSettings && <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={saveFiscal}><Save size={14} /> Save Changes</button>
              </div>}
            </div>
          )}

          {activeTab === 'partners' && (
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Partner Capital Accounts</h2>
              <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: 13 }}>Closing profit or loss will be allocated to these capital accounts using the configured shares.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
                <button className="btn btn-secondary" disabled={partners.length >= 50} onClick={() => setPartners(rows => [...rows, newPartner(rows.length)])}>
                  Add Partner
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {partners.map((partner, index) => (
                  <div key={index} style={{ padding: 16, border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Partner {index + 1}</div>
                      <button type="button" className="btn btn-ghost" title="Delete partner" aria-label={`Delete partner ${index + 1}`}
                        disabled={partners.length === 1} onClick={() => setPartners(rows => rows.filter((_, rowIndex) => rowIndex !== index))}
                        style={{ padding: 6, color: partners.length === 1 ? '#94A3B8' : '#DC2626' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
                      {([
                        ['Partner Name', 'partner_name', 'text'], ['Capital Account Name', 'account_name', 'text'],
                        ['Account Code', 'account_code', 'text'], ['Share %', 'share_percentage', 'number'],
                        ['Opening Capital', 'opening_balance', 'number'],
                      ] as const).map(([label, key, type]) => (
                        <div key={key}><label className="form-label">{label}</label><input className="input" type={type} min={type === 'number' ? 0 : undefined}
                          value={partner[key]} onChange={event => setPartners(rows => rows.map((row, rowIndex) => rowIndex === index ? {
                            ...row, [key]: type === 'number' ? Number(event.target.value) : event.target.value,
                          } : row))} /></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: Math.abs(partners.reduce((sum, row) => sum + Number(row.share_percentage || 0), 0) - 100) < .001 || !partners.length ? '#15803D' : '#DC2626' }}>
                  Total share: {partners.reduce((sum, row) => sum + Number(row.share_percentage || 0), 0)}%
                </span>
                <button className="btn btn-primary" onClick={() => void savePartners()}><Save size={14} /> Save Partner Accounts</button>
              </div>
            </div>
          )}

          {(activeTab === 'security' || activeTab === 'notifications' || activeTab === 'data') && (
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
                {visibleTabs.find(t => t.id === activeTab)?.label} Settings
              </h2>
              <div style={{ color: '#64748B', fontSize: 13.5 }}>
                {activeTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label className="form-label">Current Password</label>
                      <PasswordInput className="input" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} placeholder="••••••••" />
                    </div>
                    <div>
                      <label className="form-label">New Password</label>
                      <PasswordInput className="input" value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} placeholder="••••••••" />
                    </div>
                    <div>
                      <label className="form-label">Confirm New Password</label>
                      <PasswordInput className="input" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={async () => {
                        if (passwords.next !== passwords.confirm) {
                          showToast('error', 'New password and confirm password do not match.')
                          return
                        }
                        try {
                          await api.changePassword(passwords.current, passwords.next)
                          setPasswords({ current: '', next: '', confirm: '' })
                          showToast('success', 'Password updated successfully.')
                        } catch (err) {
                          showToast('error', err instanceof Error ? err.message : 'Unable to update password.')
                        }
                      }}><Save size={14} /> Update Password</button>
                    </div>
                  </div>
                )}
                {activeTab === 'notifications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {!canManageGlobalSettings && <div className="badge badge-slate" style={{ alignSelf: 'flex-start' }}>View only</div>}
                    {([
                      ['pending_vouchers', 'Email alerts for pending vouchers'], ['daily_digest', 'Daily summary digest'],
                      ['low_balance', 'Low balance alerts'], ['gst_reminders', 'GST filing reminders'],
                      ['journal_posted', 'Journal entry posted notifications'],
                    ] as [keyof NotificationSettings, string][]).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13.5, color: '#0F172A' }}>
                        <input disabled={!canManageGlobalSettings} type="checkbox" checked={notifications[key]} style={{ accentColor: '#2563EB', width: 16, height: 16 }} onChange={() => void toggleNotification(key)} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
                {activeTab === 'data' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: '16px 20px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', marginBottom: 6 }}>Export Data</div>
                      <p style={{ margin: '0 0 12px', color: '#64748B', fontSize: 13 }}>Download all your accounting data as CSV or Excel.</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" disabled={exporting} style={{ fontSize: 13 }} onClick={() => void exportData('csv')}>Export as CSV</button>
                        <button className="btn btn-secondary" disabled={exporting} style={{ fontSize: 13 }} onClick={() => void exportData('json')}>Download Backup (JSON)</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
