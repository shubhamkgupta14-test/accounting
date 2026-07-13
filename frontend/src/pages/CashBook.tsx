import { useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, Scale } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import TablePagination from '../components/TablePagination'
import { useAppSettings } from '../context/SettingsContext'

export default function CashBook() {
  const { cashTransactions } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const [view, setView] = useState<'all' | 'receipts' | 'payments'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filtered = cashTransactions.filter(r =>
    view === 'all' ? true : view === 'receipts' ? r.type === 'Receipt' : r.type === 'Payment'
  )
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const receipts = cashTransactions.filter(r => r.type === 'Receipt')
  const payments = cashTransactions.filter(r => r.type === 'Payment')
  const totalDr = cashTransactions.reduce((s, r) => s + r.dr, 0)
  const totalCr = cashTransactions.reduce((s, r) => s + r.cr, 0)
  const opening = cashTransactions.length ? cashTransactions[0].balance - cashTransactions[0].dr + cashTransactions[0].cr : 0
  const closing = cashTransactions[cashTransactions.length - 1]?.balance ?? 0

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="cashbook" />
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportMenu title="Cash Book" rows={filtered.map(row => ({
            date: row.date,
            particulars: row.particulars,
            voucher_no: row.voucherNo,
            type: row.type,
            debit: row.dr,
            credit: row.cr,
            balance: row.balance,
          }))} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Opening Balance', value: opening, color: '#64748B', icon: <Wallet size={16} /> },
          { label: 'Total Receipts', value: receipts.reduce((s, r) => s + r.dr, 0), color: '#10B981', icon: <TrendingUp size={16} /> },
          { label: 'Total Payments', value: payments.reduce((s, r) => s + r.cr, 0), color: '#EF4444', icon: <TrendingDown size={16} /> },
          { label: 'Closing Balance', value: closing, color: '#2563EB', icon: <Scale size={16} /> },
        ].map(s => (
          <div key={s.label} className="card stat-card">
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {s.icon && <span style={{ color: s.color }}>{s.icon}</span>} {s.label}
            </div>
            <div className="value" style={{ fontSize: 20, color: s.color }}>
              {formatMoney(s.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
            {(['all', 'receipts', 'payments'] as const).map(v => (
              <button key={v} className="btn"
                style={{
                  background: view === v ? 'white' : 'transparent',
                  color: view === v ? '#0F172A' : '#64748B',
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  padding: '5px 14px', fontSize: 12.5, fontWeight: view === v ? 600 : 400,
                  border: 'none'
                }}
                onClick={() => { setView(v); setPage(1) }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12.5, color: '#64748B' }}>
            <span><span style={{ color: '#10B981', fontWeight: 600 }}>{receipts.length}</span> receipts</span>
            <span><span style={{ color: '#EF4444', fontWeight: 600 }}>{payments.length}</span> payments</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Voucher No.</th>
                <th>Type</th>
                <th className="num dr-heading">Receipts Dr ({currencySymbol})</th>
                <th className="num cr-heading">Payments Cr ({currencySymbol})</th>
                <th className="num total-amount">Balance ({currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => (
                <tr key={i}>
                  <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(r.date)}</span></td>
                  <td><span className="narration-text">{r.particulars}</span></td>
                  <td><span className="mono" style={{ fontSize: 12.5, color: '#64748B' }}>{r.voucherNo}</span></td>
                  <td><span className={`badge ${r.type === 'Receipt' ? 'badge-green' : 'badge-red'}`}>{r.type}</span></td>
                  <td className="num" style={{ color: r.dr ? '#059669' : '#CBD5E1' }}>{r.dr ? r.dr.toLocaleString('en-IN') : '-'}</td>
                  <td className="num" style={{ color: r.cr ? '#DC2626' : '#CBD5E1' }}>{r.cr ? r.cr.toLocaleString('en-IN') : '-'}</td>
                  <td className="num total-amount" style={{ fontWeight: 600 }}>{r.balance.toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}><div className="empty-state" style={{ padding: '36px 20px' }}>No cash transactions yet.</div></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} style={{ padding: '11px 16px', fontWeight: 700 }}>Closing Balance</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#059669' }}>{totalDr.toLocaleString('en-IN')}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#DC2626' }}>{totalCr.toLocaleString('en-IN')}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#2563EB' }}>{closing.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>
          <TablePagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
        </div>
      </div>
    </div>
  )
}
