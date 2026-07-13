import { useEffect, useState } from 'react'
import { Search, Calendar } from 'lucide-react'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type JournalEntry } from '../lib/api'
import { DayBookSkeleton } from '../components/Loading'


export default function DayBook() {
  const { currencySymbol } = useAppSettings()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api.journalsPage({ page, page_size: pageSize, search, date_from: dateFrom || undefined, date_to: dateTo || undefined, sort_by: 'date', sort_order: 'desc' })
        .then(result => {
          setEntries(result.items.map(row => ({ ...row, voucherNo: row.voucher_no, entries: row.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) })))
          setTotal(result.total)
        }).finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [dateFrom, dateTo, page, pageSize, search])

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

  if (loading) return <DayBookSkeleton />

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="daybook" />
        <ExportMenu title="Day Book" rows={paged.map(row => ({
          date: row.date,
          voucher_no: row.voucherNo,
          narration: row.narration,
          debit: row.totalDr,
          credit: row.totalCr,
          status: row.status,
        }))} />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} color="#64748B" />
          <label style={{ fontSize: 12.5, color: '#64748B' }}>From</label>
          <input type="date" className="input" style={{ height: 34 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12.5, color: '#64748B' }}>To</label>
          <input type="date" className="input" style={{ height: 34 }} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </div>
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
      {Object.entries(groupedByDate).sort().map(([date, entries]) => (
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <>
                    <tr key={e.id} style={{ cursor: 'pointer' }}>
                      <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{e.voucherNo}</span></td>
                      <td><span className="narration-text">{e.narration}</span></td>
                      <td style={{ fontSize: 12.5, color: '#64748B' }}>{e.entries.length} lines</td>
                      <td className="num dr-amount" style={{ fontWeight: 500 }}>{e.totalDr.toLocaleString('en-IN')}</td>
                      <td className="num cr-amount" style={{ fontWeight: 500 }}>{e.totalCr.toLocaleString('en-IN')}</td>
                      <td><span className={`badge ${e.status === 'Posted' ? 'badge-green' : 'badge-amber'}`}>{e.status}</span></td>
                    </tr>
                    {/* Sub-lines */}
                    {e.entries.map((row, i) => (
                      <tr key={`${e.id}-row-${i}`} style={{ background: '#FAFBFC' }}>
                        <td style={{ paddingLeft: 32, color: '#94A3B8', fontSize: 12 }}>↳</td>
                        <td style={{ paddingLeft: 32, fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>{row.account}</td>
                        <td />
                        <td className="num" style={{ fontSize: 12.5, color: row.dr ? '#059669' : '#CBD5E1' }}>{row.dr ? row.dr.toLocaleString('en-IN') : '—'}</td>
                        <td className="num" style={{ fontSize: 12.5, color: row.cr ? '#DC2626' : '#CBD5E1' }}>{row.cr ? row.cr.toLocaleString('en-IN') : '—'}</td>
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
        <div className="empty-state card">
          <Calendar size={32} />
          <p>No entries found for the selected date range</p>
        </div>
      )}
      {total > 0 && <div className="card"><TablePagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} /></div>}
    </div>
  )
}
