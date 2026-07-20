import { TrendingUp, TrendingDown, Scale } from 'lucide-react'
import ExportMenu from '../components/ExportMenu'
import ReportPeriodFilter from '../components/ReportPeriodFilter'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { useFinancialReport } from '../hooks/useFinancialReport'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import AccountDrilldown from '../components/AccountDrilldown'
import { buildTraditionalTwoSidedExport } from '../lib/export'

export default function ProfitLoss() {
  const { settings, formatMoney } = useAppSettings()
  const { report, period, setPeriod, loading, error } = useFinancialReport(settings.fiscal)
  if (!report) return <div><PageIntro id="profit-loss" /><ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} /></div>
  const { indirectIncome: income, indirectExpenses: expenses, grossProfit, netProfit } = report
  const totalIncome = income.reduce((sum, account) => sum + (account.balance || 0), 0) + Math.max(grossProfit, 0)
  const totalExpenses = expenses.reduce((sum, account) => sum + (account.balance || 0), 0) + Math.max(-grossProfit, 0)
  const plTotal = Math.max(totalExpenses + Math.max(netProfit, 0), totalIncome + Math.max(-netProfit, 0))
  const plExport = buildTraditionalTwoSidedExport('Dr.', 'Cr.', [
    ...(grossProfit < 0 ? [{ particulars: 'To Gross Loss b/d', amount: Math.abs(grossProfit) }] : []),
    ...expenses.map(account => ({ particulars: `To ${account.name}`, amount: account.balance || 0 })),
    ...(netProfit > 0 ? [{ particulars: 'To Net Profit transferred to Capital', amount: netProfit }] : []),
  ], [
    ...(grossProfit > 0 ? [{ particulars: 'By Gross Profit b/d', amount: grossProfit }] : []),
    ...income.map(account => ({ particulars: `By ${account.name}`, amount: account.balance || 0 })),
    ...(netProfit < 0 ? [{ particulars: 'By Net Loss transferred to Capital', amount: Math.abs(netProfit) }] : []),
  ], plTotal)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="profit-loss" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <AuditUncheckAllButton />
        <ExportMenu fullReport title="Profit and Loss Account" period={period} excelRows={plExport.rows} pdfHtml={plExport.html} rows={[
          ...(grossProfit < 0 ? [{ side: 'Debit', account: 'Gross Loss b/d', amount: Math.abs(grossProfit) }] : []),
          ...expenses.map(account => ({ side: 'Debit', account: account.name, amount: account.balance || 0 })),
          ...(grossProfit > 0 ? [{ side: 'Credit', account: 'Gross Profit b/d', amount: grossProfit }] : []),
          ...income.map(account => ({ side: 'Credit', account: account.name, amount: account.balance || 0 })),
        ]} />
        </div>
      </div>

      <ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} />

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
              {grossProfit < 0 && <tr style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item="Gross Loss brought down" />Gross Loss b/d</span></td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{Math.abs(grossProfit).toLocaleString('en-IN')}</td></tr>}
              {expenses.map(account => <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{(account.balance || 0).toLocaleString('en-IN')}</td></tr>)}
              {netProfit > 0 && <tr style={{ background: '#EFF6FF', color: '#2563EB' }}><td style={{ padding: '10px 20px', fontWeight: 700 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item="Net Profit" />Net Profit</span></td><td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{netProfit.toLocaleString('en-IN')}</td></tr>}
            </tbody></table>
          </div>
          <div>
            <div style={{ background: '#FEF2F2', padding: '10px 20px', borderBottom: '1px solid #FECACA' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Cr - Income</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {grossProfit > 0 && <tr style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item="Gross Profit brought down" />Gross Profit b/d</span></td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{grossProfit.toLocaleString('en-IN')}</td></tr>}
              {income.map(account => <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}><td style={{ padding: '8px 20px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td><td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{(account.balance || 0).toLocaleString('en-IN')}</td></tr>)}
              {netProfit < 0 && <tr style={{ background: '#EFF6FF', color: '#2563EB' }}><td style={{ padding: '10px 20px', fontWeight: 700 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item="Net Loss" />Net Loss</span></td><td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>{Math.abs(netProfit).toLocaleString('en-IN')}</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  )
}
