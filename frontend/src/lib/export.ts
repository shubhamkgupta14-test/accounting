export function exportRowsAsExcel(filename: string, rows: Record<string, unknown>[], heading?: string) {
  const headers = Object.keys(rows[0] || { message: 'No data' })
  const body = rows.length ? rows : [{ message: 'No data' }]
  const csv = [
    ...(heading ? [csvCell(heading), ''] : []),
    headers.join(','),
    ...body.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n')
  downloadBlob(`${filename}.csv`, csv, 'text/csv;charset=utf-8')
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
          .debit-cell { color: #047857; }
          .credit-cell { color: #b91c1c; }
          .balance-cell { color: #1d4ed8; }
          .total-row td { background: #e2e8f0; color: #0f172a; font-weight: 700; border-top: 2px solid #94a3b8; }
          .total-row td.debit-cell { color: #047857; }
          .total-row td.credit-cell { color: #b91c1c; }
          .total-row td.balance-cell { color: #1d4ed8; }
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

export function formatReportNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
}

export function escapeExportHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}
