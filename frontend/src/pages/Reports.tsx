import { FileText, TrendingUp, PieChart, Scale, BarChart2, BookOpen, Wallet, Building2, CalendarDays, ArrowRight } from 'lucide-react'
import type { PageId } from '../App'
import PageIntro from '../components/PageIntro'
import { useLedgerData } from '../context/DataContext'

interface ReportItem {
  icon: React.ReactNode
  title: string
  page?: PageId
  desc: string
  color: string
  bg: string
}

const reports: Array<{ category: string; items: ReportItem[] }> = [
  {
    category: 'Financial Statements',
    items: [
      { icon: <Scale size={18} />, title: 'Trial Balance', page: 'trial-balance' as PageId, desc: 'Verify debit and credit totals are balanced', color: '#2563EB', bg: '#EFF6FF' },
      { icon: <BarChart2 size={18} />, title: 'Trading Account', page: 'trading' as PageId, desc: 'Gross profit from trading operations', color: '#7C3AED', bg: '#F5F3FF' },
      { icon: <TrendingUp size={18} />, title: 'Profit & Loss', page: 'profit-loss' as PageId, desc: 'Net income after all income and expenses', color: '#10B981', bg: '#ECFDF5' },
      { icon: <PieChart size={18} />, title: 'Balance Sheet', page: 'balance-sheet' as PageId, desc: 'Assets, liabilities and equity snapshot', color: '#0891B2', bg: '#ECFEFF' },
    ]
  },
  {
    category: 'Book Reports',
    items: [
      { icon: <Wallet size={18} />, title: 'Cash Book', page: 'cashbook' as PageId, desc: 'Daily cash receipts and payments', color: '#059669', bg: '#ECFDF5' },
      { icon: <Building2 size={18} />, title: 'Bank Book', page: 'bankbook' as PageId, desc: 'Bank account transactions and balance', color: '#2563EB', bg: '#EFF6FF' },
      { icon: <BookOpen size={18} />, title: 'Ledger Report', page: 'ledger' as PageId, desc: 'Account-wise transaction details', color: '#D97706', bg: '#FFFBEB' },
      { icon: <CalendarDays size={18} />, title: 'Day Book', page: 'daybook' as PageId, desc: 'Chronological daily journal entries', color: '#DC2626', bg: '#FEF2F2' },
    ]
  },
  {
    category: 'GST Reports',
    items: [
      { icon: <FileText size={18} />, title: 'GSTR-1', desc: 'Outward supplies — Sales return', color: '#7C3AED', bg: '#F5F3FF' },
      { icon: <FileText size={18} />, title: 'GSTR-3B', desc: 'Monthly summary return', color: '#0891B2', bg: '#ECFEFF' },
      { icon: <FileText size={18} />, title: 'GST Payable Report', desc: 'Tax collected and input credit', color: '#D97706', bg: '#FFFBEB' },
      { icon: <FileText size={18} />, title: 'GST Reconciliation', desc: 'Match filed vs. books data', color: '#059669', bg: '#ECFDF5' },
    ]
  },
  {
    category: 'Management Reports',
    items: [
      { icon: <BarChart2 size={18} />, title: 'Account Summary', page: 'account-summary', desc: 'High-level account balances overview', color: '#2563EB', bg: '#EFF6FF' },
      { icon: <TrendingUp size={18} />, title: 'Profit Analysis', page: 'profit-analysis', desc: 'Month-wise profitability analysis', color: '#10B981', bg: '#ECFDF5' },
      { icon: <FileText size={18} />, title: 'Cash Flow Statement', page: 'cash-flow-report', desc: 'Monthly cash and bank inflows and outflows', color: '#7C3AED', bg: '#F5F3FF' },
    ]
  }
]

export default function Reports({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { refresh } = useLedgerData()
  return (
    <div>
      <div className="page-header"><PageIntro id="reports" onReload={refresh} /></div>

      {reports.map(section => (
        <div key={section.category} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {section.category}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {section.items.map(item => (
              <div key={item.title} className="card"
                style={{ padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 10 }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
                onClick={() => item.page ? onNavigate(item.page) : undefined}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.4 }}>{item.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: item.color, fontWeight: 500, marginTop: 'auto' }}>
                  View Report <ArrowRight size={13} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
