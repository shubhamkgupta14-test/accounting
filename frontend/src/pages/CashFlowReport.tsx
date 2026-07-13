import ExportMenu from '../components/ExportMenu'
import { useLedgerData } from '../context/DataContext'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'

export default function CashFlowReport() {
  const { cashTransactions, bankTransactions } = useLedgerData()
  const { currencySymbol } = useAppSettings()
  const rows = Object.values([...cashTransactions, ...bankTransactions].reduce<Record<string, { key: string; month: string; inflow: number; outflow: number }>>((result, entry) => {
    const key = entry.date.slice(0, 7)
    result[key] ||= { key, month: new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' }), inflow: 0, outflow: 0 }
    result[key].inflow += entry.debit
    result[key].outflow += entry.credit
    return result
  }, {})).sort((a, b) => a.key.localeCompare(b.key)).map(row => ({ ...row, net: row.inflow - row.outflow }))
  const inflow = rows.reduce((s, r) => s + r.inflow, 0), outflow = rows.reduce((s, r) => s + r.outflow, 0)
  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}><PageIntro id="cash-flow-report" /><ExportMenu title="Cash Flow Report" rows={rows} /></div>
    <div className="card"><table className="data-table"><thead><tr><th>Month</th><th className="num dr-heading">Inflow / Dr ({currencySymbol})</th><th className="num cr-heading">Outflow / Cr ({currencySymbol})</th><th className="num total-amount">Net Flow ({currencySymbol})</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><td>{row.month}</td><td className="num dr-amount">{row.inflow.toLocaleString('en-IN')}</td><td className="num cr-amount">{row.outflow.toLocaleString('en-IN')}</td><td className="num total-amount" style={{ fontWeight: 700 }}>{row.net.toLocaleString('en-IN')}</td></tr>)}</tbody>
      <tfoot><tr><td style={{ padding: '12px 16px', fontWeight: 800 }}>Total</td><td className="num dr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{inflow.toLocaleString('en-IN')}</td><td className="num cr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{outflow.toLocaleString('en-IN')}</td><td className="num total-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{(inflow - outflow).toLocaleString('en-IN')}</td></tr></tfoot>
    </table></div>
  </div>
}
