import { useEffect, useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { api, type LedgerRow } from '../lib/api'
import type { PageId } from '../App'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import TablePagination from '../components/TablePagination'
import { useAppSettings } from '../context/SettingsContext'

interface Props {
  onNavigate?: (page: PageId) => void
}

export default function Ledger({ onNavigate }: Props) {
  const { accounts } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const { canWrite } = useAuth()
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const selectedName = selected || accounts[0]?.name || ''
  const account = accounts.find(a => a.name === selectedName) || accounts[0]
  const filteredAccounts = accounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.group.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (!selectedName) {
      setRows([])
      return
    }
    setLoading(true)
    api.ledger(selectedName)
      .then(data => setRows(data.map(row => ({ ...row, voucherNo: row.voucher_no, dr: row.debit, cr: row.credit }))))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [selectedName])

  const totalDr = rows.reduce((s, r) => s + r.dr, 0)
  const totalCr = rows.reduce((s, r) => s + r.cr, 0)
  const closingBalance = rows[rows.length - 1]?.balance ?? 0
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize)

  if (!account) {
    return (
      <div>
        <div className="page-header">
          <PageIntro id="ledger" />
        </div>
        <div className="card empty-state">No accounts found. Create accounts in Chart of Accounts first.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="ledger" />
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportMenu title={`${account?.name || 'Ledger'} Ledger`} rows={rows.map(row => ({
            date: row.date, particulars: row.particulars, voucher_no: row.voucherNo,
            type: row.type, debit: row.dr, credit: row.cr, balance: row.balance,
          }))} />
          {onNavigate && canWrite && (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => onNavigate('chart-of-accounts')}>
              Add Ledger Account
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card" style={{ height: 'fit-content', maxHeight: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input className="input" style={{ paddingLeft: 28, height: 32, fontSize: 12.5 }}
                placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(type => {
              const grouped = filteredAccounts.filter(a => a.type === type)
              if (!grouped.length) return null
              return (
                <div key={type}>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{type}</div>
                  {grouped.map(a => (
                    <div key={a.id}
                      onClick={() => { setSelected(a.name); setPage(1) }}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: selectedName === a.name ? '#EFF6FF' : 'transparent',
                        borderLeft: selectedName === a.name ? '3px solid #2563EB' : '3px solid transparent',
                        transition: 'all 0.1s'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: selectedName === a.name ? 600 : 400, color: selectedName === a.name ? '#1D4ED8' : '#0F172A' }}>{a.name}</div>
                        <div className="narration-text">{a.group}</div>
                      </div>
                      {selectedName === a.name && <ChevronRight size={12} color="#2563EB" />}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{account.name}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span className="badge badge-blue">{account.type}</span>
                  <span className="badge badge-slate">{account.group}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>A/c Code: {account.id}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 2 }}>Closing Balance</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color: closingBalance >= 0 ? '#10B981' : '#EF4444' }}>
                  {formatMoney(Math.abs(closingBalance))}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{closingBalance >= 0 ? 'Dr' : 'Cr'}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Particulars</th>
                  <th>Voucher No.</th>
                  <th>Type</th>
                  <th className="num dr-heading">Debit ({currencySymbol})</th>
                  <th className="num cr-heading">Credit ({currencySymbol})</th>
                  <th className="num total-amount">Balance ({currencySymbol})</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, i) => (
                  <tr key={`${r.voucherNo}-${i}`}>
                    <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(r.date)}</span></td>
                    <td><span className="narration-text">{r.particulars}</span></td>
                    <td><span className="mono" style={{ fontSize: 12.5, color: '#64748B' }}>{r.voucherNo}</span></td>
                    <td><span className={`badge ${r.type === 'Receipt' ? 'badge-green' : 'badge-red'}`}>{r.type}</span></td>
                    <td className="num" style={{ color: r.dr ? '#059669' : '#CBD5E1' }}>{r.dr ? r.dr.toLocaleString('en-IN') : '-'}</td>
                    <td className="num" style={{ color: r.cr ? '#DC2626' : '#CBD5E1' }}>{r.cr ? r.cr.toLocaleString('en-IN') : '-'}</td>
                    <td className="num total-amount" style={{ fontWeight: 600 }}>{Math.abs(r.balance).toLocaleString('en-IN')} {r.balance >= 0 ? 'Dr' : 'Cr'}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7}><div className="empty-state" style={{ padding: '36px 20px' }}>No journal entries posted for this account.</div></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td colSpan={4} style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700 }}>Totals</td>
                  <td className="num dr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{totalDr.toLocaleString('en-IN')}</td>
                  <td className="num cr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{totalCr.toLocaleString('en-IN')}</td>
                  <td className="num total-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{Math.abs(closingBalance).toLocaleString('en-IN')} {closingBalance >= 0 ? 'Dr' : 'Cr'}</td>
                </tr>
              </tfoot>
            </table>
            <TablePagination total={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
          </div>
        </div>
      </div>
    </div>
  )
}
