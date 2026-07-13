import { useState } from 'react'
import { TrendingUp, TrendingDown, Landmark, Scale } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import TablePagination from '../components/TablePagination'
import { useAppSettings } from '../context/SettingsContext'

export default function BankBook() {
  const { bankTransactions, accounts } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const bankAccounts = accounts.filter(account => account.group === 'Bank')
  const receipts = bankTransactions.filter(r => r.type === 'Receipt')
  const payments = bankTransactions.filter(r => r.type === 'Payment')
  const closing = bankTransactions[bankTransactions.length - 1]?.balance ?? 0
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const paged = bankTransactions.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="bankbook" />
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportMenu title="Bank Book" rows={bankTransactions.map(row => ({
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
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Landmark size={13} /> Bank Accounts</div>
          <div className="value" style={{ fontSize: 20, color: '#2563EB' }}>{bankAccounts.length}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><TrendingUp size={13} color="#10B981" /> Total Receipts</div>
          <div className="value" style={{ fontSize: 20, color: '#10B981' }}>{formatMoney(receipts.reduce((s, r) => s + r.dr, 0))}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><TrendingDown size={13} color="#EF4444" /> Total Payments</div>
          <div className="value" style={{ fontSize: 20, color: '#EF4444' }}>{formatMoney(payments.reduce((s, r) => s + r.cr, 0))}</div>
        </div>
        <div className="card stat-card">
          <div className="label" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Scale size={13} /> Closing Balance</div>
          <div className="value" style={{ fontSize: 20, color: '#2563EB' }}>{formatMoney(closing)}</div>
        </div>
      </div>

      <div className="card">
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
              {bankTransactions.length === 0 && (
                <tr>
                  <td colSpan={7}><div className="empty-state" style={{ padding: '36px 20px' }}>No bank transactions yet.</div></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} style={{ padding: '11px 16px', fontWeight: 700 }}>Closing Balance</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#059669' }}>{receipts.reduce((s, r) => s + r.dr, 0).toLocaleString('en-IN')}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#DC2626' }}>{payments.reduce((s, r) => s + r.cr, 0).toLocaleString('en-IN')}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#2563EB' }}>{closing.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>
          <TablePagination total={bankTransactions.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
        </div>
      </div>
    </div>
  )
}
