import { TrendingUp, TrendingDown, Scale } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'

export default function ProfitLoss() {
  const { accounts } = useLedgerData()
  const { formatMoney } = useAppSettings()
  const income = accounts.filter(account => account.type === 'Income' && (account.balance || 0) !== 0)
  const expenses = accounts.filter(account => account.type === 'Expense' && (account.balance || 0) !== 0)
  const totalIncome = income.reduce((sum, account) => sum + (account.balance || 0), 0)
  const totalExpenses = expenses.reduce((sum, account) => sum + (account.balance || 0), 0)
  const netProfit = totalIncome - totalExpenses

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="profit-loss" />
        <ExportMenu fullReport title="Profit and Loss" rows={[
          ...expenses.map(account => ({ side: 'Debit', account: account.name, amount: account.balance || 0 })),
          ...income.map(account => ({ side: 'Credit', account: account.name, amount: account.balance || 0 })),
        ]} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Income', value: totalIncome, color: '#10B981', icon: <TrendingUp size={13} /> },
          { label: 'Total Expenses', value: totalExpenses, color: '#EF4444', icon: <TrendingDown size={13} /> },
          { label: netProfit >= 0 ? 'Net Profit' : 'Net Loss', value: Math.abs(netProfit), color: netProfit >= 0 ? '#2563EB' : '#EF4444', icon: <Scale size={13} /> },
        ].map(k => (
          <div key={k.label} className="card stat-card">
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: k.color }}>{k.icon}</span>{k.label}</div>
            <div className="value" style={{ fontSize: 20, color: k.color }}>{formatMoney(k.value)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Profit & Loss Account</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ borderRight: '1px solid #E2E8F0' }}>
            <div style={{ background: '#ECFDF5', padding: '10px 20px', borderBottom: '1px solid #A7F3D0' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Dr - Expenses</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {expenses.map(account => <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13 }}>{account.name}</td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{(account.balance || 0).toLocaleString('en-IN')}</td></tr>)}
              {netProfit > 0 && <tr style={{ background: '#EFF6FF', color: '#2563EB' }}><td style={{ padding: '10px 20px', fontWeight: 700 }}>Net Profit</td><td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{netProfit.toLocaleString('en-IN')}</td></tr>}
            </tbody></table>
          </div>
          <div>
            <div style={{ background: '#FEF2F2', padding: '10px 20px', borderBottom: '1px solid #FECACA' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Cr - Income</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {income.map(account => <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13 }}>{account.name}</td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{(account.balance || 0).toLocaleString('en-IN')}</td></tr>)}
              {netProfit < 0 && <tr style={{ background: '#EFF6FF', color: '#2563EB' }}><td style={{ padding: '10px 20px', fontWeight: 700 }}>Net Loss</td><td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{Math.abs(netProfit).toLocaleString('en-IN')}</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  )
}
