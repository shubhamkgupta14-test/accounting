import { describe, expect, it } from 'vitest'
import { csvCell } from './export'

describe('CSV export hardening', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\tformula', '\rformula'])('escapes formula-like value %s', value => {
    expect(csvCell(value)).toBe(`"'${value}"`)
  })

  it('escapes quotes without modifying normal text', () => {
    expect(csvCell('Acme "Books"')).toBe('"Acme ""Books"""')
  })
})
