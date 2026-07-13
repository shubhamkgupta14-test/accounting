export function exportRowsAsExcel(filename: string, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || { message: 'No data' })
  const body = rows.length ? rows : [{ message: 'No data' }]
  const csv = [
    headers.join(','),
    ...body.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n')
  downloadBlob(`${filename}.csv`, csv, 'text/csv;charset=utf-8')
}

export function exportElementAsPdf(title: string, html: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 20px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          th { background: #f8fafc; }
          .num { text-align: right; }
          .narration-text { color: #64748b; font-size: 11.5px; font-style: italic; }
        </style>
      </head>
      <body><h1>${title}</h1>${html}</body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
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
