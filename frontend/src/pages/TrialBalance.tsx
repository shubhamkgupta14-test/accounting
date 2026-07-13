import { useState } from 'react'
import { CheckCircle, CircleDollarSign, ReceiptText, Scale } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'

export default function TrialBalance() {
  const { accounts } = useLedgerData()
  const { formatMoney, currencySymbol } = useAppSettings()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const trialData = accounts.map(a => {
    const balance = a.balance || 0
    const debitNature = ['Asset', 'Expense'].includes(a.type)
    return {
      ...a,
      debit: (debitNature && balance >= 0) || (!debitNature && balance < 0) ? Math.abs(balance) : 0,
      credit: (!debitNature && balance >= 0) || (debitNature && balance < 0) ? Math.abs(balance) : 0,
    }
  })

  const filtered = trialData.filter(r =>
    (typeFilter === 'All' || r.type === typeFilter) &&
    (r.name.toLowerCase().includes(search.toLowerCase()) || r.group.toLowerCase().includes(search.toLowerCase()))
  )
  const totalDr = filtered.reduce((s, r) => s + r.debit, 0)
  const totalCr = filtered.reduce((s, r) => s + r.credit, 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.005

  const typeOrder = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="trial-balance" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {balanced && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10B981', fontWeight: 600, background: '#ECFDF5', padding: '6px 12px', borderRadius: 20 }}>
              <CheckCircle size={14} /> Trial Balance Matched
            </span>
          )}
          <ExportMenu fullReport title="Trial Balance" rows={filtered.map(row => ({
            code: row.id,
            account: row.name,
            type: row.type,
            group: row.group,
            debit: row.debit,
            credit: row.credit,
          }))} />
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><ReceiptText size={13} /> Total Debit</div>
          <div className="value" style={{ fontSize: 22, color: '#2563EB' }}>{formatMoney(totalDr)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><CircleDollarSign size={13} /> Total Credit</div>
          <div className="value" style={{ fontSize: 22, color: '#7C3AED' }}>{formatMoney(totalCr)}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Scale size={13} /> Difference</div>
          <div className="value" style={{ fontSize: 22, color: balanced ? '#10B981' : '#EF4444' }}>
            {formatMoney(Math.abs(totalDr - totalCr))}
          </div>
          <div style={{ fontSize: 12, color: balanced ? '#10B981' : '#EF4444', marginTop: 4 }}>
            {balanced ? '✓ Balanced' : '⚠ Not Balanced'}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 10 }}>
          <input className="input" style={{ maxWidth: 280, height: 34, fontSize: 13 }}
            placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="select" style={{ fontSize: 13 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="All">All Types</option>
            {typeOrder.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>A/c Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Group</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
              {typeOrder.map(type => {
                const rows = filtered.filter(r => r.type === type)
                if (!rows.length) return null
                const subDr = rows.reduce((s, r) => s + r.debit, 0)
                const subCr = rows.reduce((s, r) => s + r.credit, 0)
                return (
                  <>
                    <tr key={`group-${type}`} style={{ background: '#F8FAFC' }}>
                      <td colSpan={4} style={{ padding: '8px 16px', fontSize: 11.5, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{type}</td>
                      <td className="num" style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{subDr ? subDr.toLocaleString('en-IN') : '—'}</td>
                      <td className="num" style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#7C3AED' }}>{subCr ? subCr.toLocaleString('en-IN') : '—'}</td>
                    </tr>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td><span className="mono" style={{ fontSize: 12, color: '#64748B' }}>{r.id}</span></td>
                        <td style={{ paddingLeft: 28 }}>{r.name}</td>
                        <td><span className="badge badge-slate" style={{ fontSize: 11 }}>{r.type}</span></td>
                        <td><span className="group-text">{r.group}</span></td>
                        <td className="num" style={{ color: r.debit ? '#059669' : '#CBD5E1' }}>{r.debit ? r.debit.toLocaleString('en-IN') : '—'}</td>
                        <td className="num" style={{ color: r.credit ? '#DC2626' : '#CBD5E1' }}>{r.credit ? r.credit.toLocaleString('en-IN') : '—'}</td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14 }}>Grand Total</td>
                <td className="num total-amount" style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 14 }}>{totalDr.toLocaleString('en-IN')}</td>
                <td className="num total-amount" style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 14 }}>{totalCr.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
