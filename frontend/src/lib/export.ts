export function exportRowsAsExcel(filename: string, rows: Record<string, unknown>[], heading?: string) {
  downloadBlob(`${filename}.xls`, buildExcelDocument(rows, heading), 'application/vnd.ms-excel;charset=utf-8')
}

export function buildExcelDocument(rows: Record<string, unknown>[], heading?: string) {
  const headers = Object.keys(rows[0] || { message: 'No data' })
  const body = rows.length ? rows : [{ message: 'No data' }]
  const cellClass = (header: string) => {
    const value = header.toLowerCase()
    if (value.includes('balance') || value.includes('amount') || value.includes('total') || value.includes('net')) return 'balance'
    if (value.includes('debit') || value === 'dr' || value.includes('receipt') || value.includes('inflow') || value.includes('income')) return 'debit'
    if (value.includes('credit') || value === 'cr' || value.includes('payment') || value.includes('outflow') || value.includes('expense')) return 'credit'
    return ''
  }
  const value = (item: unknown) => typeof item === 'number' ? formatReportNumber(item) : String(item ?? '')
  return `<html><head><meta charset="utf-8"><style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}th,td{border:1px solid #cbd5e1;padding:7px 9px}th{background:#e2e8f0;font-weight:700}.debit{background:#dcfce7;color:#047857}.credit{background:#fee2e2;color:#b91c1c}.balance{background:#dbeafe;color:#1d4ed8}.num{text-align:right;mso-number-format:"0.00"}
  </style></head><body>${heading ? `<h2>${escapeExportHtml(heading)}</h2>` : ''}<table><thead><tr>${headers.map(header => `<th class="${cellClass(header)}">${escapeExportHtml(header)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${headers.map(header => `<td class="${cellClass(header)}${typeof row[header] === 'number' ? ' num' : ''}">${escapeExportHtml(value(row[header]))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
}

export function exportElementAsPdf(title: string, html: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.opener = null
  win.document.write(buildPrintDocument(title, html))
  win.document.close()
  win.focus()
  win.print()
}

export function buildPrintDocument(title: string, html: string) {
  const safeTitle = escapeExportHtml(title)
  return `
    <html>
      <head>
        <title>${safeTitle}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; font-size: 15px; padding: 24px; color: #0f172a; }
          h1 { font-size: 19px; margin-bottom: 16px; color: #0f172a; }
          h2 { font-size: 15px; margin: 0 0 10px; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          th { background: #f1f5f9; color: #334155; font-weight: 700; }
          tbody tr:nth-child(even) { background: #fafbfc; }
          .num { text-align: right; }
          .date-cell { white-space: nowrap; min-width: 82px; width: 82px; }
          .narration-text, .narration-cell { color: #475569; font-size: 10.5px; font-style: italic; }
          .debit-cell { color: #047857; background: #dcfce7; }
          .credit-cell { color: #b91c1c; background: #fee2e2; }
          .balance-cell { color: #1d4ed8; background: #dbeafe; }
          .total-row td { background: #dbeafe; color: #1d4ed8; font-weight: 700; border-top: 2px solid #60a5fa; }
          .total-row td.debit-cell { color: #047857; background: #dcfce7; }
          .total-row td.credit-cell { color: #b91c1c; background: #fee2e2; }
          .total-row td.balance-cell { color: #1d4ed8; background: #dbeafe; }
        </style>
      </head>
      <body><h1>${safeTitle}</h1>${html}</body>
    </html>
  `
}

export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function downloadJson(filename: string, value: unknown) {
  downloadBlob(`${filename}.json`, JSON.stringify(value, null, 2), 'application/json;charset=utf-8')
}

export function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function buildTraditionalTwoSidedExport(
  leftHeading: string,
  rightHeading: string,
  left: Array<{ particulars: string; amount: number }>,
  right: Array<{ particulars: string; amount: number }>,
  total: number,
) {
  const length = Math.max(left.length, right.length)
  const rows: Record<string, unknown>[] = Array.from({ length }, (_, index) => ({
    [`${leftHeading} Particulars`]: left[index]?.particulars || '',
    [`${leftHeading} Amount`]: left[index]?.amount ?? '',
    [`${rightHeading} Particulars`]: right[index]?.particulars || '',
    [`${rightHeading} Amount`]: right[index]?.amount ?? '',
  }))
  rows.push({
    [`${leftHeading} Particulars`]: 'Total', [`${leftHeading} Amount`]: total,
    [`${rightHeading} Particulars`]: 'Total', [`${rightHeading} Amount`]: total,
  })
  const html = `<table class="traditional-account"><thead><tr><th colspan="2">${escapeExportHtml(leftHeading)}</th><th colspan="2">${escapeExportHtml(rightHeading)}</th></tr><tr><th>Particulars</th><th class="num debit-cell">Amount</th><th>Particulars</th><th class="num credit-cell">Amount</th></tr></thead><tbody>${Array.from({ length: length + 1 }, (_, index) => {
    const leftRow = index < length ? left[index] : { particulars: 'Total', amount: total }
    const rightRow = index < length ? right[index] : { particulars: 'Total', amount: total }
    return `<tr${index === length ? ' class="total-row"' : ''}><td>${escapeExportHtml(leftRow?.particulars || '')}</td><td class="num debit-cell">${leftRow ? formatReportNumber(leftRow.amount) : ''}</td><td>${escapeExportHtml(rightRow?.particulars || '')}</td><td class="num credit-cell">${rightRow ? formatReportNumber(rightRow.amount) : ''}</td></tr>`
  }).join('')}</tbody></table>`
  return { rows, html }
}

interface HierarchicalReportAccount { name: string; balance?: number }
interface HierarchicalReportGroup { name: string; total: number; accounts: HierarchicalReportAccount[] }
interface HierarchicalReportSection { name: string; total: number; groups: HierarchicalReportGroup[] }

export function buildBalanceSheetExport(
  leftHeading: string,
  rightHeading: string,
  leftSections: HierarchicalReportSection[],
  rightSections: HierarchicalReportSection[],
  leftTotal: number,
  rightTotal: number,
) {
  type ExportLine = { particulars: string; amount: number; level: 'section' | 'group' | 'account' | 'total' }
  const flatten = (sections: HierarchicalReportSection[]): ExportLine[] => sections.flatMap(section => [
    { particulars: section.name, amount: section.total, level: 'section' as const },
    ...section.groups.flatMap(group => [
      { particulars: `  ${group.name}`, amount: group.total, level: 'group' as const },
      ...group.accounts.map(account => ({ particulars: `    ${account.name}`, amount: Number(account.balance || 0), level: 'account' as const })),
    ]),
  ])
  const left = flatten(leftSections)
  const right = flatten(rightSections)
  const length = Math.max(left.length, right.length)
  const rows: Record<string, unknown>[] = Array.from({ length }, (_, index) => ({
    [`${leftHeading} Particulars`]: left[index]?.particulars || '',
    [`${leftHeading} Amount`]: left[index]?.amount ?? '',
    [`${rightHeading} Particulars`]: right[index]?.particulars || '',
    [`${rightHeading} Amount`]: right[index]?.amount ?? '',
  }))
  rows.push({
    [`${leftHeading} Particulars`]: 'Total', [`${leftHeading} Amount`]: leftTotal,
    [`${rightHeading} Particulars`]: 'Total', [`${rightHeading} Amount`]: rightTotal,
  })
  const cell = (line: ExportLine | undefined, numeric = false) => {
    if (!line) return '<td></td>'
    const weight = line.level === 'section' ? 600 : line.level === 'group' ? 500 : 400
    const background = line.level === 'section' ? '#e2e8f0' : line.level === 'group' ? '#f8fafc' : 'transparent'
    const value = numeric ? formatReportNumber(line.amount) : escapeExportHtml(line.particulars)
    return `<td${numeric ? ' class="num balance-cell"' : ''} style="font-family:${numeric ? 'JetBrains Mono, monospace' : 'Inter, Arial, sans-serif'};font-weight:${weight};background:${numeric ? '#dbeafe' : background}">${value}</td>`
  }
  const html = `<table class="traditional-account"><colgroup><col><col style="width:120px"><col><col style="width:120px"></colgroup><thead><tr><th colspan="2">${escapeExportHtml(leftHeading)}</th><th colspan="2">${escapeExportHtml(rightHeading)}</th></tr><tr><th>Particulars</th><th class="num balance-cell">Amount</th><th>Particulars</th><th class="num balance-cell">Amount</th></tr></thead><tbody>${Array.from({ length }, (_, index) => `<tr>${cell(left[index])}${cell(left[index], true)}${cell(right[index])}${cell(right[index], true)}</tr>`).join('')}<tr class="total-row"><td>Total</td><td class="num balance-cell" style="font-family:JetBrains Mono, monospace;font-weight:600">${formatReportNumber(leftTotal)}</td><td>Total</td><td class="num balance-cell" style="font-family:JetBrains Mono, monospace;font-weight:600">${formatReportNumber(rightTotal)}</td></tr></tbody></table>`
  return { rows, html }
}

export function formatReportNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function escapeExportHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}
