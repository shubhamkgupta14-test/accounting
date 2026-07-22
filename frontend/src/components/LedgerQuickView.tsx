import { useEffect, useRef, useState } from 'react'
import { GripHorizontal, X } from 'lucide-react'
import { api, type Account, type LedgerRow } from '../lib/api'
import { useAppSettings } from '../context/SettingsContext'
import { Spinner } from './Loading'
import { formatReportNumber } from '../lib/export'
import EmptyTableRow from './EmptyTableRow'

export default function LedgerQuickView() {
  const { formatDate, currencySymbol } = useAppSettings()
  const [accountName, setAccountName] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState({ x: 100, y: 70 })
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const open = (event: Event) => {
      const name = (event as CustomEvent<{ account: string }>).detail?.account
      if (!name) return
      setAccountName(name)
      setPosition({ x: Math.max(16, (window.innerWidth - Math.min(1050, window.innerWidth - 32)) / 2), y: 55 })
    }
    window.addEventListener('open-account-ledger', open)
    return () => window.removeEventListener('open-account-ledger', open)
  }, [])

  useEffect(() => {
    if (!accountName) return
    setLoading(true)
    Promise.all([api.accounts(), api.ledger(accountName)])
      .then(([accounts, ledger]) => {
        setAccount(accounts.find(row => row.name === accountName) || null)
        setRows(ledger)
      })
      .catch(() => { setAccount(null); setRows([]) })
      .finally(() => setLoading(false))
  }, [accountName])

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 280, drag.current.left + event.clientX - drag.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, drag.current.top + event.clientY - drag.current.y)),
      })
    }
    const stop = () => { drag.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop) }
  }, [])

  if (!accountName) return null
  const closing = account?.balance ?? rows[rows.length - 1]?.balance ?? 0
  const totalDebit = rows.reduce((sum, row) => sum + (Number(row.debit) || 0), 0)
  const totalCredit = rows.reduce((sum, row) => sum + (Number(row.credit) || 0), 0)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.28)' }} onMouseDown={event => {
      if (event.target === event.currentTarget) setAccountName('')
    }}>
      <section role="dialog" aria-modal="true" aria-label={`${accountName} ledger`} style={{
        position: 'absolute', left: position.x, top: position.y, width: 'min(1050px, calc(100vw - 32px))',
        height: 'min(720px, calc(100vh - 80px))', background: 'white', borderRadius: 10,
        boxShadow: '0 24px 70px rgba(15,23,42,.3)', border: '1px solid #CBD5E1', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <header onMouseDown={event => { drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y } }} style={{
          padding: '11px 14px', background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)', color: 'white', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', cursor: 'move', userSelect: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><GripHorizontal size={16} /><strong>{accountName} Ledger</strong></div>
          <button type="button" className="btn-icon btn-icon-inverse" aria-label="Close ledger window" onMouseDown={event => event.stopPropagation()} onClick={() => setAccountName('')}
            style={{ border: 0, background: 'transparent', color: 'white', cursor: 'pointer', display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B', fontSize: 13 }}>{account ? `${account.type} · ${account.group} · ${account.code}` : accountName}</span>
          <strong style={{ color: closing >= 0 ? '#059669' : '#DC2626' }}>
            Closing Balance: {formatReportNumber(Math.abs(closing))}
          </strong>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {loading ? <div className="empty-state"><Spinner /> Loading ledger…</div> : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Particulars</th><th>Voucher No.</th><th className="num">Debit ({currencySymbol})</th><th className="num">Credit ({currencySymbol})</th><th className="num">Balance ({currencySymbol})</th></tr></thead>
              <tbody>
                {rows.map((row, index) => <tr key={`${row.voucher_no}-${index}`}>
                  <td className="date-cell">{formatDate(row.date)}</td><td>{row.particulars}</td><td className="mono">{row.voucher_no}</td>
                  <td className="num dr-amount">{row.debit ? formatReportNumber(row.debit) : '—'}</td>
                  <td className="num cr-amount">{row.credit ? formatReportNumber(row.credit) : '—'}</td>
                  <td className="num total-amount">{formatReportNumber(Math.abs(row.balance))}</td>
                </tr>)}
                {!rows.length && <EmptyTableRow colSpan={6} />}
              </tbody>
              {rows.length > 0 && <tfoot>
                <tr className="totals-row">
                  <td colSpan={3} style={{ padding: '11px 16px', fontWeight: 700 }}>Total / Closing Balance</td>
                  <td className="num dr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{formatReportNumber(totalDebit)}</td>
                  <td className="num cr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{formatReportNumber(totalCredit)}</td>
                  <td className="num total-amount" style={{ padding: '11px 16px', fontWeight: 700, color: '#2563EB' }}>{formatReportNumber(Math.abs(closing))}</td>
                </tr>
              </tfoot>}
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
