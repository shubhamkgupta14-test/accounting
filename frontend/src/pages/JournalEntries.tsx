import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, Copy, Plus, Trash2, Search, ChevronDown, ChevronUp, X, Pencil, Upload, FileDown } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import NarrationSuggest from '../components/NarrationSuggest'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type ClosingPreviewEntry, type JournalEntry, type ReportPeriod } from '../lib/api'
import { Spinner, TableSkeletonRows } from '../components/Loading'
import AccountSelect from '../components/AccountSelect'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import ConfirmModal from '../components/ConfirmModal'
import { accountGroups, defaultAccountGroup, type AccountType } from '../lib/accountGroups'
import { formatReportNumber } from '../lib/export'
import { paginationConfig } from '../config/app'
import EmptyTableRow from '../components/EmptyTableRow'

interface EntryRow { account: string; dr: number; cr: number; autoAmount?: 'dr' | 'cr' }
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
  const { accounts, refresh, createAccount } = useLedgerData()
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
  const [financialYear, setFinancialYear] = useState('all')
  const [financialYears, setFinancialYears] = useState<ReportPeriod[]>([])
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [closingEntries, setClosingEntries] = useState<ClosingPreviewEntry[]>([])
  const [closingPreviewError, setClosingPreviewError] = useState('')
  const [loadingClosingPreview, setLoadingClosingPreview] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(paginationConfig.defaultPageSize)
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
  const importMenuRef = useRef<HTMLDivElement>(null)
  const checkedPendingClosing = useRef(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importLedgers, setImportLedgers] = useState<ImportedLedger[]>([])
  const [missingLedgers, setMissingLedgers] = useState<ImportedLedger[]>([])
  const [pendingStatus, setPendingStatus] = useState<'Draft' | 'Posted' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const paged = filtered
  const selectedFinancialPeriod = financialYears.find(period => period.start_date === financialYear)
  const exportPeriodHeading = financialYear === 'custom'
    ? `${customDateFrom || 'Beginning'} to ${customDateTo || 'Present'}`
    : selectedFinancialPeriod
      ? `FY ${selectedFinancialPeriod.start_date.slice(0, 4)}-${selectedFinancialPeriod.end_date.slice(2, 4)}`
      : 'All financial years'
  const traditionalExportRows: Record<string, unknown>[] = []
  filtered.forEach(journal => {
    journal.entries.forEach((line, index) => {
      const debit = Number(line.debit ?? line.dr) || 0
      const credit = Number(line.credit ?? line.cr) || 0
      const accountName = /(?:\bA\/c|\bAccount)$/i.test(line.account.trim()) ? line.account.trim() : `${line.account.trim()} A/c`
      traditionalExportRows.push({
        'Voucher No.': index === 0 ? journal.voucherNo : '',
        Date: index === 0 ? journal.date.slice(0, 10) : '',
        Narration: credit ? `\tTo ${accountName}` : accountName,
        Dr: debit || '',
        Cr: credit || '',
      })
    })
    traditionalExportRows.push({ 'Voucher No.': '', Date: '', Narration: `(Being ${journal.narration})`, Dr: '', Cr: '' })
  })
  traditionalExportRows.push({
    'Voucher No.': '', Date: '', Narration: 'Total',
    Dr: filtered.reduce((sum, journal) => sum + journal.entries.reduce((lineSum, line) => lineSum + (Number(line.debit ?? line.dr) || 0), 0), 0),
    Cr: filtered.reduce((sum, journal) => sum + journal.entries.reduce((lineSum, line) => lineSum + (Number(line.credit ?? line.cr) || 0), 0), 0),
  })

  useEffect(() => {
    api.financialYears().then(result => setFinancialYears(result.periods)).catch(() => setFinancialYears([]))
  }, [reloadKey])

  useEffect(() => {
    if (!canWrite || checkedPendingClosing.current) return
    checkedPendingClosing.current = true
    api.pendingClosingPreview().then(preview => {
      if (preview.closing_date && preview.entries.length) {
        setClosingDate(preview.closing_date)
        setClosingEntries(preview.entries)
      }
    }).catch(() => undefined)
  }, [canWrite])

  useEffect(() => {
    if (!showImportMenu) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!importMenuRef.current?.contains(event.target as Node)) setShowImportMenu(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [showImportMenu])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingRows(true)
      const [sort_by, sort_order] = sortBy === 'voucher' ? ['voucher_no', 'asc'] : ['date', sortBy === 'date-asc' ? 'asc' : 'desc']
      const selectedFy = financialYears.find(period => period.start_date === financialYear)
      const dateFrom = financialYear === 'custom' ? customDateFrom || undefined : selectedFy?.start_date
      const dateTo = financialYear === 'custom' ? customDateTo || undefined : selectedFy?.end_date
      api.journalsPage({
        page, page_size: pageSize, search, sort_by, sort_order,
        date_from: dateFrom,
        date_to: dateTo,
      })
        .then(result => {
          setFiltered(result.items.map(row => ({ ...row, voucherNo: row.voucher_no, entries: row.entries.map(line => ({ ...line, dr: line.debit, cr: line.credit })) })))
          setTotalEntries(result.total)
        }).catch(() => { setFiltered([]); setTotalEntries(0) }).finally(() => setLoadingRows(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [customDateFrom, customDateTo, financialYear, financialYears, page, pageSize, reloadKey, search, sortBy])

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
  const canSubmit = canWrite && balanced && rowsHaveAccounts && rowsHaveOneSideOnly
  const selectedAccounts = filledRows.map(row => accounts.find(account => account.name === row.account)).filter(Boolean)
  const paymentMode = selectedAccounts.some(account => account?.name.toLowerCase().includes('cash'))
    ? 'by cash'
    : selectedAccounts.some(account => account?.group.toLowerCase() === 'bank')
      ? 'through bank'
      : 'on credit'
  const expenseName = selectedAccounts.find(account => account?.type === 'Expense')?.name
  const incomeName = selectedAccounts.find(account => account?.type === 'Income')?.name
  const party = selectedAccounts.find(account => ['Accounts Receivable', 'Sundry Debtors', 'Accounts Payable', 'Sundry Creditors'].includes(account?.name || ''))?.name

  const addRow = () => setForm(current => {
    const debit = totalDr(current.rows)
    const credit = totalCr(current.rows)
    const difference = Math.round((debit - credit) * 100) / 100
    const next: EntryRow = difference > 0
      ? { account: '', dr: 0, cr: difference, autoAmount: 'cr' }
      : difference < 0
        ? { account: '', dr: Math.abs(difference), cr: 0, autoAmount: 'dr' }
        : { account: '', dr: 0, cr: 0 }
    return { ...current, rows: [...current.rows, next] }
  })
  const removeRow = (i: number) => setForm(f => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }))
  const moveRow = (index: number, direction: -1 | 1) => setForm(current => {
    const target = index + direction
    if (target < 0 || target >= current.rows.length) return current
    const rows = [...current.rows]
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    return { ...current, rows }
  })
  const updateRow = (i: number, field: 'account' | 'dr' | 'cr', value: string | number) =>
    setForm(current => {
      const rows = current.rows.map(row => ({ ...row }))
      if (field === 'account') {
        rows[i].account = String(value)
        return { ...current, rows }
      }
      const amount = Number(value) || 0
      rows[i] = {
        ...rows[i],
        [field]: amount,
        [field === 'dr' ? 'cr' : 'dr']: amount > 0 ? 0 : rows[i][field === 'dr' ? 'cr' : 'dr'],
        autoAmount: undefined,
      }
      const next = rows[i + 1]
      if (next && (!next.dr && !next.cr || Boolean(next.autoAmount))) {
        const otherRows = rows.filter((_, index) => index !== i + 1)
        const difference = Math.round((totalDr(otherRows) - totalCr(otherRows)) * 100) / 100
        rows[i + 1] = difference > 0
          ? { ...next, dr: 0, cr: difference, autoAmount: 'cr' }
          : difference < 0
            ? { ...next, dr: Math.abs(difference), cr: 0, autoAmount: 'dr' }
            : { ...next, dr: 0, cr: 0, autoAmount: undefined }
      }
      return { ...current, rows }
    })
  const swapAccounts = (upperIndex: number, lowerIndex: number) => setForm(current => {
    if (!current.rows[upperIndex] || !current.rows[lowerIndex]) return current
    const rows = current.rows.map(row => ({ ...row }))
    const upperAccount = rows[upperIndex].account
    rows[upperIndex].account = rows[lowerIndex].account
    rows[lowerIndex].account = upperAccount
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
    setDeleteTarget(null)
    try {
      await api.deleteJournal(entry.id)
      if (expanded === entry.id) setExpanded(null)
      if (filtered.length === 1 && page > 1) setPage(current => current - 1)
      else setReloadKey(key => key + 1)
      await refresh()
      showToast('success', `Journal entry ${voucherNo} deleted.`, {
        duration: 10000,
        action: { label: 'Undo', onClick: () => {
          void api.createJournal({
            date: entry.date.slice(0, 10),
            voucher_no: voucherNo,
            narration: entry.narration,
            status: entry.status,
            entries: entry.entries.map(line => ({
              account: line.account,
              debit: Number(line.debit ?? line.dr) || 0,
              credit: Number(line.credit ?? line.cr) || 0,
            })),
          }).then(async () => {
            setReloadKey(key => key + 1)
            await refresh()
            showToast('success', `Journal entry ${voucherNo} restored.`)
          }).catch(err => showToast('error', err instanceof Error ? err.message : 'Unable to restore journal entry.'))
        } },
      })
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to delete journal entry.')
    }
  }

  const completeImport = async (file: File, ledgers?: ImportedLedger[]) => {
    const result = await api.importJournalsExcel(file, ledgers)
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

  const updateImportedLedger = (index: number, field: keyof ImportedLedger, value: string) => setImportLedgers(rows => rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row
    if (field === 'type') {
      const type = value as AccountType
      return { ...row, type, group: defaultAccountGroup(type) }
    }
    return { ...row, [field]: value }
  }))
  const validPickerDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)

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

  const confirmClosingEntries = async () => {
    if (!closingDate || closingEntries.some(entry => !entry.voucher_no.trim() || !entry.narration.trim())) {
      showToast('error', 'Voucher number and narration are required for every closing entry.')
      return
    }
    setConfirmingClose(true)
    try {
      const result = await api.confirmClosingEntries(closingDate, closingEntries.map(entry => ({
        system_entry_type: entry.system_entry_type,
        voucher_no: entry.voucher_no.trim(),
        narration: entry.narration.trim(),
      })))
      setClosingEntries([])
      setClosingDate('')
      setReloadKey(key => key + 1)
      await refresh()
      showToast('success', `Created ${result.created} confirmed year-end ${result.created === 1 ? 'entry' : 'entries'}.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to create year-end entries.')
    } finally {
      setConfirmingClose(false)
    }
  }

  const loadClosingPreview = async (date: string) => {
    setClosingDate(date)
    setClosingPreviewError('')
    setLoadingClosingPreview(true)
    try {
      const preview = await api.closingPreview(date)
      setClosingEntries(preview.entries)
      if (!preview.entries.length) setClosingPreviewError('No year-end transfer entries are required for this financial year.')
    } catch (err) {
      setClosingEntries([])
      setClosingPreviewError(err instanceof Error ? err.message : 'Unable to calculate the year-end entries.')
    } finally {
      setLoadingClosingPreview(false)
    }
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

  const persistEntry = async (status: 'Draft' | 'Posted', accountNames: Record<string, string> = {}) => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        date: form.date,
        voucher_no: form.voucherNo,
        narration: form.narration.trim(),
        status,
        entries: filledRows.map(row => ({ account: accountNames[row.account.trim()] || row.account.trim(), debit: Number(row.dr) || 0, credit: Number(row.cr) || 0 })),
      }
      if (editingId) await api.updateJournal(editingId, payload)
      else await api.createJournal(payload)
      await refresh()
      const closesYear = status === 'Posted' && payload.entries.some(line =>
        ['closing stock', 'stock-in-hand', 'stock in hand'].includes(line.account.toLowerCase()) && line.debit > 0
      )
      if (closesYear) await loadClosingPreview(payload.date)
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

  const saveEntry = async (status: 'Draft' | 'Posted') => {
    if (!form.narration.trim()) {
      const message = 'Narration is required.'
      setError(message)
      showToast('error', message)
      return
    }
    if (!canSubmit) {
      const message = 'Select at least two account rows and make sure debit and credit totals match.'
      setError(message)
      showToast('error', message)
      return
    }
    const unknown = [...new Set(filledRows.map(row => row.account.trim()).filter(name =>
      !accounts.some(account => account.name.toLowerCase() === name.toLowerCase())
    ))]
    if (unknown.length) {
      setMissingLedgers(unknown.map((name, index) => ({
        source_name: name, name, code: `AC${String(accounts.length + index + 1).padStart(3, '0')}`,
        type: 'Asset', group: defaultAccountGroup('Asset'),
      })))
      setPendingStatus(status)
      return
    }
    await persistEntry(status)
  }

  const createMissingLedgersAndJournal = async () => {
    if (!pendingStatus || missingLedgers.some(item => !item.name.trim() || !item.group.trim())) {
      showToast('error', 'Ledger name, type, and group are required.')
      return
    }
    setSaving(true)
    try {
      for (const ledger of missingLedgers) await createAccount({
        code: ledger.code, name: ledger.name.trim(), type: ledger.type, group: ledger.group.trim(),
        opening_balance: 0, is_active: true,
      })
      const names = Object.fromEntries(missingLedgers.map(item => [item.source_name, item.name.trim()]))
      const status = pendingStatus
      setMissingLedgers([])
      setPendingStatus(null)
      await persistEntry(status, names)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to create ledger accounts and journal entry.')
      setSaving(false)
    }
  }

  return (
    <div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete journal entry?"
        message={`Delete journal entry ${deleteTarget ? (deleteTarget.voucherNo || deleteTarget.voucher_no) : ''}? You will have 10 seconds to undo this action.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void deleteEntry(deleteTarget) }}
      />
      {missingLedgers.length > 0 && (
        <div className="modal-backdrop">
          <div className="card" style={{ width: 'min(760px, 100%)', padding: 24 }}>
            <h3 style={{ margin: '0 0 6px' }}>Create missing ledger accounts</h3>
            <p style={{ margin: '0 0 18px', color: '#64748B', fontSize: 13 }}>Review these details. Creating the ledger accounts will also create the journal entry.</p>
            {missingLedgers.map((ledger, index) => (
              <div key={ledger.source_name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
                <div><label className="form-label required">Ledger account name</label><input className="input" value={ledger.name} onChange={e => setMissingLedgers(items => items.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /></div>
                <div><label className="form-label required">Type</label><select className="select" value={ledger.type} onChange={e => setMissingLedgers(items => items.map((item, i) => {
                  if (i !== index) return item
                  const type = e.target.value as AccountType
                  return { ...item, type, group: defaultAccountGroup(type) }
                }))}>{Object.keys(accountGroups).map(type => <option key={type}>{type}</option>)}</select></div>
                <div><label className="form-label required">Group</label><select className="select" value={ledger.group} onChange={e => setMissingLedgers(items => items.map((item, i) => i === index ? { ...item, group: e.target.value } : item))}>{accountGroups[ledger.type].map(group => <option key={group}>{group}</option>)}</select></div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" disabled={saving} onClick={() => { setMissingLedgers([]); setPendingStatus(null) }}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void createMissingLedgersAndJournal()}>{saving ? 'Creating…' : 'Create ledger & journal entry'}</button>
            </div>
          </div>
        </div>
      )}
      {(closingEntries.length > 0 || closingPreviewError) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ width: 'min(920px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Confirm year-end entries</h3>
              <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>Review the entries calculated from FY activity. Voucher numbers and narrations can be edited; accounts and amounts are locked.</p>
            </div>
            {closingPreviewError && (
              <div style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', fontSize: 13, lineHeight: 1.5 }}>
                <strong>Year-end preview could not be completed.</strong>
                <div>{closingPreviewError}</div>
                <div style={{ marginTop: 4, color: '#7F1D1D' }}>The Closing Stock entry was saved, but no automatic transfer entries were created.</div>
              </div>
            )}
            {closingEntries.map((entry, entryIndex) => (
              <div key={entry.system_entry_type} style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{ padding: 12, background: '#F8FAFC', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Voucher No.</label>
                    <input className="input mono" value={entry.voucher_no} onChange={event => setClosingEntries(items => items.map((item, index) => index === entryIndex ? { ...item, voucher_no: event.target.value } : item))} />
                  </div>
                  <div>
                    <label className="form-label">Narration</label>
                    <input className="input" value={entry.narration} onChange={event => setClosingEntries(items => items.map((item, index) => index === entryIndex ? { ...item, narration: event.target.value } : item))} />
                  </div>
                </div>
                <table className="data-table">
                  <thead><tr><th>Account</th><th className="num dr-heading">Debit ({currencySymbol})</th><th className="num cr-heading">Credit ({currencySymbol})</th></tr></thead>
                  <tbody>{entry.entries.map((line, index) => <tr key={`${line.account}-${index}`}>
                    <td>{line.account}</td>
                    <td className="num dr-amount">{line.debit ? formatReportNumber(line.debit) : ''}</td>
                    <td className="num cr-amount">{line.credit ? formatReportNumber(line.credit) : ''}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" disabled={confirmingClose || loadingClosingPreview} onClick={() => { setClosingEntries([]); setClosingDate(''); setClosingPreviewError('') }}>{closingPreviewError ? 'Close' : 'Not now'}</button>
              {closingPreviewError
                ? <button className="btn btn-primary" disabled={loadingClosingPreview} onClick={() => void loadClosingPreview(closingDate)}>{loadingClosingPreview && <Spinner />} Retry</button>
                : <button className="btn btn-primary" disabled={confirmingClose} onClick={() => void confirmClosingEntries()}>{confirmingClose && <Spinner />} Confirm & Create</button>}
            </div>
          </div>
        </div>
      )}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="journal" />
        <div style={{ display: 'flex', gap: 8 }}>
          <AuditUncheckAllButton />
          <ExportMenu compact fullReport rowsOnly title="Journal Entries" heading={exportPeriodHeading} traditionalRows={traditionalExportRows} rows={filtered.map(row => ({
            'Voucher No.': row.voucherNo,
            Date: row.date,
            Narration: row.narration,
            Accounts: row.entries.length,
            [`Debit (${currencySymbol})`]: row.entries.reduce((sum, line) => sum + line.dr, 0),
            [`Credit (${currencySymbol})`]: row.entries.reduce((sum, line) => sum + line.cr, 0),
          }))} />
          {canWrite && <div ref={importMenuRef} style={{ position: 'relative' }}>
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
              <button className="btn btn-ghost btn-icon" onClick={() => { setPendingImport(null); setImportLedgers([]) }}><X size={16} /></button>
            </div>
            <div style={{ overflowX: 'auto' }}><table className="data-table">
              <thead><tr><th>Excel ledger</th><th>Ledger name</th><th>Code</th><th>Type</th><th>Group</th></tr></thead>
              <tbody>{importLedgers.map((ledger, index) => <tr key={ledger.source_name}>
                <td style={{ fontWeight: 600 }}>{ledger.source_name}</td>
                <td><input className="input" value={ledger.name} onChange={event => updateImportedLedger(index, 'name', event.target.value)} /></td>
                <td><input className="input mono" value={ledger.code} onChange={event => updateImportedLedger(index, 'code', event.target.value)} /></td>
                <td><select className="select" value={ledger.type} onChange={event => updateImportedLedger(index, 'type', event.target.value)}>{Object.keys(accountGroups).map(type => <option key={type}>{type}</option>)}</select></td>
                <td><select className="select" value={ledger.group} onChange={event => updateImportedLedger(index, 'group', event.target.value)}>{accountGroups[ledger.type].map(group => <option key={group}>{group}</option>)}</select></td>
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
            <button className="btn btn-ghost btn-icon" style={{ padding: '4px 8px' }} onClick={() => { setShowForm(false); setEditingId(null) }}>
              <X size={16} />
            </button>
          </div>

          {accounts.length === 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#92400E', fontSize: 13 }}>
              No accounts exist yet. Type the new ledger names below; you can create them while posting this journal entry.
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
                  <tr key={i} style={{ borderTop: '1px solid #E2E8F0', position: 'relative' }}>
                    <td style={{ padding: '8px 14px' }}>
                      {i > 0 && (
                        <button
                          className="btn btn-ghost btn-icon btn-icon-primary"
                          type="button"
                          aria-label={`Swap accounts in rows ${i} and ${i + 1}`}
                          title={`Swap accounts in rows ${i} and ${i + 1}`}
                          onClick={() => swapAccounts(i - 1, i)}
                          disabled={saving || !form.rows[i - 1]?.account || !form.rows[i]?.account}
                          style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', width: 26, height: 26, padding: 0, borderRadius: '50%', zIndex: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ArrowLeftRight size={13} />
                        </button>
                      )}
                      <div className="je-account-with-badge">
                        <div style={{ minWidth: 0 }}>
                          <AccountSelect
                            accounts={accounts}
                            value={row.account}
                            onChange={account => updateRow(i, 'account', account)}
                          />
                        </div>
                        {row.account.trim() && (() => {
                          const account = accounts.find(item => item.name.toLowerCase() === row.account.trim().toLowerCase())
                          return <span className="je-account-badge-positioner">
                            <span className="je-account-name-measure">{row.account}</span>
                            {account
                              ? <span className={`badge je-account-type-badge ${account.type === 'Asset' ? 'badge-blue' : account.type === 'Liability' ? 'badge-red' : account.type === 'Equity' ? 'badge-amber' : account.type === 'Income' ? 'badge-green' : 'badge-slate'}`}>{account.type}</span>
                              : <span className="badge badge-amber je-account-type-badge">New</span>}
                          </span>
                        })()}
                      </div>
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
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          style={{ padding: '4px 5px' }}
                          title="Move row up"
                          aria-label={`Move row ${i + 1} up`}
                          disabled={saving || i === 0}
                          onClick={() => moveRow(i, -1)}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          style={{ padding: '4px 5px' }}
                          title="Move row down"
                          aria-label={`Move row ${i + 1} down`}
                          disabled={saving || i === form.rows.length - 1}
                          onClick={() => moveRow(i, 1)}
                        >
                          <ArrowDown size={13} />
                        </button>
                      {form.rows.length > 2 && (
                        <button className="btn btn-ghost btn-icon btn-delete-icon" style={{ padding: '4px 6px' }}
                          onClick={() => removeRow(i)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Total</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                    {formatReportNumber(totalDr(form.rows))}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                    {formatReportNumber(totalCr(form.rows))}
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
                  Difference: {formatReportNumber(Math.abs(totalDr(form.rows) - totalCr(form.rows)))}
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
          <select className="select" style={{ fontSize: 13 }} value={financialYear} onChange={e => { setFinancialYear(e.target.value); setPage(1) }} aria-label="Financial year">
            <option value="all">All financial years</option>
            {financialYears.map(period => {
              const start = Number(period.start_date.slice(0, 4))
              return <option key={period.start_date} value={period.start_date}>FY {start}-{String(start + 1).slice(-2)}</option>
            })}
            <option value="custom">Custom range</option>
          </select>
          {financialYear === 'custom' && <>
            <input className="input" style={{ width: 142, height: 34, fontSize: 13 }} type="date" min="1000-01-01" max="9999-12-31" aria-label="From date" value={customDateFrom} onChange={e => { if (validPickerDate(e.target.value)) { setCustomDateFrom(e.target.value); setPage(1) } }} />
            <input className="input" style={{ width: 142, height: 34, fontSize: 13 }} type="date" aria-label="To date" value={customDateTo} min={customDateFrom || '1000-01-01'} max="9999-12-31" onChange={e => { if (validPickerDate(e.target.value)) { setCustomDateTo(e.target.value); setPage(1) } }} />
          </>}
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
              {!loadingRows && paged.length === 0 && <EmptyTableRow colSpan={canWrite ? 9 : 8} />}
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
                      <td className="num dr-amount">{formatReportNumber(dr)}</td>
                      <td className="num cr-amount">{formatReportNumber(cr)}</td>
                      {canWrite && <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={event => event.stopPropagation()}>
                        <div className="table-action-icons">
                        <button className="btn btn-ghost btn-icon btn-icon-primary" title="Duplicate as a new journal entry" aria-label={`Duplicate journal entry ${e.voucherNo}`} onClick={() => duplicateEntry(e)}><Copy size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-icon-primary" title="Edit journal entry" aria-label="Edit journal entry" onClick={() => openEditForm(e)}><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-delete-icon" title="Delete journal entry" aria-label="Delete journal entry" onClick={() => setDeleteTarget(e)}><Trash2 size={14} /></button>
                        </div>
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
                                  <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: row.dr ? '#059669' : '#CBD5E1' }}>{row.dr ? formatReportNumber(row.dr) : '—'}</td>
                                  <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: row.cr ? '#DC2626' : '#CBD5E1' }}>{row.cr ? formatReportNumber(row.cr) : '—'}</td>
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
