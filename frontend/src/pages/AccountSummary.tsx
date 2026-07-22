import { Fragment } from 'react'
import ExportMenu from '../components/ExportMenu'
import { useLedgerData } from '../context/DataContext'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import AccountDrilldown from '../components/AccountDrilldown'
import { formatReportNumber } from '../lib/export'
import EmptyTableRow from '../components/EmptyTableRow'

export default function AccountSummary() {
  const { accounts } = useLedgerData()
  const { currencySymbol } = useAppSettings()
  const groups = accounts.reduce<Record<string, typeof accounts>>((result, account) => {
    ;(result[account.type] ||= []).push(account)
    return result
  }, {})
  const total = accounts.reduce((sum, account) => sum + Math.abs(account.balance || 0), 0)
  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
      <PageIntro id="account-summary" />
      <ExportMenu fullReport rowsOnly title="Account Summary" rows={[
        ...accounts.map(a => ({ 'A/c Code': a.code, 'Account Name': a.name, Type: a.type, Group: a.group, [`Balance (${currencySymbol})`]: a.balance || 0 })),
        { 'A/c Code': '', 'Account Name': 'Total', Type: '', Group: '', [`Balance (${currencySymbol})`]: total },
      ]} />
    </div>
    <div className="card"><table className="data-table"><thead><tr><th>Type / Account</th><th>Group</th><th className="num total-amount">Balance ({currencySymbol})</th></tr></thead>
      <tbody>{accounts.length === 0 && <EmptyTableRow colSpan={3} />}{Object.entries(groups).map(([type, rows]) => <Fragment key={type}>
        <tr style={{ background: '#F8FAFC' }}><td colSpan={3} style={{ fontWeight: 700 }}>{type}</td></tr>
        {rows.map(a => <tr key={a.id}><td style={{ paddingLeft: 32 }}><AccountDrilldown account={a.name} /></td><td><span className="group-text">{a.group}</span></td><td className={`num ${['Asset', 'Expense'].includes(a.type) ? 'dr-amount' : 'cr-amount'}`}>{formatReportNumber(Math.abs(a.balance || 0))}</td></tr>)}
      </Fragment>)}</tbody>
      <tfoot><tr><td colSpan={2} style={{ padding: '12px 16px', fontWeight: 800 }}>Total Account Balances</td><td className="num total-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{formatReportNumber(total)}</td></tr></tfoot>
    </table></div>
  </div>
}
