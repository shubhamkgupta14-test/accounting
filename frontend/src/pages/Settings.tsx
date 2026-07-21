import { useEffect, useState } from 'react'
import { Save, Building2, User, Lock, Bell, Database, Globe, Pencil, Check, X, Plus } from 'lucide-react'
import { api, type ClosingPreviewEntry, type CompanySettings, type FiscalSettings, type NotificationSettings, type PartnerCapitalSettings, type RetirementSettlementRequest } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'
import { useAuth } from '../context/AuthContext'
import { downloadJson, exportRowsAsExcel } from '../lib/export'
import { useAppSettings } from '../context/SettingsContext'
import PasswordInput from '../components/PasswordInput'
import { SettingsSkeleton } from '../components/Loading'
import { useLedgerData } from '../context/DataContext'

type Tab = 'company' | 'profile' | 'security' | 'notifications' | 'data' | 'fiscal' | 'partners'

const tabs: { id: Tab; label: string; icon: React.ReactNode; roles: Array<'superadmin' | 'admin' | 'user'> }[] = [
  { id: 'company', label: 'Company', icon: <Building2 size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'profile', label: 'Profile', icon: <User size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'security', label: 'Security', icon: <Lock size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} />, roles: ['superadmin', 'admin', 'user'] },
  { id: 'data', label: 'Data & Backup', icon: <Database size={14} />, roles: ['superadmin'] },
  { id: 'fiscal', label: 'Fiscal Year', icon: <Globe size={14} />, roles: ['superadmin', 'admin', 'user'] },
]

const newPartner = (index: number, sharePercentage = index === 0 ? 100 : 0): PartnerCapitalSettings => ({
  partner_name: '',
  account_name: '',
  account_code: `PAR-CA-${String(index + 1).padStart(2, '0')}`,
  share_percentage: sharePercentage,
  opening_balance: 0,
  admission_date: new Date().toISOString().slice(0, 10),
  retirement_date: null,
})

export default function Settings({ partnersOnly = false }: { partnersOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>(partnersOnly ? 'partners' : 'profile')
  const { showToast } = useToast()
  const { user, updateProfile } = useAuth()
  const { settings, loading: settingsLoading, reload, formatMoney } = useAppSettings()
  const { accounts, refresh } = useLedgerData()
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [profile, setProfile] = useState({ first_name: '', last_name: '', email: '', audit_mode: false })
  const [company, setCompany] = useState<CompanySettings>(settings.company)
  const [fiscal, setFiscal] = useState<FiscalSettings>(settings.fiscal)
  const [notifications, setNotifications] = useState<NotificationSettings>(settings.notifications)
  const [partners, setPartners] = useState<PartnerCapitalSettings[]>(settings.partners)
  const [exporting, setExporting] = useState(false)
  const [retirementPreview, setRetirementPreview] = useState<{ payload: RetirementSettlementRequest; entries: ClosingPreviewEntry[] } | null>(null)
  const [retirementLoading, setRetirementLoading] = useState(false)
  const [editingRetirement, setEditingRetirement] = useState<string | null>(null)
  const [partnerLifecycleTab, setPartnerLifecycleTab] = useState<'active' | 'retired'>('active')
  const role = user?.role || 'user'
  const canManageGlobalSettings = role === 'superadmin'
  const visibleTabs = partnersOnly ? [] : tabs.filter(tab => tab.roles.includes(role))

  useEffect(() => {
    if (user) setProfile({ first_name: user.first_name, last_name: user.last_name, email: user.email, audit_mode: Boolean(user.audit_mode) })
  }, [user])
  useEffect(() => { setCompany(settings.company); setFiscal(settings.fiscal); setNotifications(settings.notifications); setPartners(settings.partners) }, [settings])
  useEffect(() => {
    if (partnersOnly) {
      if (activeTab !== 'partners') setActiveTab('partners')
    } else if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'profile')
    }
  }, [activeTab, partnersOnly, role])

  const saveCompany = async () => {
    try { await api.updateCompanySettings(company); await reload(); showToast('success', 'Company settings saved to the database.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save company settings.') }
  }
  const saveFiscal = async () => {
    try { await api.updateFiscalSettings(fiscal); await reload(); showToast('success', 'Fiscal settings saved to the database.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save fiscal settings.') }
  }
  const savePartners = async () => {
    const activePartners = partners.filter(partner => !partner.retirement_date)
    const total = activePartners.reduce((sum, partner) => sum + Number(partner.share_percentage || 0), 0)
    if (partners.length > 0 && activePartners.length === 0) {
      showToast('error', 'At least one active partner is required. The last active partner cannot be retired.')
      return
    }
    if (activePartners.length && Math.abs(total - 100) > 0.001) {
      showToast('error', 'Partner profit/loss shares must total 100%.')
      return
    }
    const newlyRetired = partners.filter(partner => partner.retirement_date && !settings.partners.find(saved =>
      saved.account_name === partner.account_name && saved.retirement_date))
    if (newlyRetired.length > 1) {
      showToast('error', 'Please retire and settle one partner at a time.')
      return
    }
    if (newlyRetired.length === 1) {
      const partner = newlyRetired[0]
      const saved = settings.partners.find(row => row.account_name === partner.account_name)
      if (!partner.admission_date || !partner.retirement_date || !saved) {
        showToast('error', 'Save the active partner with an admission date before entering retirement.')
        return
      }
      const payload: RetirementSettlementRequest = {
        partner_name: partner.partner_name, account_name: partner.account_name, account_code: partner.account_code,
        share_percentage: saved.share_percentage, admission_date: partner.admission_date, retirement_date: partner.retirement_date,
        profit_partners: settings.partners.filter(row => !row.retirement_date && (!row.admission_date || row.admission_date <= partner.retirement_date!))
          .map(row => ({ account_name: row.account_name, share_percentage: row.share_percentage })),
      }
      setRetirementLoading(true)
      try {
        const preview = await api.retirementSettlementPreview(payload)
        setRetirementPreview({ payload, entries: preview.entries })
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Unable to calculate retirement settlement.')
      } finally { setRetirementLoading(false) }
      return
    }
    try { await api.updatePartnerSettings(partners); await Promise.all([reload(), refresh()]); showToast('success', 'Partner capital, drawings accounts, and shares saved.') }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to save partner capital settings.') }
  }
  const confirmRetirement = async () => {
    if (!retirementPreview) return
    setRetirementLoading(true)
    try {
      await api.confirmRetirementSettlement(retirementPreview.payload)
      await Promise.all([reload(), refresh()])
      setRetirementPreview(null)
      setPartnerLifecycleTab('retired')
      showToast('success', `Partner retired and ${retirementPreview.payload.partner_name} Loan created.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to complete partner retirement.')
    } finally { setRetirementLoading(false) }
  }
  const updateRetirementDate = async (partner: PartnerCapitalSettings) => {
    setRetirementLoading(true)
    try {
      const result = await api.updatePartnerRetirementDate(partner.account_name, partner.retirement_date)
      await Promise.all([reload(), refresh()])
      setEditingRetirement(null)
      setPartnerLifecycleTab(result.reactivated ? 'active' : 'retired')
      showToast('success', result.reactivated
        ? 'Partner reactivated and retirement settlement reversed.'
        : 'Retirement date and settlement entries recalculated. Reconfirm any pending year-end transfer.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to update retirement date.')
    } finally { setRetirementLoading(false) }
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
  const savedRetiredAccounts = new Set(settings.partners.filter(partner => partner.retirement_date).map(partner => partner.account_name))
  const indexedPartners = partners.map((partner, index) => ({ partner, index }))
  const activePartnerRows = indexedPartners.filter(({ partner }) => !savedRetiredAccounts.has(partner.account_name))
  const retiredPartnerRows = indexedPartners.filter(({ partner }) => savedRetiredAccounts.has(partner.account_name))
  const accountBalance = (name: string) => Number(accounts.find(account => account.name.toLowerCase() === name.toLowerCase())?.balance || 0)

  return (
    <div>
      {retirementPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <section role="dialog" aria-modal="true" aria-label="Confirm partner retirement" className="card" style={{ width: 'min(900px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 24 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>Confirm partner retirement</h3>
            <p style={{ margin: '7px 0 18px', color: '#64748B', fontSize: 13 }}>
              Review the profit/loss allocation, drawings transfer, and final Capital-to-Loan transfer for {retirementPreview.payload.partner_name}. Accounts and amounts are locked.
            </p>
            <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', marginBottom: 16, fontSize: 13 }}>
              <strong>Partner Loan Account to be created</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: 12, marginTop: 9 }}>
                <div><span style={{ color: '#64748B' }}>Account Name</span><div style={{ fontWeight: 600 }}>{retirementPreview.payload.partner_name} Loan</div></div>
                <div><span style={{ color: '#64748B' }}>Type</span><div style={{ fontWeight: 600 }}>Liability</div></div>
                <div><span style={{ color: '#64748B' }}>Group</span><div style={{ fontWeight: 600 }}>Current Liabilities</div></div>
              </div>
            </div>
            {retirementPreview.entries.length === 0 && (
              <div style={{ padding: 14, borderRadius: 8, background: '#F8FAFC', color: '#475569', marginBottom: 16 }}>
                No profit/loss or drawings settlement entry is required for this period.
              </div>
            )}
            {retirementPreview.entries.map(entry => (
              <div key={entry.system_entry_type} style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{ padding: 12, background: '#F8FAFC' }}>
                  <strong>{entry.system_entry_type === 'RETIREMENT_PROFIT_TRANSFER'
                    ? 'Pre-retirement Profit/Loss Distribution'
                    : entry.system_entry_type === 'RETIREMENT_CAPITAL_TO_LOAN'
                      ? 'Retiring Partner Capital to Loan Transfer'
                      : 'Retiring Partner Drawings Transfer'}</strong>
                  <div style={{ marginTop: 4, color: '#64748B', fontSize: 12.5 }}>{entry.narration}</div>
                </div>
                <table className="data-table">
                  <thead><tr><th>Account</th><th className="num dr-heading">Debit (₹)</th><th className="num cr-heading">Credit (₹)</th></tr></thead>
                  <tbody>{entry.entries.map((line, index) => <tr key={`${line.account}-${index}`}>
                    <td>{line.account}</td>
                    <td className="num dr-amount">{line.debit ? line.debit.toLocaleString('en-IN') : ''}</td>
                    <td className="num cr-amount">{line.credit ? line.credit.toLocaleString('en-IN') : ''}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" disabled={retirementLoading} onClick={() => setRetirementPreview(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={retirementLoading} onClick={() => void confirmRetirement()}>
                {retirementLoading ? 'Processing…' : 'Confirm, Create Entries & Retire'}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="page-header">
        <PageIntro id={partnersOnly ? 'partners' : 'settings'} />
      </div>

      <div className={partnersOnly ? undefined : 'settings-layout'} style={{ display: 'grid', gridTemplateColumns: partnersOnly ? 'minmax(0, 1fr)' : '220px minmax(0, 1fr)', gap: 20 }}>
        {/* Sidebar tabs */}
        {!partnersOnly && <div className="card settings-tabs" style={{ height: 'fit-content', padding: '8px' }}>
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
        </div>}

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Partnership Accounts</h2>
                  <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: 13 }}>Manage partners, profit-sharing ratios, capital accounts, drawings, retirement, and outstanding settlement balances.</p>
                </div>
                {canManageGlobalSettings && partnerLifecycleTab === 'active' && (
                  <button className="btn btn-primary" disabled={partners.length >= 50} onClick={() => setPartners(rows => {
                    const usedShare = rows.filter(row => !row.retirement_date).reduce((sum, row) => sum + Number(row.share_percentage || 0), 0)
                    return [...rows, newPartner(rows.length, Math.max(0, 100 - usedShare))]
                  })}>
                    <Plus size={14} /> Add Partner
                  </button>
                )}
              </div>
              {!canManageGlobalSettings && <div className="badge badge-slate" style={{ marginBottom: 16 }}>View only</div>}
              <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 8, background: '#F1F5F9', marginBottom: 18, width: 'fit-content' }}>
                <button className={`btn ${partnerLifecycleTab === 'active' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPartnerLifecycleTab('active')}>
                  Active Partners <span className="badge badge-slate">{activePartnerRows.length}</span>
                </button>
                <button className={`btn ${partnerLifecycleTab === 'retired' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPartnerLifecycleTab('retired')}>
                  Retired Partners <span className="badge badge-slate">{retiredPartnerRows.length}</span>
                </button>
              </div>
              {partnerLifecycleTab === 'active' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activePartnerRows.map(({ partner, index }) => (
                  <div key={index} style={{ padding: 16, border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Partner {index + 1}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {partner.retirement_date && <span className="badge badge-amber">Retirement Pending</span>}
                        {canManageGlobalSettings && index >= settings.partners.length && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 9px', fontSize: 12 }}
                            onClick={() => setPartners(rows => rows.filter((_, rowIndex) => rowIndex !== index))}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                      {([
                        ['Partner Name', 'partner_name', 'text'], ['Capital Account Name', 'account_name', 'text'],
                        ['Account Code', 'account_code', 'text'], ['Share %', 'share_percentage', 'number'],
                        ['Opening Capital', 'opening_balance', 'number'],
                      ] as const).map(([label, key, type]) => (
                        <div key={key}><label className="form-label">{label}</label><input className="input" type={type} min={type === 'number' ? 0 : undefined}
                          disabled={!canManageGlobalSettings || Boolean(partner.retirement_date) || (key === 'opening_balance' && settings.partners.some(row => row.account_name === partner.account_name))}
                          value={partner[key]} onChange={event => setPartners(rows => {
                            const value = type === 'number' ? Number(event.target.value) : event.target.value
                            if (key === 'share_percentage') {
                              const updatedRows = rows.map((item, itemIndex) => itemIndex === index
                                ? { ...item, share_percentage: Number(value) }
                                : item)
                              const nextActiveIndex = updatedRows.findIndex((item, itemIndex) => itemIndex > index && !item.retirement_date)
                              if (nextActiveIndex >= 0) {
                                const usedByOthers = updatedRows.reduce((sum, item, itemIndex) =>
                                  !item.retirement_date && itemIndex !== nextActiveIndex
                                    ? sum + Number(item.share_percentage || 0)
                                    : sum, 0)
                                updatedRows[nextActiveIndex] = {
                                  ...updatedRows[nextActiveIndex],
                                  share_percentage: Math.max(0, Math.round((100 - usedByOthers) * 100) / 100),
                                }
                              }
                              return updatedRows
                            }
                            return rows.map((row, rowIndex) => {
                            if (rowIndex !== index) return row
                            if (key === 'partner_name') {
                              const name = String(value).trim()
                              const previousSuggestedName = row.partner_name.trim() ? `${row.partner_name.trim()} Capital` : ''
                              const shouldSuggestCapital = !row.account_name.trim() || row.account_name === previousSuggestedName
                              return {
                                ...row,
                                partner_name: String(value),
                                account_name: shouldSuggestCapital ? (name ? `${name} Capital` : '') : row.account_name,
                              }
                            }
                            return { ...row, [key]: value }
                          })
                          })} /></div>
                      ))}
                      <div><label className="form-label">Admission Date</label><input className="input" type="date" disabled={!canManageGlobalSettings || Boolean(partner.retirement_date)}
                        value={partner.admission_date || ''} onChange={event => setPartners(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, admission_date: event.target.value || null } : row))} /></div>
                      <div><label className="form-label">Retirement Date</label>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <input className="input" type="date"
                            disabled={!canManageGlobalSettings
                              || (!partner.retirement_date && partners.filter(row => !row.retirement_date).length <= 1)
                              || Boolean(settings.partners.find(row => row.account_name === partner.account_name)?.retirement_date) && editingRetirement !== partner.account_name}
                            min={partner.admission_date || undefined} value={partner.retirement_date || ''}
                            onChange={event => setPartners(rows => {
                              const retirementDate = event.target.value || null
                              const updatedRows = rows.map((row, rowIndex) => rowIndex === index ? {
                                ...row,
                                retirement_date: retirementDate,
                                retirement_share_percentage: retirementDate ? (row.retirement_share_percentage ?? row.share_percentage) : null,
                                share_percentage: retirementDate ? 0 : Number(row.retirement_share_percentage ?? row.share_percentage),
                              } : row)
                              let nextActiveIndex = updatedRows.findIndex((row, rowIndex) => rowIndex > index && !row.retirement_date)
                              if (nextActiveIndex < 0) nextActiveIndex = updatedRows.findIndex((row, rowIndex) => rowIndex !== index && !row.retirement_date)
                              if (nextActiveIndex >= 0) {
                                const usedByOthers = updatedRows.reduce((sum, row, rowIndex) =>
                                  !row.retirement_date && rowIndex !== nextActiveIndex ? sum + Number(row.share_percentage || 0) : sum, 0)
                                updatedRows[nextActiveIndex] = { ...updatedRows[nextActiveIndex], share_percentage: Math.max(0, Math.round((100 - usedByOthers) * 100) / 100) }
                              }
                              return updatedRows
                            })} />
                          {canManageGlobalSettings && settings.partners.find(row => row.account_name === partner.account_name)?.retirement_date && (
                            editingRetirement === partner.account_name
                              ? <>
                                  <button type="button" className="btn btn-ghost btn-icon btn-icon-success" title="Save retirement date" aria-label="Save retirement date" disabled={retirementLoading} onClick={() => void updateRetirementDate(partner)}><Check size={15} /></button>
                                  <button type="button" className="btn btn-ghost btn-icon" title="Cancel editing" aria-label="Cancel editing" disabled={retirementLoading} onClick={() => {
                                    setPartners(rows => rows.map((row, rowIndex) => rowIndex === index ? settings.partners.find(saved => saved.account_name === row.account_name) || row : row))
                                    setEditingRetirement(null)
                                  }}><X size={15} /></button>
                                </>
                              : <button type="button" className="btn btn-ghost btn-icon btn-icon-primary" title="Edit retirement date" aria-label="Edit retirement date" onClick={() => setEditingRetirement(partner.account_name)}><Pencil size={15} /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {activePartnerRows.length === 0 && <div className="empty-state" style={{ padding: 36 }}>No active partners. Use “+ Add Partner” to create one.</div>}
              </div>}
              {partnerLifecycleTab === 'active' && <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: Math.abs(partners.filter(row => !row.retirement_date).reduce((sum, row) => sum + Number(row.share_percentage || 0), 0) - 100) < .001 || !partners.length ? '#15803D' : '#DC2626' }}>
                  Active partner share: {partners.filter(row => !row.retirement_date).reduce((sum, row) => sum + Number(row.share_percentage || 0), 0)}%
                </span>
                {canManageGlobalSettings && <button className="btn btn-primary" disabled={retirementLoading} onClick={() => void savePartners()}><Save size={14} /> {retirementLoading ? 'Calculating…' : 'Save Partner Accounts'}</button>}
              </div>}
              {partnerLifecycleTab === 'retired' && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead><tr><th>Partner Name</th><th>Account Code</th><th>Retirement Date</th><th style={{ textAlign: 'right' }}>Loan Amount</th><th>Settlement Status</th></tr></thead>
                    <tbody>
                      {retiredPartnerRows.map(({ partner, index }) => {
                        const capitalBalance = accountBalance(partner.account_name)
                        const loanBalance = accountBalance(`${partner.partner_name.trim()} Loan`)
                        const settled = Math.abs(capitalBalance) < .005 && Math.abs(loanBalance) < .005
                        return <tr key={partner.account_name}>
                          <td style={{ fontWeight: 600 }}>{partner.partner_name}</td>
                          <td><span className="mono">{partner.account_code}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {editingRetirement === partner.account_name
                                ? <>
                                    <input className="input" style={{ maxWidth: 170 }} type="date" min={partner.admission_date || undefined} value={partner.retirement_date || ''}
                                      onChange={event => setPartners(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, retirement_date: event.target.value || null } : row))} />
                                    <button type="button" className="btn btn-ghost btn-icon btn-icon-success" title="Save retirement date" aria-label="Save retirement date" disabled={retirementLoading} onClick={() => void updateRetirementDate(partner)}><Check size={14} /></button>
                                    <button type="button" className="btn btn-ghost btn-icon" title="Cancel editing" aria-label="Cancel editing" disabled={retirementLoading} onClick={() => {
                                      setPartners(rows => rows.map((row, rowIndex) => rowIndex === index ? settings.partners.find(saved => saved.account_name === row.account_name) || row : row))
                                      setEditingRetirement(null)
                                    }}><X size={14} /></button>
                                  </>
                                : <>
                                    <span>{partner.retirement_date || '—'}</span>
                                    {canManageGlobalSettings && <button type="button" className="btn btn-ghost btn-icon btn-icon-primary" title="Edit retirement date" aria-label="Edit retirement date" onClick={() => setEditingRetirement(partner.account_name)}><Pencil size={14} /></button>}
                                  </>}
                            </div>
                          </td>
                          <td className="num" style={{ fontWeight: 700, color: Math.abs(loanBalance) < .005 ? '#15803D' : '#DC2626' }}>
                            {formatMoney(Math.abs(loanBalance))}
                          </td>
                          <td><span className={`badge ${settled ? 'badge-green' : 'badge-amber'}`}>{settled ? 'Settled · No Dues' : 'Outstanding Balance'}</span></td>
                        </tr>
                      })}
                      {retiredPartnerRows.length === 0 && <tr><td colSpan={5}><div className="empty-state" style={{ padding: 32 }}>No retired partners.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
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
