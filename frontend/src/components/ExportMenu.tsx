import { useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { exportElementAsPdf, exportRowsAsExcel } from '../lib/export'

interface Props {
  title: string
  rows: Record<string, unknown>[]
  tableSelector?: string
  fullReport?: boolean
}

type Range = 'all' | 'fy' | 'current-month' | 'last-month' | 'custom'

export default function ExportMenu({ title, rows, tableSelector = '.data-table', fullReport = false }: Props) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filteredRows = useMemo(() => filterRows(rows, range, from, to), [from, range, rows, to])

  const exportPdf = () => {
    const table = range === 'all' ? document.querySelector(tableSelector) : null
    exportElementAsPdf(`${title} (${rangeLabel(range)})`, table?.outerHTML || rowsToHtml(filteredRows))
    setOpen(false)
  }

  const exportExcel = () => {
    exportRowsAsExcel(title.toLowerCase().replace(/\s+/g, '-'), filteredRows)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setOpen(true)}>
        <Download size={14} /> Export
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 38, zIndex: 80, width: 360 }} className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
            <strong>Export {title}</strong>
            <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setOpen(false)}><X size={14} /></button>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={exportPdf}>Export PDF</button>
              <button className="btn btn-primary" onClick={exportExcel}>Export Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function filterRows(rows: Record<string, unknown>[], range: Range, from: string, to: string) {
  const { start, end } = bounds(range, from, to)
  if (!start && !end) return rows
  return rows.filter(row => {
    const date = String(row.date || '')
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

function rowsToHtml(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || { message: 'No data' })
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${String(row[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
