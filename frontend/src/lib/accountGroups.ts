import type { Account } from './api'

export type AccountType = Account['type']

export const accountGroups: Record<AccountType, string[]> = {
  Asset: [
    'Fixed Assets', 'Current Assets', 'Deffered Tax Assets', 'Cash', 'Bank', 'Inventory',
    'Accounts Receivable', 'Investments', 'Intangible Assets', 'Other Assets',
  ],
  Liability: [
    'Current Liabilities', 'Deffered Tax Liabilities', 'Accounts Payable', 'Duties & Taxes',
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

type BalanceSheetAccount = Pick<Account, 'group' | 'name' | 'type'>

export const balanceSheetAssetGroup = (account: BalanceSheetAccount) => {
  const group = account.group.toLowerCase()
  const name = account.name.toLowerCase()
  if (group.includes('deffered tax asset') || group.includes('deferred tax asset')) return 'Deffered Tax Assets'
  if (group.includes('fixed')) return 'Fixed Assets'
  if (group.includes('non-current') || group.includes('long-term')) return 'Non-current Assets'
  if (name.includes('cash')) return 'Cash'
  if (group === 'bank' || name.includes('bank')) return 'Bank'
  return 'Current Assets'
}

export const balanceSheetLiabilityGroup = (account: BalanceSheetAccount) => {
  const group = account.group.toLowerCase()
  if (account.type === 'Equity') return 'Capital'
  if (group.includes('deffered tax liabilit') || group.includes('deferred tax liabilit')) return 'Deffered Tax Liabilities'
  if (group.includes('long-term')) return 'Long-term Liabilities'
  if (group.includes('current') || group.includes('short-term') || group.includes('creditor')) return 'Short-term Liabilities'
  return 'Other Liabilities'
}
