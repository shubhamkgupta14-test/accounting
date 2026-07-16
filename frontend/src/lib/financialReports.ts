import type { Account, FiscalSettings, JournalEntry } from './api'

const BALANCE_SHEET_TYPES = new Set<Account['type']>(['Asset', 'Liability', 'Equity'])
const INVENTORY_TERMS = /stock|inventory|raw[- ]material|finished goods|work[- ]in[- ]progress|\bwip\b|goods in transit|stores (?:and|&) spares/i

export interface FinancialReports {
  period: { start: string; end: string }
  trialAccounts: Account[]
  directExpenses: Account[]
  directIncome: Account[]
  indirectExpenses: Account[]
  indirectIncome: Account[]
  assets: Account[]
  liabilitiesAndCapital: Account[]
  openingStock: number
  closingStock: number
  openingRetainedEarnings: number
  grossProfit: number
  netProfit: number
}

const monthNumber = (name: string) => {
  const month = new Date(`${name} 1, 2000`).getMonth()
  return Number.isNaN(month) ? 0 : month
}

const settingDate = (value: string, year: number) => {
  const [monthName, dayText] = value.trim().split(/\s+/)
  const month = monthNumber(monthName)
  const day = Number.parseInt(dayText, 10) || 1
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const fiscalPeriod = (fiscal: FiscalSettings) => {
  const yearMatch = fiscal.financial_year.match(/\d{4}/)
  const startYear = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear()
  const start = settingDate(fiscal.start, startYear)
  let end = settingDate(fiscal.end, startYear)
  if (end < start) end = settingDate(fiscal.end, startYear + 1)
  return { start, end }
}

const debitNature = (account: Account) => ['Asset', 'Expense'].includes(account.type)

const lineAmount = (account: Account, line: JournalEntry['entries'][number]) => {
  const debit = Number(line.debit ?? line.dr) || 0
  const credit = Number(line.credit ?? line.cr) || 0
  return debitNature(account) ? debit - credit : credit - debit
}

const isStockAccount = (account: Account) =>
  account.type === 'Asset' && INVENTORY_TERMS.test(`${account.name} ${account.group}`)

const reportAccount = (account: Account, balance: number): Account => ({ ...account, balance })

export function buildFinancialReports(
  accounts: Account[],
  journals: JournalEntry[],
  fiscal: FiscalSettings,
): FinancialReports {
  const period = fiscalPeriod(fiscal)
  const accountByName = new Map(accounts.map(account => [account.name, account]))
  const posted = journals.filter(journal => journal.status === 'Posted')
  const priorMovement = new Map<string, number>()
  const currentMovement = new Map<string, number>()

  for (const journal of posted) {
    const target = journal.date.slice(0, 10) < period.start
      ? priorMovement
      : journal.date.slice(0, 10) <= period.end
        ? currentMovement
        : undefined
    if (!target) continue
    for (const line of journal.entries) {
      const account = accountByName.get(line.account)
      if (!account) continue
      target.set(account.name, (target.get(account.name) || 0) + lineAmount(account, line))
    }
  }

  const openingBalances = new Map<string, number>()
  const closingBalances = new Map<string, number>()
  for (const account of accounts) {
    if (BALANCE_SHEET_TYPES.has(account.type)) {
      const opening = (Number(account.opening_balance) || 0) + (priorMovement.get(account.name) || 0)
      openingBalances.set(account.name, opening)
      closingBalances.set(account.name, opening + (currentMovement.get(account.name) || 0))
    } else {
      closingBalances.set(account.name, currentMovement.get(account.name) || 0)
    }
  }

  const stockAccounts = accounts.filter(isStockAccount)
  const openingStock = stockAccounts.reduce((sum, account) => sum + (openingBalances.get(account.name) || 0), 0)
  const closingStock = stockAccounts.reduce((sum, account) => sum + (closingBalances.get(account.name) || 0), 0)

  // Periodic-stock journals often post Closing Stock Dr / Purchases Cr (and
  // reverse that entry at the next FY opening). Remove those counterpart lines
  // from direct-account balances because opening/closing stock is presented
  // separately in the Trading Account.
  const normalizedDirect = new Map(currentMovement)
  for (const journal of posted) {
    const date = journal.date.slice(0, 10)
    if (date < period.start || date > period.end) continue
    const containsStock = journal.entries.some(line => {
      const account = accountByName.get(line.account)
      return account ? isStockAccount(account) : false
    })
    if (!containsStock) continue
    for (const line of journal.entries) {
      const account = accountByName.get(line.account)
      const normalizedName = line.account.trim().toLowerCase()
      if (!account || (
        !['Direct Expenses', 'Direct Income'].includes(account.group)
        && !['purchase', 'purchases', 'sale', 'sales'].includes(normalizedName)
      )) continue
      const adjustment = lineAmount(account, line)
      normalizedDirect.set(account.name, (normalizedDirect.get(account.name) || 0) - adjustment)
    }
  }

  const rowsFor = (type: Account['type'], group: string, balances = currentMovement) => accounts
    .filter(account => account.type === type && account.group === group)
    .map(account => reportAccount(account, balances.get(account.name) || 0))
    .filter(account => (account.balance || 0) !== 0)

  const directExpenses = rowsFor('Expense', 'Direct Expenses', normalizedDirect)
  const directIncome = rowsFor('Income', 'Direct Income', normalizedDirect)
  const indirectExpenses = rowsFor('Expense', 'Indirect Expenses')
  const indirectIncome = rowsFor('Income', 'Indirect Income')
  const directExpenseTotal = directExpenses.reduce((sum, account) => sum + (account.balance || 0), 0)
  const directIncomeTotal = directIncome.reduce((sum, account) => sum + (account.balance || 0), 0)
  const grossProfit = directIncomeTotal + closingStock - openingStock - directExpenseTotal
  const netProfit = grossProfit
    + indirectIncome.reduce((sum, account) => sum + (account.balance || 0), 0)
    - indirectExpenses.reduce((sum, account) => sum + (account.balance || 0), 0)

  const permanentRows = accounts
    .filter(account => BALANCE_SHEET_TYPES.has(account.type))
    .map(account => reportAccount(account, closingBalances.get(account.name) || 0))
  const openingAssets = accounts
    .filter(account => account.type === 'Asset')
    .reduce((sum, account) => sum + (openingBalances.get(account.name) || 0), 0)
  const openingClaims = accounts
    .filter(account => ['Liability', 'Equity'].includes(account.type))
    .reduce((sum, account) => sum + (openingBalances.get(account.name) || 0), 0)
  const openingRetainedEarnings = openingAssets - openingClaims
  const trialAccounts = [
    ...permanentRows,
    ...accounts
      .filter(account => !BALANCE_SHEET_TYPES.has(account.type))
      .map(account => reportAccount(account, currentMovement.get(account.name) || 0)),
  ].filter(account => Math.abs(account.balance || 0) >= 0.005)

  return {
    period,
    trialAccounts,
    directExpenses,
    directIncome,
    indirectExpenses,
    indirectIncome,
    assets: permanentRows.filter(account => account.type === 'Asset' && Math.abs(account.balance || 0) >= 0.005),
    liabilitiesAndCapital: [
      ...permanentRows.filter(account => ['Liability', 'Equity'].includes(account.type) && account.name !== 'Profit & Loss Account' && Math.abs(account.balance || 0) >= 0.005),
    ],
    openingStock,
    closingStock,
    openingRetainedEarnings,
    grossProfit,
    netProfit,
  }
}
