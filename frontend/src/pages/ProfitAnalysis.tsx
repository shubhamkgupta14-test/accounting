import ExportMenu from '../components/ExportMenu'
import { useLedgerData } from '../context/DataContext'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'

export default function ProfitAnalysis() {
  const { accounts, journalEntries } = useLedgerData()
  const { currencySymbol } = useAppSettings()
  const typeOf = (name: string) => accounts.find(a => a.name === name)?.type
  const rows = Object.values(journalEntries.filter(j => j.status === 'Posted').reduce<Record<string, { key: string; month: string; income: number; expenses: number }>>((result, journal) => {
    const key = journal.date.slice(0, 7)
    result[key] ||= { key, month: new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' }), income: 0, expenses: 0 }
    journal.entries.forEach(line => {
      if (typeOf(line.account) === 'Income') result[key].income += line.credit - line.debit
      if (typeOf(line.account) === 'Expense') result[key].expenses += line.debit - line.credit
    })
    return result
  }, {})).sort((a, b) => a.key.localeCompare(b.key)).map(row => ({ ...row, profit: row.income - row.expenses }))
  const income = rows.reduce((s, r) => s + r.income, 0), expenses = rows.reduce((s, r) => s + r.expenses, 0)
  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}><PageIntro id="profit-analysis" /><ExportMenu fullReport rowsOnly title="Profit Analysis" rows={[
      ...rows.map(row => ({ Month: row.month, [`Income (${currencySymbol})`]: row.income, [`Expenses (${currencySymbol})`]: row.expenses, [`Net Profit / Loss (${currencySymbol})`]: row.profit })),
      { Month: 'Total', [`Income (${currencySymbol})`]: income, [`Expenses (${currencySymbol})`]: expenses, [`Net Profit / Loss (${currencySymbol})`]: income - expenses },
    ]} /></div>
    <div className="card"><table className="data-table"><thead><tr><th>Month</th><th className="num dr-heading">Income ({currencySymbol})</th><th className="num cr-heading">Expenses ({currencySymbol})</th><th className="num total-amount">Net Profit / Loss ({currencySymbol})</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><td>{row.month}</td><td className="num dr-amount">{row.income.toLocaleString('en-IN')}</td><td className="num cr-amount">{row.expenses.toLocaleString('en-IN')}</td><td className="num total-amount" style={{ fontWeight: 700 }}>{row.profit.toLocaleString('en-IN')}</td></tr>)}</tbody>
      <tfoot><tr><td style={{ padding: '12px 16px', fontWeight: 800 }}>Total</td><td className="num dr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{income.toLocaleString('en-IN')}</td><td className="num cr-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{expenses.toLocaleString('en-IN')}</td><td className="num total-amount" style={{ padding: '12px 16px', fontWeight: 800 }}>{(income - expenses).toLocaleString('en-IN')}</td></tr></tfoot>
    </table></div>
  </div>
}
