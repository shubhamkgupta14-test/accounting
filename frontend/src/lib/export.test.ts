import { describe, expect, it } from 'vitest'
import { buildBalanceSheetExport, buildExcelDocument, buildPrintDocument, csvCell, formatReportNumber } from './export'

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
    expect(document).toContain('background: #dcfce7')
    expect(document).toContain('background: #fee2e2')
    expect(document).toContain('background: #dbeafe')
  })

  it('formats every report amount with two decimal places', () => {
    expect(formatReportNumber(1234)).toBe('1,234.00')
    expect(formatReportNumber(1234.5)).toBe('1,234.50')
  })

  it('adds green, red and blue fills to Excel-compatible report exports', () => {
    const document = buildExcelDocument([{ Debit: 10, Credit: 5, Balance: 5 }])
    expect(document).toContain('.debit{background:#dcfce7')
    expect(document).toContain('.credit{background:#fee2e2')
    expect(document).toContain('.balance{background:#dbeafe')
    expect(document).toContain('10.00')
  })
})

describe('Balance Sheet export', () => {
  it('keeps section, subgroup, account and net amounts in aligned columns', () => {
    const report = buildBalanceSheetExport('Capital and Liabilities', 'Assets', [{
      name: 'Capital Accounts', total: 1000, groups: [{
        name: "Proprietor's Capital", total: 1000, accounts: [{ name: 'Capital', balance: 1000 }],
      }],
    }], [{
      name: 'Current Assets', total: 1000, groups: [{
        name: 'Cash-in-Hand', total: 1000, accounts: [{ name: 'Cash', balance: 1000 }],
      }],
    }], 1000, 1000)

    expect(report.rows).toHaveLength(4)
    expect(report.rows[0]['Capital and Liabilities Particulars']).toBe('Capital Accounts')
    expect(report.rows[1]['Assets Particulars']).toBe('  Cash-in-Hand')
    expect(report.rows[3]['Assets Particulars']).toBe('Total')
    expect(report.html).toContain('<col style="width:120px">')
    expect(report.html).toContain('JetBrains Mono, monospace')
    expect(report.html).toContain('balance-cell')
  })
})
