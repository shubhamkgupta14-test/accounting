import ExportMenu from '../components/ExportMenu'
import { useLedgerData } from '../context/DataContext'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { formatReportNumber } from '../lib/export'
import EmptyTableRow from '../components/EmptyTableRow'

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
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}><PageIntro id="cash-flow-report" /><ExportMenu fullReport rowsOnly title="Cash Flow Report" rows={[
      ...rows.map(row => ({ Month: row.month, [`Inflow / Dr (${currencySymbol})`]: row.inflow, [`Outflow / Cr (${currencySymbol})`]: row.outflow, [`Net Flow (${currencySymbol})`]: row.net })),
      { Month: 'Total', [`Inflow / Dr (${currencySymbol})`]: inflow, [`Outflow / Cr (${currencySymbol})`]: outflow, [`Net Flow (${currencySymbol})`]: inflow - outflow },
    ]} /></div>
    <div className="card"><table className="data-table"><thead><tr><th>Month</th><th className="num dr-heading">Inflow / Dr ({currencySymbol})</th><th className="num cr-heading">Outflow / Cr ({currencySymbol})</th><th className="num total-amount">Net Flow ({currencySymbol})</th></tr></thead>
      <tbody>{rows.length === 0 && <EmptyTableRow colSpan={4} />}{rows.map(row => <tr key={row.key}><td>{row.month}</td><td className="num dr-amount">{formatReportNumber(row.inflow)}</td><td className="num cr-amount">{formatReportNumber(row.outflow)}</td><td className="num total-amount" style={{ fontWeight: 700 }}>{formatReportNumber(row.net)}</td></tr>)}</tbody>
      <tfoot><tr><td style={{ padding: '12px 16px', fontWeight: 800 }}>Total</td><td className="num dr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{formatReportNumber(inflow)}</td><td className="num cr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{formatReportNumber(outflow)}</td><td className="num total-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{formatReportNumber(inflow - outflow)}</td></tr></tfoot>
    </table></div>
  </div>
}
