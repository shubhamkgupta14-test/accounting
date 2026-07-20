import { describe, expect, it } from 'vitest'
import { buildPrintDocument, csvCell } from './export'

describe('CSV export hardening', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\tformula', '\rformula'])('escapes formula-like value %s', value => {
    expect(csvCell(value)).toBe(`"'${value}"`)
  })

  it('escapes quotes without modifying normal text', () => {
    expect(csvCell('Acme "Books"')).toBe('"Acme ""Books"""')
  })

  it('preserves the print layout while encoding an untrusted title', () => {
    const document = buildPrintDocument('</title><img src=x onerror=alert(1)> Ledger', '<table><tr><td>Existing report</td></tr></table>')
    expect(document).toContain('&lt;/title&gt;&lt;img src=x onerror=alert(1)&gt; Ledger')
    expect(document).not.toContain('</title><img')
    expect(document).toContain('<table><tr><td>Existing report</td></tr></table>')
    expect(document).toContain('.total-row td')
  })
})
