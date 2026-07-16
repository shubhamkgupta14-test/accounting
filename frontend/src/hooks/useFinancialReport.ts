import { useEffect, useMemo, useState } from 'react'
import { api, type Account, type FinancialReportRow, type FinancialStatementResponse, type FiscalSettings } from '../lib/api'
import { fiscalPeriod, type FinancialReports } from '../lib/financialReports'

export interface SelectedPeriod { start: string; end: string }

const accountFromRow = (row: FinancialReportRow, type: Account['type']): Account => ({
  id: row.code || row.name,
  code: row.code || row.name,
  name: row.name,
  type,
  group: row.group,
  opening_balance: 0,
  balance: row.amount,
  is_active: true,
})

const mapResponse = (data: FinancialStatementResponse): FinancialReports => ({
  period: { start: data.period.start_date, end: data.period.end_date },
  trialAccounts: data.trial_balance.rows.map(row => ({
    ...accountFromRow(row, row.type),
    opening_balance: row.opening_balance,
    balance: row.closing_balance,
  })),
  directExpenses: data.profit_and_loss.direct_expenses.map(row => accountFromRow(row, 'Expense')),
  directIncome: data.profit_and_loss.direct_income.map(row => accountFromRow(row, 'Income')),
  indirectExpenses: data.profit_and_loss.indirect_expenses.map(row => accountFromRow(row, 'Expense')),
  indirectIncome: data.profit_and_loss.indirect_income.map(row => accountFromRow(row, 'Income')),
  assets: data.balance_sheet.assets.map(row => accountFromRow(row, 'Asset')),
  liabilitiesAndCapital: data.balance_sheet.liabilities_and_capital
    .map(row => accountFromRow(row, row.group === 'Capital' ? 'Equity' : 'Liability')),
  openingStock: data.profit_and_loss.opening_stock,
  closingStock: data.profit_and_loss.closing_stock,
  openingRetainedEarnings: data.balance_sheet.opening_retained_earnings,
  grossProfit: data.profit_and_loss.gross_profit,
  netProfit: data.profit_and_loss.net_profit,
})

export function useFinancialReport(fiscal: FiscalSettings) {
  const defaultPeriod = useMemo(() => fiscalPeriod(fiscal), [fiscal])
  const [period, setPeriod] = useState<SelectedPeriod>(defaultPeriod)
  const [report, setReport] = useState<FinancialReports | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => setPeriod(defaultPeriod), [defaultPeriod.start, defaultPeriod.end])
  useEffect(() => {
    if (!period.start || !period.end || period.end < period.start) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api.financialStatements(period.start, period.end)
      .then(data => { if (!controller.signal.aborted) setReport(mapResponse(data)) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load report') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period.start, period.end])

  return { report, period, setPeriod, loading, error }
}
