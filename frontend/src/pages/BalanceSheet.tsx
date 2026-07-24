import { Fragment } from 'react'
import { CheckCircle, Landmark, Scale, WalletCards } from 'lucide-react'
import { appName } from '../config/app'
import ExportMenu from '../components/ExportMenu'
import ReportPeriodFilter from '../components/ReportPeriodFilter'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { useFinancialReport } from '../hooks/useFinancialReport'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import AccountDrilldown from '../components/AccountDrilldown'
import { buildBalanceSheetExport, formatReportNumber } from '../lib/export'
import { balanceSheetGroup, buildBalanceSheetSections } from '../lib/accountGroups'
import EmptyTableRow from '../components/EmptyTableRow'

export default function BalanceSheet() {
  const { settings } = useAppSettings()
  const { report, period, setPeriod, loading, error } = useFinancialReport(settings.fiscal)
  if (!report) return <div><PageIntro id="balance-sheet" /><ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} /></div>
  const { assets, liabilitiesAndCapital } = report
  const assetSections = buildBalanceSheetSections(assets, 'assets')
  const claimSections = buildBalanceSheetSections(liabilitiesAndCapital, 'claims')
  const totalAssets = assetSections.reduce((sum, section) => sum + section.total, 0)
  const totalLiab = claimSections.reduce((sum, section) => sum + section.total, 0)
  const balanced = Math.abs(totalAssets - totalLiab) < 0.005
  const balanceSheetExport = buildBalanceSheetExport(
    'Capital and Liabilities', 'Assets',
    claimSections,
    assetSections,
    totalLiab,
    totalAssets,
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
            ...assets.map(account => ({ side: 'Assets', section: buildBalanceSheetSections([account], 'assets')[0]?.name, group: balanceSheetGroup(account), account: account.name, amount: account.balance || 0 })),
            ...liabilitiesAndCapital.map(account => ({ side: 'Capital and Liabilities', section: buildBalanceSheetSections([account], 'claims')[0]?.name, group: balanceSheetGroup(account), account: account.name, amount: account.balance || 0 })),
          ]} />
        </div>
      </div>

      <ReportPeriodFilter period={period} onChange={setPeriod} loading={loading} error={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><WalletCards size={13} /> Total Assets</div>
          <div className="value" style={{ fontSize: 22, color: '#2563EB', fontWeight: 600 }}>{formatReportNumber(totalAssets)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Landmark size={13} /> Total Liabilities + Capital</div>
          <div className="value" style={{ fontSize: 22, color: '#7C3AED', fontWeight: 600 }}>{formatReportNumber(totalLiab)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Scale size={13} /> Difference</div>
          <div className="value" style={{ fontSize: 22, color: balanced ? '#10B981' : '#EF4444', fontWeight: 600 }}>{formatReportNumber(Math.abs(totalAssets - totalLiab))}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
          <span>Balance Sheet · Proprietorship / Partnership</span>
          <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 400 }}>{appName}</span>
        </div>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minWidth: 760 }}>
          <div style={{ order: 2 }}>
            <div style={{ background: '#EFF6FF', padding: '10px 20px', borderBottom: '1px solid #DBEAFE' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assets</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup><col /><col style={{ width: 150 }} /></colgroup>
              <tbody>
                {assetSections.length === 0 && <EmptyTableRow colSpan={2} />}
                {assetSections.map(section => (
                  <Fragment key={section.name}>
                    <tr style={{ background: '#DBEAFE' }}><td style={{ padding: '9px 20px', fontSize: 12, fontWeight: 650, color: '#1E3A8A', textTransform: 'uppercase' }}>{section.name}</td><td className="num" style={{ padding: '9px 20px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: '#1E3A8A' }}>{formatReportNumber(section.total)}</td></tr>
                    {section.groups.map(group => <Fragment key={group.name}>
                      <tr style={{ background: '#F8FAFC' }}><td style={{ padding: '8px 20px 8px 28px', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>{group.name}</td><td className="num" style={{ padding: '8px 20px', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>{formatReportNumber(group.total)}</td></tr>
                      {group.accounts.map(account => (
                      <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 20px 7px 40px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, fontSize: 13 }}>{formatReportNumber(account.balance || 0)}</td>
                      </tr>
                      ))}
                    </Fragment>)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ order: 1, borderRight: '1px solid #E2E8F0' }}>
            <div style={{ background: '#F0FDF4', padding: '10px 20px', borderBottom: '1px solid #BBF7D0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capital and Liabilities</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup><col /><col style={{ width: 150 }} /></colgroup>
              <tbody>
                {claimSections.length === 0 && <EmptyTableRow colSpan={2} />}
                {claimSections.map(section => (
                  <Fragment key={section.name}>
                    <tr style={{ background: '#DCFCE7' }}><td style={{ padding: '9px 20px', fontSize: 12, fontWeight: 650, color: '#14532D', textTransform: 'uppercase' }}>{section.name}</td><td className="num" style={{ padding: '9px 20px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: '#14532D' }}>{formatReportNumber(section.total)}</td></tr>
                    {section.groups.map(group => <Fragment key={group.name}>
                      <tr style={{ background: '#F8FAFC' }}><td style={{ padding: '8px 20px 8px 28px', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>{group.name}</td><td className="num" style={{ padding: '8px 20px', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>{formatReportNumber(group.total)}</td></tr>
                      {group.accounts.map(account => (
                      <tr key={account.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 20px 7px 40px', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><AuditCheckbox item={account.name} /><AccountDrilldown account={account.name} /></span></td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, fontSize: 13 }}>{formatReportNumber(account.balance || 0)}</td>
                      </tr>
                      ))}
                    </Fragment>)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ order: 4, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', padding: '12px 0 12px 20px', fontWeight: 600, color: 'white', background: '#1D4ED8' }}><span>TOTAL ASSETS</span><span style={{ paddingRight: 20, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{formatReportNumber(totalAssets)}</span></div>
          <div style={{ order: 3, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', padding: '12px 0 12px 20px', fontWeight: 600, color: 'white', background: '#1D4ED8', borderRight: '1px solid #93C5FD' }}><span>TOTAL CAPITAL AND LIABILITIES</span><span style={{ paddingRight: 20, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{formatReportNumber(totalLiab)}</span></div>
        </div>
        </div>
      </div>
    </div>
  )
}
