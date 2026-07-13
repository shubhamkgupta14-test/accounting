import { appName } from '../config/app'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { Scale, TrendingDown, TrendingUp } from 'lucide-react'

export default function TradingAccount() {
  const { accounts } = useLedgerData()
  const { formatMoney } = useAppSettings()
  const directExpenses = accounts.filter(account => account.type === 'Expense' && account.group === 'Direct Expenses')
  const directIncome = accounts.filter(account => account.type === 'Income' && account.group === 'Direct Income')
  const debitTotal = directExpenses.reduce((sum, account) => sum + (account.balance || 0), 0)
  const creditTotal = directIncome.reduce((sum, account) => sum + (account.balance || 0), 0)
  const grossProfit = creditTotal - debitTotal
  const grandTotal = Math.max(debitTotal + Math.max(grossProfit, 0), creditTotal + Math.max(-grossProfit, 0))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="trading" />
        <ExportMenu fullReport title="Trading Account" rows={[
          ...directExpenses.map(account => ({ side: 'Debit', account: account.name, amount: account.balance || 0 })),
          ...directIncome.map(account => ({ side: 'Credit', account: account.name, amount: account.balance || 0 })),
        ]} />
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        <div className="card stat-card" style={{ minWidth: 200 }}>
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Scale size={13} /> Gross Profit / Loss</div>
          <div className="value" style={{ fontSize: 22, color: '#2563EB' }}>{formatMoney(Math.abs(grossProfit))}</div>
        </div>
        <div className="card stat-card" style={{ minWidth: 200 }}>
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><TrendingUp size={13} /> Direct Income</div>
          <div className="value" style={{ fontSize: 22, color: '#2563EB' }}>{formatMoney(creditTotal)}</div>
        </div>
        <div className="card stat-card" style={{ minWidth: 200 }}>
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><TrendingDown size={13} /> Direct Expenses</div>
          <div className="value" style={{ fontSize: 22, color: '#EF4444' }}>{formatMoney(debitTotal)}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', fontSize: 13.5, fontWeight: 600, color: '#0F172A', display: 'flex', justifyContent: 'space-between' }}>
          <span>Trading Account</span>
          <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 400 }}>Company: {appName}</span>
        </div>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minWidth: 720 }}>
          <div style={{ borderRight: '1px solid #E2E8F0' }}>
            <div style={{ background: '#FEF2F2', padding: '10px 20px', borderBottom: '1px solid #FEE2E2' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dr - Direct Expenses</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {directExpenses.map(account => (
                  <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '9px 20px', fontSize: 13 }}>{account.name}</td>
                    <td style={{ padding: '9px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {grossProfit >= 0 && (
                  <tr style={{ background: '#F0FDF4', borderTop: '2px solid #BBF7D0' }}>
                    <td style={{ padding: '10px 20px', fontWeight: 700, color: '#065F46' }}>Gross Profit c/d</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: '#10B981' }}>{grossProfit.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <div style={{ background: '#F0FDF4', padding: '10px 20px', borderBottom: '1px solid #BBF7D0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cr - Direct Income</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {directIncome.map(account => (
                  <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '9px 20px', fontSize: 13 }}>{account.name}</td>
                    <td style={{ padding: '9px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {grossProfit < 0 && (
                  <tr style={{ background: '#FEF2F2', borderTop: '2px solid #FECACA' }}>
                    <td style={{ padding: '10px 20px', fontWeight: 700, color: '#991B1B' }}>Gross Loss c/d</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: '#EF4444' }}>{Math.abs(grossProfit).toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'contents' }}>
            {[0, 1].map(side => <div key={side} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 20px', background: '#EFF6FF', color: '#2563EB', fontWeight: 800, borderRight: side === 0 ? '1px solid #E2E8F0' : undefined }}><span>Total</span><span className="mono">{grandTotal.toLocaleString('en-IN')}</span></div>)}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
