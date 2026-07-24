import { Bell, Bot, HelpCircle, Menu } from 'lucide-react'
import type { PageId } from '../App'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/SettingsContext'
import { usePageContent } from '../context/ContentContext'
import { useAI } from '../context/AIContext'

interface Props { activePage: PageId; onNavigate: (page: PageId) => void; onOpenMenu: () => void }

export default function Header({ activePage, onNavigate, onOpenMenu }: Props) {
  const pageContent = usePageContent(activePage)
  const { user, canUseAI } = useAuth()
  const { settings } = useAppSettings()
  const { configured: aiConfigured, openChat } = useAI()
  const initials = `${user?.first_name?.[0] || 'F'}${user?.last_name?.[0] || 'L'}`.toUpperCase()
  const name = user ? `${user.first_name} ${user.last_name}` : 'First Last'
  const role = user?.role === 'superadmin' ? 'Superadmin' : user?.role === 'admin' ? 'Admin' : 'View only'
  const reportPages: PageId[] = ['trial-balance', 'trading', 'profit-loss', 'balance-sheet', 'cashbook', 'bankbook', 'ledger', 'daybook', 'account-summary', 'profit-analysis', 'cash-flow-report']
  const isReport = reportPages.includes(activePage)
  const crumbStyle = { border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit' } as const

  return (
    <header className="top-header">
      <button className="btn btn-ghost btn-icon mobile-menu-button" aria-label="Open navigation" onClick={onOpenMenu}><Menu size={19} /></button>
      {/* Brand and current page breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <button type="button" style={{ ...crumbStyle, fontSize: 15, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }} onClick={() => onNavigate('dashboard')}>
          {settings.company.company_name}
        </button>
        {isReport && <><span style={{ color: '#CBD5E1' }}>/</span><button type="button" style={{ ...crumbStyle, fontSize: 12.5, color: '#475569', fontWeight: 500 }} onClick={() => onNavigate('reports')}>Reports</button></>}
        {activePage !== 'dashboard' && <><span style={{ color: '#CBD5E1' }}>/</span><span style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 400 }}>{pageContent.title}</span></>}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {canUseAI && <button
          className={`btn btn-ghost btn-icon ai-header-button${aiConfigured ? ' configured' : ''}`}
          style={{ position: 'relative' }}
          title={aiConfigured ? 'Open Accounting AI' : 'Open Accounting AI setup guide'}
          aria-label="Open Accounting AI"
          onClick={openChat}
        >
          <Bot size={17} />
          <span className={`ai-status-dot${aiConfigured ? ' connected' : ''}`} />
        </button>}
        <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }} title="Notifications" onClick={() => onNavigate('notifications')}>
          <Bell size={16} />
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 7, height: 7, borderRadius: '50%',
            background: '#EF4444', border: '1.5px solid white'
          }} />
        </button>
        <button className="btn btn-ghost btn-icon header-help" title="Help">
          <HelpCircle size={16} />
        </button>
        <div style={{ width: 1, height: 20, background: '#E2E8F0', margin: '0 4px' }} />
        <div className="header-user" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
          transition: 'background 0.15s'
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0
          }}>{initials}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', lineHeight: 1.2 }}>{name}</span>
            <span style={{ fontSize: 11, color: '#64748B', lineHeight: 1.2 }}>{role}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
