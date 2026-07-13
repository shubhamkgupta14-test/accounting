import { CheckCircle, Landmark, Scale, WalletCards } from 'lucide-react'
import { appName } from '../config/app'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'

export default function BalanceSheet() {
  const { accounts } = useLedgerData()
  const { formatMoney } = useAppSettings()
  const assets = accounts.filter(account => account.type === 'Asset')
  const liabilitiesAndCapital = accounts.filter(account => ['Liability', 'Equity'].includes(account.type))
  const totalAssets = assets.reduce((sum, account) => sum + (account.balance || 0), 0)
  const income = accounts.filter(account => account.type === 'Income').reduce((sum, account) => sum + (account.balance || 0), 0)
  const expenses = accounts.filter(account => account.type === 'Expense').reduce((sum, account) => sum + (account.balance || 0), 0)
  const currentProfit = income - expenses
  const totalLiab = liabilitiesAndCapital.reduce((sum, account) => sum + (account.balance || 0), 0) + currentProfit
  const balanced = Math.abs(totalAssets - totalLiab) < 0.005

  const assetGroup = (account: typeof accounts[number]) => {
    const group = account.group.toLowerCase()
    const name = account.name.toLowerCase()
    if (group.includes('fixed')) return 'Fixed Assets'
    if (group.includes('non-current') || group.includes('long-term')) return 'Non-current Assets'
    if (name.includes('cash')) return 'Cash'
    if (group === 'bank' || name.includes('bank')) return 'Bank'
    return 'Current Assets'
  }
  const liabilityGroup = (account: typeof accounts[number]) => {
    const group = account.group.toLowerCase()
    if (account.type === 'Equity') return 'Capital'
    if (group.includes('long-term')) return 'Long-term Liabilities'
    if (group.includes('current') || group.includes('short-term') || group.includes('creditor')) return 'Short-term Liabilities'
    return 'Other Liabilities'
  }
  const grouped = (rows: typeof accounts, classify: (account: typeof accounts[number]) => string) => rows.reduce<Record<string, typeof accounts>>((acc, account) => {
    const group = classify(account)
    acc[group] ||= []
    acc[group].push(account)
    return acc
  }, {})
  const orderedGroups = (rows: typeof accounts, classify: (account: typeof accounts[number]) => string, order: string[]) => {
    const result = grouped(rows, classify)
    return Object.entries(result).sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
  }
  const assetGroups = orderedGroups(assets, assetGroup, ['Fixed Assets', 'Non-current Assets', 'Current Assets', 'Cash', 'Bank'])
  const liabilityGroups = orderedGroups(liabilitiesAndCapital, liabilityGroup, ['Capital', 'Long-term Liabilities', 'Short-term Liabilities', 'Other Liabilities'])

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="balance-sheet" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {balanced && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10B981', fontWeight: 600, background: '#ECFDF5', padding: '6px 12px', borderRadius: 20 }}>
              <CheckCircle size={14} /> Balance Sheet Balanced
            </span>
          )}
          <ExportMenu fullReport title="Balance Sheet" rows={[
            ...assets.map(account => ({ side: 'Assets', group: account.group, account: account.name, amount: account.balance || 0 })),
            ...liabilitiesAndCapital.map(account => ({ side: 'Liabilities & Capital', group: account.group, account: account.name, amount: account.balance || 0 })),
            ...(currentProfit !== 0 ? [{ side: 'Liabilities & Capital', group: 'Current Period', account: currentProfit > 0 ? 'Current Profit' : 'Current Loss', amount: currentProfit }] : []),
          ]} />
        </div>
      </div>

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
          <div style={{ borderRight: '1px solid #E2E8F0' }}>
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
                        <td style={{ padding: '8px 20px 8px 32px', fontSize: 13 }}>{account.name}</td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div>
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
                        <td style={{ padding: '8px 20px 8px 32px', fontSize: 13 }}>{account.name}</td>
                        <td style={{ padding: '8px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{(account.balance || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </>
                ))}
                {currentProfit !== 0 && (
                  <tr style={{ background: currentProfit > 0 ? '#F0FDF4' : '#FEF2F2', borderTop: '2px solid #E2E8F0' }}>
                    <td style={{ padding: '9px 20px 9px 32px', fontSize: 13, fontWeight: 700, color: currentProfit > 0 ? '#065F46' : '#991B1B' }}>
                      {currentProfit > 0 ? 'Current Profit' : 'Current Loss'}
                    </td>
                    <td style={{ padding: '9px 20px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800 }}>
                      {currentProfit.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', fontWeight: 800, color: 'white', background: '#1D4ED8', borderRight: '1px solid #93C5FD' }}><span>TOTAL ASSETS</span><span className="mono">{totalAssets.toLocaleString('en-IN')}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', fontWeight: 800, color: 'white', background: '#1D4ED8' }}><span>TOTAL LIABILITIES & CAPITAL</span><span className="mono">{totalLiab.toLocaleString('en-IN')}</span></div>
        </div>
        </div>
      </div>
    </div>
  )
}
