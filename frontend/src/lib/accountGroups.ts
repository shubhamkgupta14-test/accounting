import type { Account } from './api'

export type AccountType = Account['type']

// Practical groups for sole proprietorships and partnerships. Company-only
// share, allotment, warrant and securities-investment groups are excluded.
export const accountGroups: Record<AccountType, string[]> = {
  Asset: [
    'Land and Building', 'Plant and Machinery', 'Furniture and Fixtures', 'Vehicles',
    'Computers and Office Equipment', 'Other Fixed Assets', 'Intangible Assets',
    'Capital Work-in-Progress', 'Long-term Loans and Advances', 'Security Deposits',
    'Deferred Tax Assets', 'Inventories', 'Trade Receivables', 'Cash-in-Hand',
    'Bank Accounts', 'Short-term Loans and Advances', 'Prepaid Expenses', 'Other Current Assets',
  ],
  Liability: [
    'Secured Loans', 'Unsecured Loans', 'Partner Loans', 'Bank Overdraft and Cash Credit',
    'Deferred Tax Liabilities', 'Long-term Provisions', 'Trade Payables', 'Duties and Taxes',
    'Output GST', 'TDS Payable', 'Outstanding Expenses', 'Salary and Wages Payable',
    'Short-term Provisions', 'Other Current Liabilities',
  ],
  Equity: [
    "Proprietor's Capital", 'Partner Capital', 'Partner Current Accounts', 'Drawings',
    'General Reserve', 'Retained Earnings', 'Current Year Profit and Loss',
  ],
  Income: ['Direct Income', 'Indirect Income', 'Other Income'],
  Expense: ['Direct Expenses', 'Indirect Expenses', 'Other Expenses'],
}

const defaultGroups: Record<AccountType, string> = {
  Asset: 'Other Current Assets', Liability: 'Other Current Liabilities', Equity: "Proprietor's Capital",
  Income: 'Direct Income', Expense: 'Indirect Expenses',
}

export const defaultAccountGroup = (type: AccountType) => defaultGroups[type]

type GroupAccount = Pick<Account, 'group' | 'name' | 'type'>

const assetGroupAlias = (account: GroupAccount) => {
  const group = account.group.trim()
  const normalized = group.toLowerCase()
  const name = account.name.toLowerCase()
  if (accountGroups.Asset.includes(group)) return group
  if (normalized.includes('deffered tax') || normalized.includes('deferred tax')) return 'Deferred Tax Assets'
  if (name.includes('input') && name.includes('gst')) return 'Deferred Tax Assets'
  if (name.includes('land') || name.includes('building')) return 'Land and Building'
  if (name.includes('plant') || name.includes('machinery')) return 'Plant and Machinery'
  if (name.includes('furniture') || name.includes('fixture')) return 'Furniture and Fixtures'
  if (name.includes('vehicle')) return 'Vehicles'
  if (name.includes('computer') || name.includes('office equipment')) return 'Computers and Office Equipment'
  if (normalized.includes('fixed') || normalized.includes('property, plant')) return 'Other Fixed Assets'
  if (normalized === 'cash' || name.includes('cash')) return 'Cash-in-Hand'
  if (normalized === 'bank' || name.includes('bank')) return 'Bank Accounts'
  if (normalized.includes('inventory') || normalized.includes('inventories') || name.includes('stock') || name.includes('inventory')) return 'Inventories'
  if (normalized.includes('receivable') || normalized.includes('debtor')) return 'Trade Receivables'
  if (name.includes('prepaid')) return 'Prepaid Expenses'
  if (normalized.includes('deposit')) return 'Security Deposits'
  if (normalized.includes('investment')) return normalized.includes('non-current') ? 'Other Fixed Assets' : 'Other Current Assets'
  if (normalized.includes('non-current') || normalized.includes('long-term')) return 'Long-term Loans and Advances'
  return 'Other Current Assets'
}

const liabilityGroupAlias = (account: GroupAccount) => {
  const group = account.group.trim()
  const normalized = group.toLowerCase()
  const name = account.name.toLowerCase()
  if (accountGroups.Liability.includes(group)) return group
  if (normalized.includes('deffered tax') || normalized.includes('deferred tax')) return 'Deferred Tax Liabilities'
  if (name.includes('output') && name.includes('gst')) return 'Output GST'
  if (name.includes('tds')) return 'TDS Payable'
  if (name.includes('salary') || name.includes('wages')) return 'Salary and Wages Payable'
  if (normalized.includes('creditor') || normalized.includes('trade payable')) return 'Trade Payables'
  if (normalized.includes('provision')) return normalized.includes('long-term') ? 'Long-term Provisions' : 'Short-term Provisions'
  if (name.includes('overdraft') || name.includes('cash credit')) return 'Bank Overdraft and Cash Credit'
  if (name.includes('partner') && name.includes('loan')) return 'Partner Loans'
  if (normalized.includes('unsecured')) return 'Unsecured Loans'
  if (normalized.includes('secured')) return 'Secured Loans'
  if (normalized.includes('borrow') || normalized.includes('loan') || normalized.includes('long-term')) return 'Unsecured Loans'
  if (normalized.includes('tax') || name.includes('gst')) return 'Duties and Taxes'
  if (normalized.includes('outstanding') || name.includes('outstanding')) return 'Outstanding Expenses'
  return 'Other Current Liabilities'
}

const equityGroupAlias = (account: GroupAccount) => {
  const group = account.group.trim()
  const normalizedGroup = group.toLowerCase()
  const normalizedName = account.name.toLowerCase()
  if (accountGroups.Equity.includes(group)) return group
  if (normalizedName.includes('drawings')) return 'Drawings'
  if (normalizedName.includes('profit & loss') || normalizedName.includes('profit and loss')) return 'Current Year Profit and Loss'
  if (normalizedName.includes('retained')) return 'Retained Earnings'
  if (normalizedName.includes('reserve') || normalizedGroup.includes('reserve')) return 'General Reserve'
  if (normalizedName.includes('current account')) return 'Partner Current Accounts'
  if (normalizedName !== 'capital' && normalizedName.endsWith(' capital')) return 'Partner Capital'
  return "Proprietor's Capital"
}

export const balanceSheetGroup = (account: GroupAccount) => {
  if (account.type === 'Asset') return assetGroupAlias(account)
  if (account.type === 'Liability') return liabilityGroupAlias(account)
  return equityGroupAlias(account)
}

// Compatibility export for existing callers.
export const scheduleIIIGroup = balanceSheetGroup

export const actualAccountGroup = (account: GroupAccount) => {
  if (account.type === 'Asset' || account.type === 'Liability' || account.type === 'Equity') return balanceSheetGroup(account)
  const group = account.group.trim()
  const normalized = group.toLowerCase()
  if (accountGroups[account.type].includes(group)) return group
  if (account.type === 'Income') {
    if (normalized.includes('direct') || normalized.includes('revenue from operations')) return 'Direct Income'
    if (normalized.includes('indirect')) return 'Indirect Income'
    return 'Other Income'
  }
  if (normalized.includes('direct') || normalized.includes('cost of goods') || normalized.includes('materials') || normalized.includes('purchases') || normalized.includes('inventories')) return 'Direct Expenses'
  if (normalized.includes('other')) return 'Other Expenses'
  return 'Indirect Expenses'
}

const assetSections = [
  { name: 'Fixed Assets', groups: ['Land and Building', 'Plant and Machinery', 'Furniture and Fixtures', 'Vehicles', 'Computers and Office Equipment', 'Other Fixed Assets', 'Intangible Assets', 'Capital Work-in-Progress'] },
  { name: 'Other Non-current Assets', groups: ['Long-term Loans and Advances', 'Security Deposits', 'Deferred Tax Assets'] },
  { name: 'Current Assets', groups: ['Inventories', 'Trade Receivables', 'Cash-in-Hand', 'Bank Accounts', 'Short-term Loans and Advances', 'Prepaid Expenses', 'Other Current Assets'] },
]

const claimSections = [
  { name: 'Capital Accounts', groups: ["Proprietor's Capital", 'Partner Capital', 'Partner Current Accounts', 'Drawings', 'General Reserve', 'Retained Earnings', 'Current Year Profit and Loss'] },
  { name: 'Long-term Liabilities', groups: ['Secured Loans', 'Unsecured Loans', 'Partner Loans', 'Deferred Tax Liabilities', 'Long-term Provisions'] },
  { name: 'Current Liabilities', groups: ['Bank Overdraft and Cash Credit', 'Trade Payables', 'Duties and Taxes', 'Output GST', 'TDS Payable', 'Outstanding Expenses', 'Salary and Wages Payable', 'Short-term Provisions', 'Other Current Liabilities'] },
]

export interface BalanceSheetGroupSection { name: string; accounts: Account[]; total: number }
export interface BalanceSheetSection { name: string; groups: BalanceSheetGroupSection[]; total: number }

export const buildBalanceSheetSections = (accounts: Account[], side: 'assets' | 'claims'): BalanceSheetSection[] => {
  const definitions = side === 'assets' ? assetSections : claimSections
  const grouped = new Map<string, Account[]>()
  accounts.forEach(account => {
    const group = balanceSheetGroup(account)
    grouped.set(group, [...(grouped.get(group) || []), account])
  })
  return definitions.map(section => {
    const groups = section.groups.map(name => {
      const rows = grouped.get(name) || []
      return { name, accounts: rows, total: rows.reduce((sum, account) => sum + Number(account.balance || 0), 0) }
    }).filter(group => group.accounts.length > 0)
    return { name: section.name, groups, total: groups.reduce((sum, group) => sum + group.total, 0) }
  }).filter(section => section.groups.length > 0)
}

export const buildScheduleIIISections = buildBalanceSheetSections

export const balanceSheetAssetGroup = (account: GroupAccount) =>
  assetSections.find(section => section.groups.includes(balanceSheetGroup(account)))?.name || 'Current Assets'

export const balanceSheetLiabilityGroup = (account: GroupAccount) =>
  claimSections.find(section => section.groups.includes(balanceSheetGroup(account)))?.name || 'Current Liabilities'
