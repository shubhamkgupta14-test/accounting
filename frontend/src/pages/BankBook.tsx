import { useState } from 'react'
import { TrendingUp, TrendingDown, Landmark, Scale } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import TablePagination from '../components/TablePagination'
import { useAppSettings } from '../context/SettingsContext'
import { formatReportNumber } from '../lib/export'
import { paginationConfig } from '../config/app'
import EmptyTableRow from '../components/EmptyTableRow'

export default function BankBook() {
  const { bankTransactions, accounts } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const bankAccounts = accounts.filter(account =>
    account.type === 'Asset' &&
    (['bank', 'bank accounts'].includes(account.group.toLowerCase()) || account.name.toLowerCase().includes('bank'))
  )
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const financialYears = Array.from(new Set(bankTransactions.map(row => financialYearStart(row.date)))).sort((a, b) => b - a)
  const filtered = bankTransactions.filter(row => inSelectedPeriod(row.date, dateFilter, dateFrom, dateTo))
  const receipts = filtered.filter(r => r.type === 'Receipt')
  const payments = filtered.filter(r => r.type === 'Payment')
  const closing = filtered[filtered.length - 1]?.balance ?? 0
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(paginationConfig.defaultPageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const exportHeading = dateFilter === 'custom' ? `${dateFrom || 'Beginning'} to ${dateTo || 'Present'}` : dateFilter === 'all' ? 'All financial years' : `FY ${dateFilter}-${String(Number(dateFilter) + 1).slice(-2)}`

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="bankbook" />
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportMenu fullReport rowsOnly title="Bank Book" heading={exportHeading} rows={filtered.map(row => ({
            Date: row.date,
            Particulars: row.particulars,
            'Voucher No.': row.voucherNo,
            Type: row.type,
            [`Debit (${currencySymbol})`]: row.dr,
            [`Credit (${currencySymbol})`]: row.cr,
            [`Balance (${currencySymbol})`]: row.balance,
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
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="select" style={{ fontSize: 13 }} value={dateFilter} onChange={event => { setDateFilter(event.target.value); setPage(1) }}>
            <option value="all">All financial years</option>
            {financialYears.map(start => <option key={start} value={start}>FY {start}-{String(start + 1).slice(-2)}</option>)}
            <option value="custom">Custom range</option>
          </select>
          {dateFilter === 'custom' && <>
            <input type="date" min="1000-01-01" max="9999-12-31" className="input" style={{ width: 142, height: 34, fontSize: 13 }} value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1) }} />
            <input type="date" min={dateFrom || '1000-01-01'} max="9999-12-31" className="input" style={{ width: 142, height: 34, fontSize: 13 }} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1) }} />
          </>}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748B' }}>{filtered.length} entries</span>
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
                  <td className="num" style={{ color: r.dr ? '#059669' : '#CBD5E1' }}>{r.dr ? formatReportNumber(r.dr) : '-'}</td>
                  <td className="num" style={{ color: r.cr ? '#DC2626' : '#CBD5E1' }}>{r.cr ? formatReportNumber(r.cr) : '-'}</td>
                  <td className="num total-amount" style={{ fontWeight: 600 }}>{formatReportNumber(r.balance)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <EmptyTableRow colSpan={7} />}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} style={{ padding: '11px 16px', fontWeight: 700 }}>Closing Balance</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#059669' }}>{formatReportNumber(receipts.reduce((s, r) => s + r.dr, 0))}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#DC2626' }}>{formatReportNumber(payments.reduce((s, r) => s + r.cr, 0))}</td>
                <td className="num" style={{ padding: '11px 16px', fontWeight: 700, color: '#2563EB' }}>{formatReportNumber(closing)}</td>
              </tr>
            </tfoot>
          </table>
          <TablePagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
        </div>
      </div>
    </div>
  )
}

function financialYearStart(value: string) {
  const date = value.slice(0, 10)
  const year = Number(date.slice(0, 4))
  return Number(date.slice(5, 7)) >= 4 ? year : year - 1
}

function inSelectedPeriod(value: string, filter: string, from: string, to: string) {
  const date = value.slice(0, 10)
  if (filter === 'custom') return (!from || date >= from) && (!to || date <= to)
  if (filter === 'all') return true
  const start = Number(filter)
  return date >= `${start}-04-01` && date <= `${start + 1}-03-31`
}
