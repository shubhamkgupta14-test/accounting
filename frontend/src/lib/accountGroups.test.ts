import { describe, expect, it } from 'vitest'
import type { Account } from './api'
import { actualAccountGroup, balanceSheetGroup, buildBalanceSheetSections } from './accountGroups'

const account = (name: string, type: Account['type'], group: string, balance = 0): Account => ({
  id: name, code: name, name, type, group, opening_balance: 0, balance, is_active: true,
})

describe('proprietorship and partnership account groups', () => {
  it('maps legacy GST spellings into separate deferred tax groups', () => {
    expect(balanceSheetGroup(account('Input IGST', 'Asset', 'Deffered Tax Assets')))
      .toBe('Deferred Tax Assets')
    expect(balanceSheetGroup(account('Output SGST', 'Liability', 'Deffered Tax Liabilities')))
      .toBe('Deferred Tax Liabilities')
  })

  it('shows type-accurate groups for legacy ledger accounts', () => {
    expect(actualAccountGroup(account('Sales', 'Income', 'Revenue from Operations'))).toBe('Direct Income')
    expect(actualAccountGroup(account('Salary Expense', 'Expense', 'Employee Benefits Expense'))).toBe('Indirect Expenses')
  })

  it('builds statutory sections and moves their calculations with them', () => {
    const sections = buildBalanceSheetSections([
      account('Input CGST', 'Asset', 'Deferred Tax Assets (Net)', 120),
      account('Cash', 'Asset', 'Cash and Cash Equivalents', 80),
    ], 'assets')

    expect(sections.map(section => [section.name, section.total])).toEqual([
      ['Other Non-current Assets', 120],
      ['Current Assets', 80],
    ])
  })
})
