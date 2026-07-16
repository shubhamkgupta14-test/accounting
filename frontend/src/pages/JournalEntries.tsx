import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Copy, Plus, Trash2, Search, ChevronDown, ChevronUp, X, Pencil, Upload, FileDown } from 'lucide-react'
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
import AccountSelect from '../components/AccountSelect'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'

interface EntryRow { account: string; dr: number; cr: number }
interface JournalForm {
  date: string; voucherNo: string; narration: string; rows: EntryRow[]
}
interface ImportedLedger { source_name: string; name: string; code: string; type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'; group: string }

const emptyForm = (count: number): JournalForm => ({
  date: new Date().toISOString().slice(0, 10),
  voucherNo: `JV-${String(count + 1).padStart(3, '0')}`,
  narration: '',
  rows: [{ account: '', dr: 0, cr: 0 }, { account: '', dr: 0, cr: 0 }]
})

export default function JournalEntries() {
  const { accounts, refresh } = useLedgerData()
  const { formatDate, currencySymbol } = useAppSettings()
  const { canWrite } = useAuth()
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [addNext, setAddNext] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<'Draft' | 'Posted'>('Draft')
  const [form, setForm] = useState<JournalForm>(emptyForm(0))
  const [search, setSearch] = useState('')
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
  const [importing, setImporting] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importLedgers, setImportLedgers] = useState<ImportedLedger[]>([])

  const paged = filtered

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingRows(true)
      const [sort_by, sort_order] = sortBy === 'voucher' ? ['voucher_no', 'asc'] : ['date', sortBy === 'date-asc' ? 'asc' : 'desc']
      api.journalsPage({ page, page_size: pageSize, search, sort_by, sort_order })
        .then(result => {
          setFiltered(result.items.map(row => ({ ...row, voucherNo: row.voucher_no, entries: row.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) })))
          setTotalEntries(result.total)
        }).catch(() => { setFiltered([]); setTotalEntries(0) }).finally(() => setLoadingRows(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [page, pageSize, reloadKey, search, sortBy])

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
  const swapAccounts = () => setForm(current => {
    if (current.rows.length < 2) return current
    const rows = current.rows.map(row => ({ ...row }))
    const firstAccount = rows[0].account
    rows[0].account = rows[1].account
    rows[1].account = firstAccount
    return { ...current, rows }
  })

  const openCreateForm = () => {
    setEditingId(null)
    setEditingStatus('Draft')
    setForm(emptyForm(totalEntries))
    setError('')
    setAddNext(false)
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
    setAddNext(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duplicateEntry = (entry: JournalEntry) => {
    setEditingId(null)
    setEditingStatus('Posted')
    setAddNext(false)
    setForm({
      date: entry.date.slice(0, 10),
      voucherNo: emptyForm(totalEntries).voucherNo,
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

  const completeImport = async (file: File, ledgers?: ImportedLedger[]) => {
    const result = await api.importJournalsExcel(file, ledgers)
    setPage(1)
    setReloadKey(key => key + 1)
    await refresh()
    setPendingImport(null)
    setImportLedgers([])
    showToast('success', `Imported ${result.imported} journal entries with ${result.line_count} ledger lines.`)
  }

  const importExcel = async (file?: File) => {
    if (!file) return
    setImporting(true)
    try {
      const preview = await api.previewJournalsExcel(file)
      if (preview.unknown_ledgers.length) {
        setPendingImport(file)
        setImportLedgers(preview.unknown_ledgers)
      } else await completeImport(file)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to import journal entries.')
    } finally {
      setImporting(false)
      if (importInput.current) importInput.current.value = ''
    }
  }

  const updateImportedLedger = (index: number, field: keyof ImportedLedger, value: string) => setImportLedgers(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))

  const confirmLedgerImport = async () => {
    if (!pendingImport) return
    if (importLedgers.some(row => !row.name.trim() || !row.code.trim() || !row.group.trim())) {
      showToast('error', 'Complete the name, code and group for every new ledger.')
      return
    }
    setImporting(true)
    try { await completeImport(pendingImport, importLedgers) }
    catch (err) { showToast('error', err instanceof Error ? err.message : 'Unable to create ledgers and import entries.') }
    finally { setImporting(false) }
  }

  const downloadImportSample = async () => {
    setShowImportMenu(false)
    try {
      const blob = await api.downloadJournalImportSample()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'journal-entry-import-sample.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to download sample workbook.')
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
      else await api.createJournal(payload)
      const keepCreating = !editingId && status === 'Posted' && addNext
      setShowForm(keepCreating)
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
          <AuditUncheckAllButton />
          <ExportMenu title="Journal Entries" rows={filtered.map(row => ({
            voucher_no: row.voucherNo,
            date: row.date,
            narration: row.narration,
            debit: row.entries.reduce((sum, line) => sum + line.dr, 0),
            credit: row.entries.reduce((sum, line) => sum + line.cr, 0),
          }))} />
          {canWrite && <div style={{ position: 'relative' }}>
            <input ref={importInput} type="file" accept=".xlsx,.xlsm" hidden onChange={event => void importExcel(event.target.files?.[0])} />
            <button
              className="btn btn-secondary"
              style={{ fontSize: 13 }}
              disabled={importing}
              title="Excel columns: Voucher No, Date, Narration, Account, Debit, Credit. Repeat Voucher No for any number of lines."
              onClick={() => setShowImportMenu(value => !value)}
            >
              {importing ? <Spinner /> : <Upload size={14} />} {importing ? 'Importing...' : 'Excel'} <ChevronDown size={13} />
            </button>
            {showImportMenu && !importing && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, minWidth: 190, padding: 6, boxShadow: '0 10px 25px rgba(15,23,42,0.14)' }}>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }} onClick={() => { setShowImportMenu(false); importInput.current?.click() }}><Upload size={14} /> Import Excel</button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }} onClick={() => void downloadImportSample()}><FileDown size={14} /> Download Sample</button>
              </div>
            )}
          </div>}
          {canWrite && (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openCreateForm}>
              <Plus size={14} /> New Entry
            </button>
          )}
        </div>
      </div>

      {/* New Entry Form */}
      {pendingImport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ width: 'min(920px, 100%)', maxHeight: '85vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div><h3 style={{ margin: 0, fontSize: 16 }}>Create undefined ledgers</h3><p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 13 }}>Review and edit these ledgers before importing {pendingImport.name}.</p></div>
              <button className="btn btn-ghost" onClick={() => { setPendingImport(null); setImportLedgers([]) }}><X size={16} /></button>
            </div>
            <div style={{ overflowX: 'auto' }}><table className="data-table">
              <thead><tr><th>Excel ledger</th><th>Ledger name</th><th>Code</th><th>Type</th><th>Group</th></tr></thead>
              <tbody>{importLedgers.map((ledger, index) => <tr key={ledger.source_name}>
                <td style={{ fontWeight: 600 }}>{ledger.source_name}</td>
                <td><input className="input" value={ledger.name} onChange={event => updateImportedLedger(index, 'name', event.target.value)} /></td>
                <td><input className="input mono" value={ledger.code} onChange={event => updateImportedLedger(index, 'code', event.target.value)} /></td>
                <td><select className="select" value={ledger.type} onChange={event => updateImportedLedger(index, 'type', event.target.value)}>{['Asset','Liability','Equity','Income','Expense'].map(type => <option key={type}>{type}</option>)}</select></td>
                <td><input className="input" value={ledger.group} onChange={event => updateImportedLedger(index, 'group', event.target.value)} /></td>
              </tr>)}</tbody>
            </table></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="btn btn-secondary" disabled={importing} onClick={() => { setPendingImport(null); setImportLedgers([]) }}>Cancel</button>
              <button className="btn btn-primary" disabled={importing} onClick={() => void confirmLedgerImport()}>{importing && <Spinner />} Create Ledgers & Import</button>
            </div>
          </div>
        </div>
      )}
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
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'visible', marginBottom: 16 }}>
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
                      <AccountSelect
                        accounts={accounts}
                        value={row.account}
                        onChange={account => updateRow(i, 'account', account)}
                      />
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
                    <td style={{ padding: '8px 10px', textAlign: 'center', position: 'relative' }}>
                      {i === 1 && (
                        <button
                          className="btn btn-secondary"
                          type="button"
                          aria-label="Swap first two accounts"
                          title="Swap first two accounts"
                          onClick={swapAccounts}
                          disabled={saving || !form.rows[0]?.account || !form.rows[1]?.account}
                          style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', width: 26, height: 26, padding: 0, borderRadius: '50%', zIndex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ArrowLeftRight size={13} />
                        </button>
                      )}
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
              {!editingId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={addNext} onChange={event => setAddNext(event.target.checked)} />
                  Add next
                </label>
              )}
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
              {editingId ? (
                <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!canSubmit || saving} onClick={() => saveEntry(editingStatus)}>
                  {saving && <Spinner />} {saving ? 'Updating...' : 'Update Entry'}
                </button>
              ) : (
                <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={!canSubmit || saving} onClick={() => saveEntry('Posted')}>
                  {saving && <Spinner />} {saving ? 'Posting...' : 'Post Entry'}
                </button>
              )}
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
          <select className="select" style={{ fontSize: 13 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date-desc">Newest date</option><option value="date-asc">Oldest date</option><option value="voucher">Voucher number</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748B' }}>{totalEntries} entries</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36, minWidth: 36, padding: 0 }} />
                <th style={{ width: 32, minWidth: 32, padding: 0 }} />
                <th>Voucher No.</th>
                <th>Date</th>
                <th>Narration</th>
                <th>Accounts</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
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
                      <td style={{ width: 36, minWidth: 36, padding: '8px 4px', textAlign: 'center' }} onClick={event => event.stopPropagation()}>
                        <AuditCheckbox item={`journal entry ${e.voucherNo}`} />
                      </td>
                      <td style={{ width: 32, minWidth: 32, padding: '8px 4px', textAlign: 'center', color: '#94A3B8' }}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{e.voucherNo}</span></td>
                      <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(e.date)}</span></td>
                      <td><span className="narration-text">{e.narration}</span></td>
                      <td style={{ fontSize: 12, color: '#64748B' }}>{e.entries.length} lines</td>
                      <td className="num dr-amount">{dr.toLocaleString('en-IN')}</td>
                      <td className="num cr-amount">{cr.toLocaleString('en-IN')}</td>
                      {canWrite && <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={event => event.stopPropagation()}>
                        <button className="btn btn-ghost" style={{ padding: 6, color: '#2563EB' }} title="Duplicate as a new journal entry" aria-label={`Duplicate journal entry ${e.voucherNo}`} onClick={() => duplicateEntry(e)}><Copy size={14} /></button>
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
