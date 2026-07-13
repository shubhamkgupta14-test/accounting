import {
  LayoutDashboard, BookOpen, FileText, BookMarked,
  Wallet, Building2, Scale, BarChart3, TrendingUp,
  PieChart, CalendarDays, List, BarChart2, Settings,
  LogOut, ChevronRight, Bell, Users, Database
} from 'lucide-react'
import type { PageId } from '../App'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/SettingsContext'

interface NavItem {
  id: PageId
  label: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
    ]
  },
  {
    label: 'Transactions',
    items: [
      { id: 'journal', label: 'Journal Entries', icon: <BookOpen size={15} /> },
      { id: 'vouchers', label: 'Vouchers', icon: <FileText size={15} /> },
      { id: 'daybook', label: 'Day Book', icon: <CalendarDays size={15} /> },
    ]
  },
  {
    label: 'Accounts',
    items: [
      { id: 'ledger', label: 'Ledger', icon: <BookMarked size={15} /> },
      { id: 'cashbook', label: 'Cash Book', icon: <Wallet size={15} /> },
      { id: 'bankbook', label: 'Bank Book', icon: <Building2 size={15} /> },
      { id: 'chart-of-accounts', label: 'Ledger Accounts', icon: <List size={15} /> },
    ]
  },
  {
    label: 'Reports',
    items: [
      { id: 'trial-balance', label: 'Trial Balance', icon: <Scale size={15} /> },
      { id: 'trading', label: 'Trading Account', icon: <BarChart3 size={15} /> },
      { id: 'profit-loss', label: 'Profit & Loss', icon: <TrendingUp size={15} /> },
      { id: 'balance-sheet', label: 'Balance Sheet', icon: <PieChart size={15} /> },
      { id: 'reports', label: 'Reports', icon: <BarChart2 size={15} /> },
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
      { id: 'user-management', label: 'User Management', icon: <Users size={15} /> },
      { id: 'clean-db', label: 'Clean Database', icon: <Database size={15} /> },
      { id: 'settings', label: 'Settings', icon: <Settings size={15} /> },
    ]
  }
]

interface Props {
  activePage: PageId
  onNavigate: (page: PageId) => void
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ activePage, onNavigate, mobileOpen, onClose }: Props) {
  const { user, logout, canManageUsers } = useAuth()
  const { settings } = useAppSettings()
  const initials = `${user?.first_name?.[0] || 'F'}${user?.last_name?.[0] || 'L'}`.toUpperCase()
  const name = user ? `${user.first_name} ${user.last_name}` : 'First Last'
  const role = user?.role === 'superadmin' ? 'Superadmin' : user?.role === 'admin' ? 'Admin' : 'Accountant'

  return (
    <><button className={`sidebar-backdrop${mobileOpen ? ' visible' : ''}`} aria-label="Close navigation" onClick={onClose} /><aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      {/* Brand */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1E293B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <BookOpen size={16} color="white" />
          </div>
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{settings.company.company_name}</div>
            <div style={{ color: '#475569', fontSize: 11, fontWeight: 500 }}>Accounting</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8, paddingBottom: 8, overflowY: 'auto' }}>
        {navGroups.map(group => (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.items.filter(item => canManageUsers || !['user-management', 'clean-db'].includes(item.id)).map(item => (
              <div
                key={item.id}
                className={`nav-item${activePage === item.id ? ' active' : ''}`}
                onClick={() => { onNavigate(item.id); onClose() }}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {activePage === item.id && <ChevronRight size={12} style={{ opacity: 0.6 }} />}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div style={{ borderTop: '1px solid #1E293B', padding: '12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'white'
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 600 }} className="truncate">{name}</div>
            <div style={{ color: '#64748B', fontSize: 11 }}>{role}</div>
          </div>
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.15s'
          }}
            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            title="Logout"
            onClick={logout}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside></>
  )
}
