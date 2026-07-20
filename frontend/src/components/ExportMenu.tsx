import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import { escapeExportHtml, exportElementAsPdf, exportRowsAsExcel } from '../lib/export'

interface Props {
  title: string
  rows: Record<string, unknown>[]
  tableSelector?: string
  fullReport?: boolean
  pdfHtml?: string
  excelRows?: Record<string, unknown>[]
  rowsOnly?: boolean
  compact?: boolean
  traditionalRows?: Record<string, unknown>[]
  traditionalPdfHtml?: string
  heading?: string
  period?: { start: string; end: string }
  allAccountsExport?: { label: string; pdf: (traditional: boolean) => void | Promise<void>; excel: (traditional: boolean) => void | Promise<void> }
  customAccountsExport?: { options: string[]; pdf: (accounts: string[], traditional: boolean) => void | Promise<void>; excel: (accounts: string[], traditional: boolean) => void | Promise<void> }
}

type Range = 'all' | 'fy' | 'current-month' | 'last-month' | 'custom'

export default function ExportMenu({ title, rows, tableSelector = '.data-table', fullReport = false, pdfHtml, excelRows, rowsOnly = false, compact = true, traditionalRows, traditionalPdfHtml, heading, period, allAccountsExport, customAccountsExport }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [allAccounts, setAllAccounts] = useState(false)
  const [traditionalFormat, setTraditionalFormat] = useState(false)
  const [customAccounts, setCustomAccounts] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())

  const filteredRows = useMemo(() => filterRows(rows, range, from, to), [from, range, rows, to])
  const activeRows = traditionalFormat && traditionalRows ? traditionalRows : filteredRows
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])
  const exportTitle = heading ? `${title} — ${heading}` : period ? `${title} — ${periodLabel(period)}` : `${title} (${rangeLabel(range)})`

  const exportPdf = async () => {
    if (allAccounts && allAccountsExport) {
      await allAccountsExport.pdf(traditionalFormat)
      setOpen(false)
      return
    }
    if (customAccounts && customAccountsExport) {
      await customAccountsExport.pdf(Array.from(selectedAccounts), traditionalFormat)
      setOpen(false)
      return
    }
    const table = !compact && !rowsOnly && range === 'all' ? document.querySelector(tableSelector) : null
    exportElementAsPdf(exportTitle, traditionalFormat ? traditionalPdfHtml || rowsToHtml(activeRows) : pdfHtml || table?.outerHTML || rowsToHtml(activeRows))
    setOpen(false)
  }

  const exportExcel = async () => {
    if (allAccounts && allAccountsExport) {
      await allAccountsExport.excel(traditionalFormat)
      setOpen(false)
      return
    }
    if (customAccounts && customAccountsExport) {
      await customAccountsExport.excel(Array.from(selectedAccounts), traditionalFormat)
      setOpen(false)
      return
    }
    exportRowsAsExcel(title.toLowerCase().replace(/\s+/g, '-'), traditionalFormat ? activeRows : excelRows || activeRows, heading || period ? exportTitle : undefined)
    setOpen(false)
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn btn-secondary" style={{ fontSize: 13, height: 34, whiteSpace: 'nowrap' }} onClick={() => setOpen(value => !value)}>
        <Download size={14} /> Export
      </button>
      {open && (
        compact ? (
          <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 80, minWidth: 210, padding: 6, boxShadow: '0 10px 25px rgba(15,23,42,0.14)' }}>
            {traditionalRows && <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={traditionalFormat} onChange={event => setTraditionalFormat(event.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
              Traditional Format
            </label>}
            {allAccountsExport && <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={allAccounts} onChange={event => { setAllAccounts(event.target.checked); if (event.target.checked) setCustomAccounts(false) }} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
              {allAccountsExport.label}
            </label>}
            {customAccountsExport && <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={customAccounts} onChange={event => { setCustomAccounts(event.target.checked); if (event.target.checked) setAllAccounts(false) }} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
                Custom accounts
              </label>
              {customAccounts && <div style={{ maxHeight: 210, overflowY: 'auto', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '4px 0' }}>
                {customAccountsExport.options.map(account => <label key={account} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedAccounts.has(account)} onChange={event => setSelectedAccounts(current => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(account); else next.delete(account)
                    return next
                  })} />
                  {account}
                </label>)}
              </div>}
            </>}
            <button className="btn btn-ghost" disabled={customAccounts && selectedAccounts.size === 0} style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }} onClick={() => void exportPdf()}><Download size={14} /> Export PDF</button>
            <button className="btn btn-ghost" disabled={customAccounts && selectedAccounts.size === 0} style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13 }} onClick={() => void exportExcel()}><Download size={14} /> Export Excel</button>
          </div>
        ) : (
        <div style={{ position: 'absolute', right: 0, top: 38, zIndex: 80, width: 360, maxWidth: 'calc(100vw - 32px)' }} className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
            <strong>Export {title}</strong>
            <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setOpen(false)}><X size={14} /></button>
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            {!fullReport && <><label className="form-label">Date Range</label>
            <select className="select" value={range} onChange={e => setRange(e.target.value as Range)}>
              <option value="all">All data</option>
              <option value="fy">Current financial year</option>
              <option value="current-month">Current month</option>
              <option value="last-month">Last month</option>
              <option value="custom">Custom range</option>
            </select></>}
            {!fullReport && range === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="form-label">From</label><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><label className="form-label">To</label><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
              </div>
            )}
            {!fullReport && <div style={{ fontSize: 12.5, color: '#64748B' }}>{filteredRows.length} rows selected</div>}
            {allAccountsExport && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#0F172A', cursor: 'pointer' }}>
                <input type="checkbox" checked={allAccounts} onChange={event => setAllAccounts(event.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
                {allAccountsExport.label}
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => void exportPdf()}>Export PDF</button>
              <button className="btn btn-primary" onClick={() => void exportExcel()}>Export Excel</button>
            </div>
          </div>
        </div>
        )
      )}
    </div>
  )
}

function filterRows(rows: Record<string, unknown>[], range: Range, from: string, to: string) {
  const { start, end } = bounds(range, from, to)
  if (!start && !end) return rows
  return rows.filter(row => {
    const date = String(row.date || row.Date || '')
    if (!date) return true
    return (!start || date >= start) && (!end || date <= end)
  })
}

function bounds(range: Range, from: string, to: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (range === 'current-month') return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) }
  if (range === 'last-month') return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) }
  if (range === 'fy') {
    const fyStartYear = m >= 3 ? y : y - 1
    return { start: `${fyStartYear}-04-01`, end: `${fyStartYear + 1}-03-31` }
  }
  if (range === 'custom') return { start: from, end: to }
  return { start: '', end: '' }
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function rangeLabel(range: Range) {
  return range.replace('-', ' ')
}

function periodLabel(period: { start: string; end: string }) {
  if (period.start.endsWith('-04-01') && period.end.endsWith('-03-31')) {
    const startYear = Number(period.start.slice(0, 4))
    if (Number(period.end.slice(0, 4)) === startYear + 1) return `FY ${startYear}-${String(startYear + 1).slice(2)}`
  }
  return `${period.start} to ${period.end}`
}

function rowsToHtml(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || { message: 'No data' })
  const classes = (header: string) => {
    const value = header.toLowerCase()
    return [
      value.includes('date') ? 'date-cell' : '',
      value.includes('narration') || value.includes('particular') ? 'narration-cell' : '',
      value.includes('debit') || value === 'dr' || value.includes('dr.') ? 'debit-cell num' : '',
      value.includes('credit') || value === 'cr' || value.includes('cr.') ? 'credit-cell num' : '',
      value.includes('balance') ? 'balance-cell num' : '',
    ].filter(Boolean).join(' ')
  }
  const isTotal = (row: Record<string, unknown>) => Object.values(row).some(value => /^(total|net balance)$/i.test(String(value).trim()))
  const pdfValue = (value: unknown) => typeof value === 'number'
    ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
    : String(value ?? '')
  return `<table><thead><tr>${headers.map(h => `<th class="${classes(h)}">${escapeExportHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr${isTotal(row) ? ' class="total-row"' : ''}>${headers.map(h => `<td class="${classes(h)}" style="white-space:${h.toLowerCase().includes('date') ? 'nowrap' : 'pre-wrap'}">${escapeExportHtml(pdfValue(row[h]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
