import type { Account } from './api'

export type AccountType = Account['type']

export const accountGroups: Record<AccountType, string[]> = {
  Asset: [
    'Fixed Assets', 'Current Assets', 'Cash', 'Bank', 'Inventory',
    'Accounts Receivable', 'Investments', 'Intangible Assets', 'Other Assets',
  ],
  Liability: [
    'Current Liabilities', 'Accounts Payable', 'Duties & Taxes',
    'Short-term Liabilities', 'Long-term Liabilities', 'Provisions', 'Other Liabilities',
  ],
  Equity: [
    'Capital', 'Partner Capital', 'Drawings', 'Reserves & Surplus', 'Retained Earnings',
  ],
  Income: [
    'Direct Income', 'Indirect Income', 'Sales', 'Other Income',
  ],
  Expense: [
    'Direct Expenses', 'Indirect Expenses', 'Purchases', 'Cost of Goods Sold',
    'Employee Costs', 'Finance Costs', 'Depreciation', 'Other Expenses',
  ],
}

export const defaultAccountGroup = (type: AccountType) => accountGroups[type][0]
