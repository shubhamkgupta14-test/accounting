import { Fragment, useEffect, useState } from 'react'
import { Plus, Trash2, Search, ChevronDown, ChevronUp, X, Pencil } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import NarrationSuggest from '../components/NarrationSuggest'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type JournalEntry } from '../lib/api'
import { Spinner, TableSkeletonRows } from '../components/Loading'

interface EntryRow { account: string; dr: number; cr: number }
interface JournalForm {
  date: string; voucherNo: string; narration: string; rows: EntryRow[]
}

const emptyForm = (count: number): JournalForm => ({
  date: new Date().toISOString().slice(0, 10),
  voucherNo: `JV-${String(count + 1).padStart(3, '0')}`,
  narration: '',
  rows: [{ account: '', dr: 0, cr: 0 }, { account: '', dr: 0, cr: 0 }]
})

export default function JournalEntries() {
  const { accounts, createJournal } = useLedgerData()
  const { formatDate, currencySymbol } = useAppSettings()
  const { canWrite } = useAuth()
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<'Draft' | 'Posted'>('Draft')
  const [form, setForm] = useState<JournalForm>(emptyForm(0))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('date-desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filtered, setFiltered] = useState<JournalEntry[]>([])
  const [totalEntries, setTotalEntries] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadingRows, setLoadingRows] = useState(true)

  const paged = filtered

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingRows(true)
      const [sort_by, sort_order] = sortBy === 'voucher' ? ['voucher_no', 'asc'] : ['date', sortBy === 'date-asc' ? 'asc' : 'desc']
      api.journalsPage({ page, page_size: pageSize, search, status: statusFilter === 'All' ? undefined : statusFilter, sort_by, sort_order })
        .then(result => {
          setFiltered(result.items.map(row => ({ ...row, voucherNo: row.voucher_no, entries: row.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) })))
          setTotalEntries(result.total)
        }).catch(() => { setFiltered([]); setTotalEntries(0) }).finally(() => setLoadingRows(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [page, pageSize, reloadKey, search, sortBy, statusFilter])

  const totalDr = (rows: EntryRow[]) => rows.reduce((s, r) => s + (Number(r.dr) || 0), 0)
  const totalCr = (rows: EntryRow[]) => rows.reduce((s, r) => s + (Number(r.cr) || 0), 0)
  const filledRows = form.rows.filter(row => row.account.trim() || Number(row.dr) > 0 || Number(row.cr) > 0)
  const balanced = Math.abs(totalDr(filledRows) - totalCr(filledRows)) < 0.005 && totalDr(filledRows) > 0
  const rowsHaveAccounts = filledRows.length >= 2 && filledRows.every(row => row.account.trim())
  const rowsHaveOneSideOnly = filledRows.every(row => {
    const debit = Number(row.dr) || 0
    const credit = Number(row.cr) || 0
    return (debit > 0 || credit > 0) && !(debit > 0 && credit > 0)
  })
  const canSubmit = canWrite && accounts.length > 0 && balanced && rowsHaveAccounts && rowsHaveOneSideOnly && Boolean(form.narration.trim())
  const selectedAccounts = filledRows.map(row => accounts.find(account => account.name === row.account)).filter(Boolean)
  const paymentMode = selectedAccounts.some(account => account?.name.toLowerCase().includes('cash'))
    ? 'by cash'
    : selectedAccounts.some(account => account?.group.toLowerCase() === 'bank')
      ? 'through bank'
      : 'on credit'
  const expenseName = selectedAccounts.find(account => account?.type === 'Expense')?.name
  const incomeName = selectedAccounts.find(account => account?.type === 'Income')?.name
  const party = selectedAccounts.find(account => ['Accounts Receivable', 'Sundry Debtors', 'Accounts Payable', 'Sundry Creditors'].includes(account?.name || ''))?.name

  const addRow = () => setForm(f => ({ ...f, rows: [...f.rows, { account: '', dr: 0, cr: 0 }] }))
  const removeRow = (i: number) => setForm(f => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }))
  const updateRow = (i: number, field: keyof EntryRow, value: string | number) =>
    setForm(f => ({ ...f, rows: f.rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r) }))

  const openCreateForm = () => {
    setEditingId(null)
    setEditingStatus('Draft')
    setForm(emptyForm(totalEntries))
    setError('')
    setShowForm(true)
  }

  const openEditForm = (entry: JournalEntry) => {
    setEditingId(entry.id)
    setEditingStatus(entry.status)
    setForm({
      date: entry.date.slice(0, 10),
      voucherNo: entry.voucherNo || entry.voucher_no,
      narration: entry.narration,
      rows: entry.entries.map(line => ({
        account: line.account,
        dr: Number(line.debit ?? line.dr) || 0,
        cr: Number(line.credit ?? line.cr) || 0,
      })),
    })
    setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteEntry = async (entry: JournalEntry) => {
    const voucherNo = entry.voucherNo || entry.voucher_no
    if (!window.confirm(`Delete journal entry ${voucherNo}? This action cannot be undone.`)) return
    try {
      await api.deleteJournal(entry.id)
      if (expanded === entry.id) setExpanded(null)
      if (filtered.length === 1 && page > 1) setPage(current => current - 1)
      else setReloadKey(key => key + 1)
      showToast('success', `Journal entry ${voucherNo} deleted successfully.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to delete journal entry.')
    }
  }

  const saveEntry = async (status: 'Draft' | 'Posted') => {
    if (!canSubmit) {
      const message = 'Select at least two valid account rows, enter narration, and make sure debit and credit totals match.'
      setError(message)
      showToast('error', message)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        date: form.date,
        voucher_no: form.voucherNo,
        narration: form.narration.trim(),
        status,
        entries: filledRows.map(row => ({ account: row.account.trim(), debit: Number(row.dr) || 0, credit: Number(row.cr) || 0 })),
      }
      if (editingId) await api.updateJournal(editingId, payload)
      else await createJournal(payload)
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm(totalEntries + 1))
      setReloadKey(key => key + 1)
      showToast('success', editingId ? 'Journal entry updated successfully.' : status === 'Posted' ? 'Journal entry posted successfully.' : 'Journal entry saved as draft.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save journal entry.'
      setError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="journal" />
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportMenu title="Journal Entries" rows={filtered.map(row => ({
            voucher_no: row.voucherNo,
            date: row.date,
            narration: row.narration,
            debit: row.entries.reduce((sum, line) => sum + line.dr, 0),
            credit: row.entries.reduce((sum, line) => sum + line.cr, 0),
            status: row.status,
          }))} />
          {canWrite && (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openCreateForm}>
              <Plus size={14} /> New Entry
            </button>
          )}
        </div>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{editingId ? 'Edit Journal Entry' : 'New Journal Entry'}</h3>
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => { setShowForm(false); setEditingId(null) }}>
              <X size={16} />
            </button>
          </div>

          {accounts.length === 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#92400E', fontSize: 13 }}>
              No accounts exist yet. Create at least two accounts in Chart of Accounts before posting a journal entry.
            </div>
          )}

          {/* Header fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label className="form-label required">Date</label>
              <input type="date" className="input" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label required">Voucher No.</label>
              <input className="input" value={form.voucherNo}
                onChange={e => setForm(f => ({ ...f, voucherNo: e.target.value }))} />
            </div>
            <div>
              <label className="form-label required">Narration</label>
              <input className="input" placeholder="Example: Being cash sales recorded"
                value={form.narration}
                onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} />
              <NarrationSuggest
                value={form.narration}
                context={{ voucherType: 'Journal', paymentMode, party, expenseName, incomeName }}
                onPick={narration => setForm(f => ({ ...f, narration }))}
              />
            </div>
          </div>

          {/* DR/CR rows */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', width: '50%' }}>Account *</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', letterSpacing: '0.05em', textTransform: 'uppercase', width: '20%' }}>Debit ({currencySymbol})</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', letterSpacing: '0.05em', textTransform: 'uppercase', width: '20%' }}>Credit ({currencySymbol})</th>
                  <th style={{ width: '10%' }} />
                </tr>
              </thead>
              <tbody>
                {form.rows.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '8px 14px' }}>
                      <select className="select" style={{ width: '100%' }} value={row.account}
                        onChange={e => updateRow(i, 'account', e.target.value)}>
                        <option value="">Select account…</option>
                        {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <input className="input mono" style={{ textAlign: 'right', color: '#059669' }}
                        type="number" min="0" value={row.dr || ''}
                        placeholder="0"
                        onChange={e => updateRow(i, 'dr', Number(e.target.value))} />
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <input className="input mono" style={{ textAlign: 'right', color: '#DC2626' }}
                        type="number" min="0" value={row.cr || ''}
                        placeholder="0"
                        onChange={e => updateRow(i, 'cr', Number(e.target.value))} />
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {form.rows.length > 2 && (
                        <button className="btn btn-ghost" style={{ padding: '4px 6px', color: '#EF4444' }}
                          onClick={() => removeRow(i)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Total</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                    {totalDr(form.rows).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                    {totalCr(form.rows).toLocaleString('en-IN')}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ fontSize: 13, color: '#2563EB' }} onClick={addRow}>
              <Plus size={14} /> Add Row
            </button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!balanced && totalDr(form.rows) > 0 && (
                <span style={{ fontSize: 12, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Difference: {Math.abs(totalDr(form.rows) - totalCr(form.rows)).toLocaleString('en-IN')}
                </span>
              )}
              {!rowsHaveOneSideOnly && (
                <span style={{ fontSize: 12, color: '#EF4444' }}>Use either debit or credit per row.</span>
              )}
              {balanced && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 500 }}>✓ Balanced</span>}
              {error && <span style={{ fontSize: 12, color: '#B91C1C', maxWidth: 360 }}>{error}</span>}
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
              {editingId ? (
                <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!canSubmit || saving} onClick={() => saveEntry(editingStatus)}>
                  {saving && <Spinner />} {saving ? 'Updating...' : 'Update Entry'}
                </button>
              ) : <>
                <button className="btn" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', fontSize: 13 }} disabled={!canSubmit || saving} onClick={() => saveEntry('Draft')}>
                  {saving && <Spinner />} {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!canSubmit || saving} onClick={() => saveEntry('Posted')}>
                  {saving && <Spinner />} {saving ? 'Posting...' : 'Post Entry'}
                </button>
              </>}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input className="input" style={{ paddingLeft: 30, height: 34, fontSize: 13 }}
              placeholder="Search entries…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="select" style={{ fontSize: 13 }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="All">All Status</option><option>Posted</option><option>Draft</option>
          </select>
          <select className="select" style={{ fontSize: 13 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date-desc">Newest date</option><option value="date-asc">Oldest date</option><option value="voucher">Voucher number</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748B' }}>{totalEntries} entries</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32, minWidth: 32, padding: 0 }} />
                <th>Voucher No.</th>
                <th>Date</th>
                <th>Narration</th>
                <th>Accounts</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
                <th>Status</th>
                {canWrite && <th style={{ textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loadingRows && <TableSkeletonRows rows={pageSize} columns={canWrite ? 9 : 8} />}
              {!loadingRows && paged.map(e => {
                const dr = e.entries.reduce((s, r) => s + r.dr, 0)
                const cr = e.entries.reduce((s, r) => s + r.cr, 0)
                const isOpen = expanded === e.id
                return (
                  <Fragment key={e.id}>
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : e.id)}>
                      <td style={{ width: 32, minWidth: 32, padding: '8px 4px', textAlign: 'center', color: '#94A3B8' }}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{e.voucherNo}</span></td>
                      <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(e.date)}</span></td>
                      <td><span className="narration-text">{e.narration}</span></td>
                      <td style={{ fontSize: 12, color: '#64748B' }}>{e.entries.length} lines</td>
                      <td className="num dr-amount">{dr.toLocaleString('en-IN')}</td>
                      <td className="num cr-amount">{cr.toLocaleString('en-IN')}</td>
                      <td><span className={`badge ${e.status === 'Posted' ? 'badge-green' : 'badge-amber'}`}>{e.status}</span></td>
                      {canWrite && <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={event => event.stopPropagation()}>
                        <button className="btn btn-ghost" style={{ padding: 6 }} title="Edit journal entry" aria-label="Edit journal entry" onClick={() => openEditForm(e)}><Pencil size={14} /></button>
                        <button className="btn btn-ghost" style={{ padding: 6, color: '#DC2626' }} title="Delete journal entry" aria-label="Delete journal entry" onClick={() => void deleteEntry(e)}><Trash2 size={14} /></button>
                      </td>}
                    </tr>
                    {isOpen && (
                      <tr key={`${e.id}-detail`} style={{ background: '#F8FAFC' }}>
                        <td colSpan={canWrite ? 9 : 8} style={{ padding: '0 20px 12px 44px' }}>
                          <table style={{ width: '60%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748B', fontWeight: 500 }}>Account</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: '#059669', fontWeight: 500 }}>Dr</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: '#DC2626', fontWeight: 500 }}>Cr</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.entries.map((row, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '4px 10px', color: '#334155' }}>{row.account}</td>
                                  <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: row.dr ? '#059669' : '#CBD5E1' }}>{row.dr ? row.dr.toLocaleString('en-IN') : '—'}</td>
                                  <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: row.cr ? '#DC2626' : '#CBD5E1' }}>{row.cr ? row.cr.toLocaleString('en-IN') : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <TablePagination total={totalEntries} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
      </div>
    </div>
  )
}
