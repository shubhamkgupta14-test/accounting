import { useEffect, useState } from 'react'
import { Search, Calendar } from 'lucide-react'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type JournalEntry, type ReportPeriod } from '../lib/api'
import { DayBookSkeleton } from '../components/Loading'
import { formatReportNumber } from '../lib/export'
import { paginationConfig } from '../config/app'
import EmptyTableRow from '../components/EmptyTableRow'


export default function DayBook() {
  const { currencySymbol } = useAppSettings()
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [financialYears, setFinancialYears] = useState<ReportPeriod[]>([])
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(paginationConfig.defaultPageSize)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.financialYears().then(result => setFinancialYears(result.periods)).catch(() => setFinancialYears([]))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const selectedFy = financialYears.find(period => period.start_date === dateFilter)
      const filterFrom = dateFilter === 'custom' ? dateFrom || undefined : selectedFy?.start_date
      const filterTo = dateFilter === 'custom' ? dateTo || undefined : selectedFy?.end_date
      void api.journalsPage({ page, page_size: pageSize, search, date_from: filterFrom, date_to: filterTo, sort_by: 'date', sort_order: sortOrder })
        .then(result => {
          setEntries(result.items.map(row => ({ ...row, voucherNo: row.voucher_no, entries: row.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) })))
          setTotal(result.total)
        }).finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [dateFilter, dateFrom, dateTo, financialYears, page, pageSize, search, sortOrder])

  const paged = entries.map(e => ({
    ...e,
    totalDr: e.entries.reduce((s, r) => s + r.dr, 0),
    totalCr: e.entries.reduce((s, r) => s + r.cr, 0),
  }))
  const groupedByDate = paged.reduce<Record<string, typeof paged>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})
  const selectedFinancialPeriod = financialYears.find(period => period.start_date === dateFilter)
  const exportPeriodHeading = dateFilter === 'custom'
    ? `${dateFrom || 'Beginning'} to ${dateTo || 'Present'}`
    : selectedFinancialPeriod
      ? `FY ${selectedFinancialPeriod.start_date.slice(0, 4)}-${selectedFinancialPeriod.end_date.slice(2, 4)}`
      : 'All financial years'

  if (loading) return <DayBookSkeleton />

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="daybook" />
        <ExportMenu compact fullReport rowsOnly title="Day Book" heading={exportPeriodHeading} rows={paged.map(row => ({
          Date: row.date,
          'Voucher No.': row.voucherNo,
          Narration: row.narration,
          Accounts: row.entries.length,
          [`Debit (${currencySymbol})`]: row.totalDr,
          [`Credit (${currencySymbol})`]: row.totalCr,
        }))} />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Calendar size={14} color="#64748B" />
        <select className="select" style={{ fontSize: 13 }} value={sortOrder} onChange={e => { setSortOrder(e.target.value as 'asc' | 'desc'); setPage(1) }}>
          <option value="desc">Newest date</option><option value="asc">Oldest date</option>
        </select>
        <select className="select" style={{ fontSize: 13 }} value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1) }} aria-label="Financial year">
          <option value="all">All financial years</option>
          {financialYears.map(period => {
            const start = Number(period.start_date.slice(0, 4))
            return <option key={period.start_date} value={period.start_date}>FY {start}-{String(start + 1).slice(-2)}</option>
          })}
          <option value="custom">Custom range</option>
        </select>
        {dateFilter === 'custom' && <>
          <input type="date" min="1000-01-01" max="9999-12-31" aria-label="From date" className="input" style={{ width: 142, height: 34, fontSize: 13 }} value={dateFrom} onChange={e => { if (!e.target.value || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { setDateFrom(e.target.value); setPage(1) } }} />
          <input type="date" min={dateFrom || '1000-01-01'} max="9999-12-31" aria-label="To date" className="input" style={{ width: 142, height: 34, fontSize: 13 }} value={dateTo} onChange={e => { if (!e.target.value || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { setDateTo(e.target.value); setPage(1) } }} />
        </>}
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input className="input" style={{ paddingLeft: 30, height: 34, fontSize: 13 }}
            placeholder="Search narration or voucher…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748B' }}>
          {total} entries · {Object.keys(groupedByDate).length} days on this page
        </span>
      </div>

      {/* Grouped by date */}
      {Object.entries(groupedByDate).sort(([left], [right]) => sortOrder === 'asc' ? left.localeCompare(right) : right.localeCompare(left)).map(([date, entries]) => (
        <div key={date} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} />
              {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            <span className="badge badge-slate" style={{ fontSize: 11 }}>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Voucher No.</th>
                  <th>Narration</th>
                  <th>Accounts</th>
                  <th className="num dr-heading">Debit ({currencySymbol})</th>
                  <th className="num cr-heading">Credit ({currencySymbol})</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <>
                    <tr key={e.id} style={{ cursor: 'pointer' }}>
                      <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{e.voucherNo}</span></td>
                      <td><span className="narration-text">{e.narration}</span></td>
                      <td style={{ fontSize: 12.5, color: '#64748B' }}>{e.entries.length} lines</td>
                      <td className="num dr-amount" style={{ fontWeight: 500 }}>{formatReportNumber(e.totalDr)}</td>
                      <td className="num cr-amount" style={{ fontWeight: 500 }}>{formatReportNumber(e.totalCr)}</td>
                    </tr>
                    {/* Sub-lines */}
                    {e.entries.map((row, i) => (
                      <tr key={`${e.id}-row-${i}`} style={{ background: '#FAFBFC' }}>
                        <td style={{ paddingLeft: 32, color: '#94A3B8', fontSize: 12 }}>↳</td>
                        <td style={{ paddingLeft: 32, fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>{row.account}</td>
                        <td className="num" style={{ fontSize: 12.5, color: row.dr ? '#059669' : '#CBD5E1' }}>{row.dr ? formatReportNumber(row.dr) : '—'}</td>
                        <td className="num" style={{ fontSize: 12.5, color: row.cr ? '#DC2626' : '#CBD5E1' }}>{row.cr ? formatReportNumber(row.cr) : '—'}</td>
                        <td />
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {total === 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher No.</th>
                <th>Narration</th>
                <th>Accounts</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
              <EmptyTableRow colSpan={5} />
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && <div className="card"><TablePagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} /></div>}
    </div>
  )
}
