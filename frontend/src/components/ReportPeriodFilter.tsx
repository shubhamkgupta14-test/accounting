import { useEffect, useState } from 'react'
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
    ...(dataFYYears.length === 0 ? [currentFYStart] : []),
  ])).sort((a, b) => b - a)
  const allPeriod = dataFYYears.length
    ? {
        start: `${Math.min(...dataFYYears)}-04-01`,
        end: `${Math.max(...dataFYYears) + 1}-03-31`,
      }
    : fyPeriod(currentFYStart)
  const isAll = dataFYYears.length > 1 && period.start === allPeriod.start && period.end === allPeriod.end
  const selectedPeriod = isAll ? 'all' : (selectedFY ?? 'custom')

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12, color: '#475569' }}>Period
        <select className="select" style={{ display: 'block', marginTop: 5, minWidth: 170 }} value={selectedPeriod} onChange={event => {
          if (event.target.value === 'all') onChange(allPeriod)
          else if (event.target.value !== 'custom') onChange(fyPeriod(Number(event.target.value)))
        }}>
          <option value="all">All</option>
          {fyYears.map(year => <option key={year} value={year}>FY {year}-{String(year + 1).slice(2)}</option>)}
          <option value="custom">Custom Range</option>
        </select>
      </label>
      <label style={{ fontSize: 12, color: '#475569' }}>From
        <input aria-label="Report start date" className="input" type="date" style={{ display: 'block', marginTop: 5 }} value={period.start} onChange={event => onChange({ ...period, start: event.target.value })} />
      </label>
      <label style={{ fontSize: 12, color: '#475569' }}>To
        <input aria-label="Report end date" className="input" type="date" style={{ display: 'block', marginTop: 5 }} value={period.end} min={period.start} onChange={event => onChange({ ...period, end: event.target.value })} />
      </label>
      <span style={{ paddingBottom: 9, fontSize: 12, color: error ? '#DC2626' : '#64748B' }}>{error || (loading ? 'Refreshing report…' : 'Period transactions and opening balances applied')}</span>
    </div>
  )
}
