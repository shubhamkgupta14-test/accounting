import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, FileText, BookOpen, Scale, TrendingUp, AlertTriangle, Wallet, Landmark, ShoppingCart, BadgeIndianRupee } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { PageId } from '../App'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/SettingsContext'
import PageIntro from '../components/PageIntro'
import { api, type JournalEntry } from '../lib/api'

interface Props { onNavigate: (page: PageId) => void }

interface DashboardReport {
  stats: { cash: number; bank: number; sales: number; purchases: number; profit: number; pending_vouchers: number }
  recent_journals: JournalEntry[]
  monthly: { key: string; sales: number; expenses: number; inflow: number; outflow: number; profit: number }[]
  expense_breakdown: { name: string; value: number }[]
}

const emptyReport: DashboardReport = {
  stats: { cash: 0, bank: 0, sales: 0, purchases: 0, profit: 0, pending_vouchers: 0 },
  recent_journals: [], monthly: [], expense_breakdown: [],
}

const fmt = (n: number, symbol: string, compact?: boolean) => {
  if (compact && Math.abs(n) >= 100000) {
    return symbol + (Math.abs(n) >= 10000000 ? (n / 10000000).toFixed(1) + 'Cr' : (n / 100000).toFixed(1) + 'L')
  }
  return symbol + n.toLocaleString('en-IN')
}

const quickActions = [
  { label: 'New Journal Entry', icon: <BookOpen size={14} />, page: 'journal' as PageId },
  { label: 'Create Voucher', icon: <FileText size={14} />, page: 'vouchers' as PageId },
]

const reportActions = [
  { label: 'View Trial Balance', icon: <Scale size={14} />, page: 'trial-balance' as PageId },
  { label: 'View P&L', icon: <TrendingUp size={14} />, page: 'profit-loss' as PageId },
]

const CustomTooltip = ({ active, payload, label, currencySymbol }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ margin: '2px 0', fontSize: 12.5, color: p.color, fontFamily: 'JetBrains Mono, monospace' }}>
          {p.name}: {fmt(p.value, currencySymbol, true)}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard({ onNavigate }: Props) {
  const { canWrite } = useAuth()
  const { settings, formatMoney, formatDate, currencySymbol } = useAppSettings()
  const [report, setReport] = useState<DashboardReport>(emptyReport)
  const refreshing = useRef(false)
  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try { setReport(await api.dashboard()) }
    finally { refreshing.current = false }
  }, [])
  useEffect(() => {
    void refresh().catch(() => undefined)
    const interval = window.setInterval(() => { void refresh().catch(() => undefined) }, 10 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [refresh])
  const stats = [
    { label: 'Cash Balance', value: report.stats.cash, color: '#10B981', background: '#ECFDF5', icon: <Wallet size={19} /> },
    { label: 'Bank Balance', value: report.stats.bank, color: '#2563EB', background: '#EFF6FF', icon: <Landmark size={19} /> },
    { label: 'Total Sales', value: report.stats.sales, color: '#7C3AED', background: '#F5F3FF', icon: <BadgeIndianRupee size={19} /> },
    { label: 'Total Purchases', value: report.stats.purchases, color: '#F59E0B', background: '#FFFBEB', icon: <ShoppingCart size={19} /> },
    { label: 'Net Profit', value: report.stats.profit, color: '#0891B2', background: '#ECFEFF', icon: <TrendingUp size={19} /> },
  ]
  const pendingCount = report.stats.pending_vouchers
  const recentEntries = report.recent_journals.map(entry => ({ ...entry, voucherNo: entry.voucher_no, entries: entry.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) }))
  const expenseColors = ['#2563EB', '#7C3AED', '#F59E0B', '#10B981', '#EF4444', '#0891B2']
  const expenseBreakdown = report.expense_breakdown.map((entry, index) => ({ ...entry, color: expenseColors[index % expenseColors.length] }))
  const monthlyRevenue = report.monthly.map(row => ({ ...row, month: new Date(`${row.key}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: '2-digit' }) }))
  const cashflowData = monthlyRevenue

  return (
    <div>
      <div className="page-header">
        <PageIntro id="dashboard" onReload={refresh} />
      </div>

      {pendingCount > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0 }} />
          <span style={{ color: '#92400E' }}>{pendingCount} vouchers pending approval. <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onNavigate('vouchers')}>Review now</strong></span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} className="card stat-card" style={{ position: 'relative', overflow: 'hidden', minHeight: 92 }}>
            <div style={{ paddingRight: 42 }}>
              <div className="label">{s.label}</div>
              <div className="value" style={{ fontSize: 20, color: s.color }}>{formatMoney(s.value)}</div>
            </div>
            <div style={{ position: 'absolute', right: 14, top: 14, zIndex: 1, width: 38, height: 38, borderRadius: 10, background: s.background, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.icon}
            </div>
            <div style={{ position: 'absolute', right: -18, bottom: -22, width: 70, height: 70, borderRadius: '50%', background: s.background, opacity: 0.55 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Revenue vs Expenses</h3>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: '#64748B' }}>Posted journals only</p>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={monthlyRevenue} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, currencySymbol, true)} />
                <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
                <Area type="monotone" dataKey="sales" stroke="#2563EB" strokeWidth={2} fill="#EFF6FF" name="Sales" dot={false} />
                <Area type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} fill="#FEF2F2" name="Expenses" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-state" style={{ padding: '64px 20px' }}>No journal data yet.</div>}
        </div>

        <div className="card" style={{ padding: '20px 20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Expense Breakdown</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748B' }}>Current expense accounts</p>
          {expenseBreakdown.length > 0 ? <>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={expenseBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                  {expenseBreakdown.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => fmt(value, currencySymbol)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {expenseBreakdown.map(entry => <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                <span className="truncate" style={{ flex: 1, color: '#64748B' }}>{entry.name}</span>
                <span className="mono" style={{ fontSize: 11.5 }}>{fmt(entry.value, currencySymbol, true)}</span>
              </div>)}
            </div>
          </> : <div className="empty-state" style={{ padding: '56px 12px' }}>No expense data yet.</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Cash Flow</h3>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: '#64748B' }}>Cash and bank transactions only</p>
          {cashflowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={cashflowData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={3} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, currencySymbol, true)} />
                <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
                <Bar dataKey="inflow" fill="#2563EB" radius={[3, 3, 0, 0]} name="Inflow" />
                <Bar dataKey="outflow" fill="#EF4444" radius={[3, 3, 0, 0]} name="Outflow" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state" style={{ padding: '48px 20px' }}>No cash or bank transactions yet.</div>}
        </div>
        <div className="card" style={{ padding: '20px 20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...(canWrite ? quickActions : []), ...reportActions].map(action => (
              <button key={action.label} className="btn btn-secondary" style={{ justifyContent: 'flex-start', gap: 8, fontSize: 12.5, padding: '9px 12px' }} onClick={() => onNavigate(action.page)}>
                <span style={{ color: '#2563EB' }}>{action.icon}</span>{action.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#EFF6FF', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 11.5, color: '#1D4ED8', fontWeight: 500 }}>FY {settings.fiscal.financial_year}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#3B82F6' }}>{settings.fiscal.start} – {settings.fiscal.end}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Recent Journal Entries</h3>
          <button className="btn btn-ghost" style={{ fontSize: 12.5, color: '#2563EB' }} onClick={() => onNavigate('journal')}>
            View all <ArrowRight size={13} />
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher No.</th>
                <th>Date</th>
                <th>Narration</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map(e => {
                const dr = e.entries.reduce((s, r) => s + r.dr, 0)
                const cr = e.entries.reduce((s, r) => s + r.cr, 0)
                return (
                  <tr key={e.id}>
                    <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{e.voucherNo}</span></td>
                    <td><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(e.date)}</span></td>
                    <td><span className="narration-text">{e.narration}</span></td>
                    <td className="num dr-amount">{dr.toLocaleString('en-IN')}</td>
                    <td className="num cr-amount">{cr.toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${e.status === 'Posted' ? 'badge-green' : 'badge-amber'}`}>{e.status}</span></td>
                  </tr>
                )
              })}
              {recentEntries.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state" style={{ padding: '36px 20px' }}>No journal entries yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
