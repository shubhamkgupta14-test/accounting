import { describe, expect, it } from 'vitest'
import type { Account, FiscalSettings, JournalEntry } from './api'
import { buildFinancialReports, fiscalPeriod } from './financialReports'

const fiscal = (financial_year: string): FiscalSettings => ({
  start: 'April 1',
  end: 'March 31',
  financial_year,
  currency: 'INR',
  date_format: 'DD/MM/YYYY',
  voucher_numbering: 'auto',
})

const accounts: Account[] = [
  { id: 'cash', code: 'CASH', name: 'Cash', type: 'Asset', group: 'Cash', opening_balance: 500, is_active: true },
  { id: 'stock', code: 'STOCK', name: 'Closing Stock', type: 'Asset', group: 'Current Assets', opening_balance: 0, is_active: true },
  { id: 'capital', code: 'CAP', name: 'Capital', type: 'Equity', group: 'Capital', opening_balance: 500, is_active: true },
  { id: 'purchases', code: 'PUR', name: 'Purchases', type: 'Expense', group: 'Direct Expenses', opening_balance: 0, is_active: true },
  { id: 'sales', code: 'SALE', name: 'Sales', type: 'Income', group: 'Direct Income', opening_balance: 0, is_active: true },
  { id: 'rent', code: 'RENT', name: 'Rent Expense', type: 'Expense', group: 'Indirect Expenses', opening_balance: 0, is_active: true },
]

const journal = (
  id: string,
  date: string,
  narration: string,
  entries: Array<[string, number, number]>,
  status: JournalEntry['status'] = 'Posted',
): JournalEntry => ({
  id,
  date,
  voucher_no: id,
  voucherNo: id,
  narration,
  status,
  entries: entries.map(([account, debit, credit]) => ({ account, debit, credit, dr: debit, cr: credit })),
})

const firstYearJournals: JournalEntry[] = [
  journal('PURCHASE', '2026-04-10', 'Goods purchased for cash', [['Purchases', 300, 0], ['Cash', 0, 300]]),
  journal('SALE', '2026-05-10', 'Goods sold for cash', [['Cash', 500, 0], ['Sales', 0, 500]]),
  journal('RENT', '2026-06-10', 'Rent paid', [['Rent Expense', 50, 0], ['Cash', 0, 50]]),
  journal('CLOSE', '2027-03-31', 'Closing stock valued and recorded', [['Closing Stock', 100, 0], ['Purchases', 0, 100]]),
]

describe('financial year reports', () => {
  it('builds an April-to-March period from the configured FY', () => {
    expect(fiscalPeriod(fiscal('2026-27'))).toEqual({ start: '2026-04-01', end: '2027-03-31' })
  })

  it('shows closing stock separately without double-counting its purchases adjustment', () => {
    const report = buildFinancialReports(accounts, firstYearJournals, fiscal('2026-27'))

    expect(report.openingStock).toBe(0)
    expect(report.closingStock).toBe(100)
    expect(report.directExpenses.find(account => account.name === 'Purchases')?.balance).toBe(300)
    expect(report.grossProfit).toBe(300)
    expect(report.netProfit).toBe(250)
    expect(report.assets.reduce((sum, account) => sum + (account.balance || 0), 0)).toBe(750)
  })

  it('carries prior closing stock and profit into the next FY while resetting nominal accounts', () => {
    const report = buildFinancialReports(accounts, firstYearJournals, fiscal('2027-28'))

    expect(report.openingStock).toBe(100)
    expect(report.closingStock).toBe(100)
    expect(report.directExpenses).toEqual([])
    expect(report.directIncome).toEqual([])
    expect(report.grossProfit).toBe(0)
    expect(report.netProfit).toBe(0)
    expect(report.openingRetainedEarnings).toBe(250)
    expect(report.trialAccounts.some(account => account.name === 'Sales')).toBe(false)
    expect(report.trialAccounts.some(account => account.name === 'Profit & Loss Account')).toBe(false)
  })

  it('handles the new-year opening-stock reversal and reports the opening stock once', () => {
    const journals = [
      ...firstYearJournals,
      journal('OPEN', '2027-04-01', 'Opening stock brought forward', [['Purchases', 100, 0], ['Closing Stock', 0, 100]]),
    ]
    const report = buildFinancialReports(accounts, journals, fiscal('2027-28'))

    expect(report.openingStock).toBe(100)
    expect(report.closingStock).toBe(0)
    expect(report.directExpenses).toEqual([])
    expect(report.grossProfit).toBe(-100)
    expect(report.netProfit).toBe(-100)
  })
})
