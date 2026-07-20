import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { SelectedPeriod } from '../hooks/useFinancialReport'

interface Props {
  period: SelectedPeriod
  onChange: (period: SelectedPeriod) => void
  loading?: boolean
  error?: string
}

const fyPeriod = (startYear: number): SelectedPeriod => ({ start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` })

export default function ReportPeriodFilter({ period, onChange, loading, error }: Props) {
  const today = new Date()
  const currentFYStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const [dataFYYears, setDataFYYears] = useState<number[]>([])
  const [selection, setSelection] = useState(String(currentFYStart))
  const initialized = useRef(false)
  const selectedFY = period.start.endsWith('-04-01') && period.end.endsWith('-03-31')
    ? Number(period.start.slice(0, 4))
    : null
  useEffect(() => {
    api.financialYears()
      .then(result => setDataFYYears(result.periods.map(item => Number(item.start_date.slice(0, 4)))))
      .catch(() => setDataFYYears([]))
  }, [])
  const fyYears = Array.from(new Set([
    ...dataFYYears,
    ...(selectedFY === null ? [] : [selectedFY]),
    currentFYStart,
  ])).sort((a, b) => b - a)
  const allPeriod = dataFYYears.length
    ? {
        start: `${Math.min(...dataFYYears)}-04-01`,
        end: `${Math.max(...dataFYYears) + 1}-03-31`,
      }
    : fyPeriod(currentFYStart)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const currentPeriod = fyPeriod(currentFYStart)
    setSelection(String(currentFYStart))
    if (period.start !== currentPeriod.start || period.end !== currentPeriod.end) onChange(currentPeriod)
  }, [currentFYStart, onChange, period.end, period.start])

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12, color: '#475569' }}>Period
        <select className="select" style={{ display: 'block', marginTop: 5, minWidth: 170 }} value={selection} onChange={event => {
          const value = event.target.value
          setSelection(value)
          if (value === 'all') onChange(allPeriod)
          else onChange(fyPeriod(Number(value)))
        }}>
          <option value="all">All financial years</option>
          {fyYears.map(year => <option key={year} value={year}>FY {year}-{String(year + 1).slice(2)}</option>)}
        </select>
      </label>
      <span style={{ paddingBottom: 9, fontSize: 12, color: error ? '#DC2626' : '#64748B' }}>{error || (loading ? 'Refreshing report…' : 'Period transactions and opening balances applied')}</span>
    </div>
  )
}
