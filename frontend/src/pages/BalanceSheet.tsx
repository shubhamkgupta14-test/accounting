import { CheckCircle, Landmark, Scale, WalletCards } from 'lucide-react'
import { appName } from '../config/app'
import ExportMenu from '../components/ExportMenu'
import ReportPeriodFilter from '../components/ReportPeriodFilter'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { useFinancialReport } from '../hooks/useFinancialReport'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import AccountDrilldown from '../components/AccountDrilldown'
import { buildTraditionalTwoSidedExport } from '../lib/export'

export default function BalanceSheet() {
  const { settings, formatMoney } = useAppSettings()
  const { report, period, setPeriod, loading, error } = useFinancialReport(settings.fiscal)
  if (!report) return <div><PageIntro id="balance-sheet" /><ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} /></div>
  const { assets, liabilitiesAndCapital } = report
  const totalAssets = assets.reduce((sum, account) => sum + (account.balance || 0), 0)
  const totalLiab = liabilitiesAndCapital.reduce((sum, account) => sum + (account.balance || 0), 0)
  const balanced = Math.abs(totalAssets - totalLiab) < 0.005

  const assetGroup = (account: typeof assets[number]) => {
    const group = account.group.toLowerCase()
    const name = account.name.toLowerCase()
    if (group.includes('fixed')) return 'Fixed Assets'
    if (group.includes('non-current') || group.includes('long-term')) return 'Non-current Assets'
    if (name.includes('cash')) return 'Cash'
    if (group === 'bank' || name.includes('bank')) return 'Bank'
    return 'Current Assets'
  }
  const liabilityGroup = (account: typeof liabilitiesAndCapital[number]) => {
    const group = account.group.toLowerCase()
    if (account.type === 'Equity') return 'Capital'
    if (group.includes('long-term')) return 'Long-term Liabilities'
    if (group.includes('current') || group.includes('short-term') || group.includes('creditor')) return 'Short-term Liabilities'
    return 'Other Liabilities'
  }
  const grouped = (rows: typeof assets, classify: (account: typeof assets[number]) => string) => rows.reduce<Record<string, typeof assets>>((acc, account) => {
    const group = classify(account)
    acc[group] ||= []
    acc[group].push(account)
    return acc
  }, {})
  const orderedGroups = (rows: typeof assets, classify: (account: typeof assets[number]) => string, order: string[]) => {
    const result = grouped(rows, classify)
    return Object.entries(result).sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
  }
  const assetGroups = orderedGroups(assets, assetGroup, ['Fixed Assets', 'Non-current Assets', 'Current Assets', 'Cash', 'Bank'])
  const liabilityGroups = orderedGroups(liabilitiesAndCapital, liabilityGroup, ['Capital', 'Long-term Liabilities', 'Short-term Liabilities', 'Other Liabilities'])
  const balanceSheetExport = buildTraditionalTwoSidedExport(
    'Liabilities & Capital', 'Assets',
    liabilitiesAndCapital.map(account => ({ particulars: account.name, amount: account.balance || 0 })),
    assets.map(account => ({ particulars: account.name, amount: account.balance || 0 })),
    Math.max(totalLiab, totalAssets),
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="balance-sheet" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {balanced && (
            <span className="report-status">
              <CheckCircle size={14} /> Balance Sheet Balanced
            </span>
          )}
          <AuditUncheckAllButton />
          <ExportMenu fullReport title="Balance Sheet" period={period} excelRows={balanceSheetExport.rows} pdfHtml={balanceSheetExport.html} rows={[
            ...assets.map(account => ({ side: 'Assets', group: account.group, account: account.name, amount: account.balance || 0 })),
            ...liabilitiesAndCapital.map(account => ({ side: 'Liabilities & Capital', group: account.group, account: account.name, amount: account.balance || 0 })),
          ]} />
        </div>
      </div>

      <ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><WalletCards size={13} /> Total Assets</div>
          <div className="value" style={{ fontSize: 22, color: '#2563EB' }}>{formatMoney(totalAssets)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Landmark size={13} /> Total Liabilities + Capital</div>
          <div className="value" style={{ fontSize: 22, color: '#7C3AED' }}>{formatMoney(totalLiab)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Scale size={13} /> Difference</div>
          <div className="value" style={{ fontSize: 22, color: balanced ? '#10B981' : '#EF4444' }}>{formatMoney(Math.abs(totalAssets - totalLiab))}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
          <span>Balance Sheet</span>
          <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 400 }}>{appName}</span>
        </div>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minWidth: 760 }}>
          <div style={{ order: 2 }}>
            <div style={{ background: '#EFF6FF', padding: '10px 20px', borderBottom: '1px solid #DBEAFE' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assets</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {assetGroups.map(([group, rows]) => (
                  <>
                    <tr key={group} style={{ background: '#F8FAFC' }}><td colSpan={2} style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{group}</td></tr>
                    {rows.map(account => (
                      <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 20px 8px 32px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ order: 1, borderRight: '1px solid #E2E8F0' }}>
            <div style={{ background: '#F0FDF4', padding: '10px 20px', borderBottom: '1px solid #BBF7D0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liabilities & Capital</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {liabilityGroups.map(([group, rows]) => (
                  <>
                    <tr key={group} style={{ background: '#F8FAFC' }}><td colSpan={2} style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{group}</td></tr>
                    {rows.map(account => (
                      <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 20px 8px 32px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ order: 4, display: 'flex', justifyContent: 'space-between', padding: '12px 20px', fontWeight: 800, color: 'white', background: '#1D4ED8' }}><span>TOTAL ASSETS</span><span className="mono">{totalAssets.toLocaleString('en-IN')}</span></div>
          <div style={{ order: 3, display: 'flex', justifyContent: 'space-between', padding: '12px 20px', fontWeight: 800, color: 'white', background: '#1D4ED8', borderRight: '1px solid #93C5FD' }}><span>TOTAL LIABILITIES & CAPITAL</span><span className="mono">{totalLiab.toLocaleString('en-IN')}</span></div>
        </div>
        </div>
      </div>
    </div>
  )
}
