import { useEffect, useState } from 'react'
import { Search, ChevronRight, Plus } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { api, type Account, type LedgerRow } from '../lib/api'
import type { PageId } from '../App'
import ExportMenu from '../components/ExportMenu'
import PageIntro from '../components/PageIntro'
import TablePagination from '../components/TablePagination'
import { useAppSettings } from '../context/SettingsContext'
import { TableSkeletonRows } from '../components/Loading'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import AccountDrilldown from '../components/AccountDrilldown'
import { buildTraditionalTwoSidedExport, escapeExportHtml, exportElementAsPdf, exportRowsAsExcel, formatReportNumber } from '../lib/export'

interface Props {
  onNavigate?: (page: PageId) => void
}

function traditionalLedgerExport(account: Account, rows: LedgerRow[]) {
  const debitNature = account.type === 'Asset' || account.type === 'Expense'
  const debit: Array<{ particulars: string; amount: number }> = []
  const credit: Array<{ particulars: string; amount: number }> = []
  const opening = Number(account.opening_balance) || 0
  const openingIsDebit = (debitNature && opening >= 0) || (!debitNature && opening < 0)
  if (Math.abs(opening) >= 0.005) {
    ;(openingIsDebit ? debit : credit).push({ particulars: `${openingIsDebit ? 'To' : 'By'} Balance b/d`, amount: Math.abs(opening) })
  }
  rows.forEach(row => {
    if (row.debit) debit.push({ particulars: `To ${row.particulars} (${row.voucher_no})`, amount: row.debit })
    if (row.credit) credit.push({ particulars: `By ${row.particulars} (${row.voucher_no})`, amount: row.credit })
  })
  const closing = Number(account.balance) || 0
  const closingIsDebit = (debitNature && closing >= 0) || (!debitNature && closing < 0)
  if (Math.abs(closing) >= 0.005) {
    ;(closingIsDebit ? credit : debit).push({ particulars: `${closingIsDebit ? 'By' : 'To'} Balance c/d`, amount: Math.abs(closing) })
  }
  const total = Math.max(debit.reduce((sum, row) => sum + row.amount, 0), credit.reduce((sum, row) => sum + row.amount, 0))
  return buildTraditionalTwoSidedExport('Dr.', 'Cr.', debit, credit, total)
}

export default function Ledger({ onNavigate }: Props) {
  const { accounts } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const { canWrite } = useAuth()
  const requestedAccount = new URLSearchParams(window.location.search).get('account') || ''
  const [selected, setSelected] = useState(requestedAccount)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [exportRows, setExportRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalRows, setTotalRows] = useState(0)
  const [activeAccountNames, setActiveAccountNames] = useState<Set<string>>(new Set())
  const [loadingAccounts, setLoadingAccounts] = useState(true)

  const ledgerAccounts = accounts.filter(account => activeAccountNames.has(account.name) || account.name === requestedAccount)
  const selectedName = ledgerAccounts.some(account => account.name === selected)
    ? selected
    : ledgerAccounts[0]?.name || ''
  const account = ledgerAccounts.find(a => a.name === selectedName)
  const filteredAccounts = ledgerAccounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.group.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    api.ledgerAccounts()
      .then(result => setActiveAccountNames(new Set(result.accounts)))
      .catch(() => setActiveAccountNames(new Set()))
      .finally(() => setLoadingAccounts(false))
  }, [])

  useEffect(() => {
    if (!selectedName) {
      setRows([])
      return
    }
    setLoading(true)
    api.ledgerPage(selectedName, { page, page_size: pageSize })
      .then(data => {
        setRows(data.items.map(row => ({ ...row, voucherNo: row.voucher_no, dr: row.debit, cr: row.credit })))
        setTotalRows(data.total)
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [page, pageSize, selectedName])

  useEffect(() => {
    if (!selectedName) { setExportRows([]); return }
    api.ledger(selectedName).then(setExportRows).catch(() => setExportRows([]))
  }, [selectedName])

  const totalDr = rows.reduce((s, r) => s + r.dr, 0)
  const totalCr = rows.reduce((s, r) => s + r.cr, 0)
  const closingBalance = account?.balance ?? rows[rows.length - 1]?.balance ?? 0
  const balanceSide = (balance: number) => {
    const debitNature = account?.type === 'Asset' || account?.type === 'Expense'
    return (debitNature && balance >= 0) || (!debitNature && balance < 0) ? 'Dr' : 'Cr'
  }

  if (loadingAccounts) {
    return (
      <div>
        <div className="page-header"><PageIntro id="ledger" /></div>
        <div className="card empty-state">Loading ledger accounts…</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div>
        <div className="page-header">
          <PageIntro id="ledger" />
        </div>
        <div className="card empty-state">No posted journal activity found. Post a journal entry to create ledger data.</div>
      </div>
    )
  }

  const debitNature = account.type === 'Asset' || account.type === 'Expense'
  const debitExport: Array<{ particulars: string; amount: number }> = []
  const creditExport: Array<{ particulars: string; amount: number }> = []
  const opening = Number(account.opening_balance) || 0
  const openingIsDebit = (debitNature && opening >= 0) || (!debitNature && opening < 0)
  if (Math.abs(opening) >= 0.005) {
    ;(openingIsDebit ? debitExport : creditExport).push({ particulars: `${openingIsDebit ? 'To' : 'By'} Balance b/d`, amount: Math.abs(opening) })
  }
  exportRows.forEach(row => {
    if (row.debit) debitExport.push({ particulars: `To ${row.particulars} (${row.voucher_no})`, amount: row.debit })
    if (row.credit) creditExport.push({ particulars: `By ${row.particulars} (${row.voucher_no})`, amount: row.credit })
  })
  const closingIsDebit = (debitNature && closingBalance >= 0) || (!debitNature && closingBalance < 0)
  if (Math.abs(closingBalance) >= 0.005) {
    ;(closingIsDebit ? creditExport : debitExport).push({
      particulars: `${closingIsDebit ? 'By' : 'To'} Balance c/d`, amount: Math.abs(closingBalance),
    })
  }
  const ledgerTotal = Math.max(
    debitExport.reduce((sum, row) => sum + row.amount, 0),
    creditExport.reduce((sum, row) => sum + row.amount, 0),
  )
  const ledgerExport = buildTraditionalTwoSidedExport('Dr.', 'Cr.', debitExport, creditExport, ledgerTotal)
  const exportLedgers = async (accountNames: string[], format: 'pdf' | 'excel', traditional: boolean) => {
    const selectedAccounts = ledgerAccounts.filter(item => accountNames.includes(item.name))
    const ledgers = await Promise.all(selectedAccounts.map(async ledgerAccount => ({
      account: ledgerAccount,
      rows: await api.ledger(ledgerAccount.name),
    })))
    const reports = ledgers.map(item => ({ ...item, report: traditionalLedgerExport(item.account, item.rows) }))
    const heading = accountNames.length === ledgerAccounts.length ? 'All Ledger Accounts' : 'Selected Ledger Accounts'
    if (format === 'pdf') {
      const html = reports.map(item => {
        if (traditional) return `<section style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #cbd5e1"><h2>${escapeExportHtml(item.account.name)} Ledger</h2>${item.report.html}</section>`
        return `<section style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #cbd5e1"><h2>${escapeExportHtml(item.account.name)} Ledger</h2><table><thead><tr><th>Date</th><th>Particulars</th><th>Voucher No.</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${item.rows.map(row => `<tr><td class="date-cell">${escapeExportHtml(row.date)}</td><td class="narration-cell">${escapeExportHtml(row.particulars)}</td><td>${escapeExportHtml(row.voucher_no)}</td><td>${escapeExportHtml(row.type)}</td><td class="num debit-cell">${row.debit ? formatReportNumber(row.debit) : ''}</td><td class="num credit-cell">${row.credit ? formatReportNumber(row.credit) : ''}</td><td class="num balance-cell">${formatReportNumber(row.balance)}</td></tr>`).join('')}<tr class="total-row"><td></td><td>Net Balance</td><td></td><td></td><td></td><td></td><td class="num balance-cell">${formatReportNumber(item.account.balance || 0)}</td></tr></tbody></table></section>`
      }).join('')
      exportElementAsPdf(heading, html)
      return
    }
    const combined = traditional
      ? reports.flatMap(item => [
          { 'Dr. Particulars': `${item.account.name} Ledger`, 'Dr. Amount': '', 'Cr. Particulars': '', 'Cr. Amount': '' },
          ...item.report.rows,
          { 'Dr. Particulars': '', 'Dr. Amount': '', 'Cr. Particulars': '', 'Cr. Amount': '' },
        ])
      : reports.flatMap(item => item.rows.map(row => ({
          Account: item.account.name, Date: row.date, Particulars: row.particulars, 'Voucher No.': row.voucher_no,
          Type: row.type, Debit: row.debit, Credit: row.credit, Balance: row.balance,
        })).concat([{
          Account: item.account.name, Date: '', Particulars: 'Net Balance', 'Voucher No.': '',
          Type: '', Debit: '', Credit: '', Balance: item.account.balance || 0,
        }]))
    exportRowsAsExcel('ledger-accounts', combined, heading)
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="ledger" />
        <div style={{ display: 'flex', gap: 8 }}>
          <AuditUncheckAllButton />
          <ExportMenu compact fullReport rowsOnly title={`${account?.name || 'Ledger'} Ledger`}
            traditionalRows={ledgerExport.rows} traditionalPdfHtml={ledgerExport.html}
            allAccountsExport={{ label: 'All ledger accounts', pdf: traditional => exportLedgers(ledgerAccounts.map(item => item.name), 'pdf', traditional), excel: traditional => exportLedgers(ledgerAccounts.map(item => item.name), 'excel', traditional) }}
            customAccountsExport={{ options: ledgerAccounts.map(item => item.name), pdf: (names, traditional) => exportLedgers(names, 'pdf', traditional), excel: (names, traditional) => exportLedgers(names, 'excel', traditional) }}
            rows={[...exportRows.map(row => ({
            Date: row.date, Particulars: row.particulars, 'Voucher No.': row.voucherNo,
            Type: row.type, Debit: row.dr, Credit: row.cr, Balance: row.balance,
          })), { Date: '', Particulars: 'Net Balance', 'Voucher No.': '', Type: '', Debit: '', Credit: '', Balance: closingBalance }]} />
          {onNavigate && canWrite && (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => onNavigate('chart-of-accounts')}>
              <Plus size={14} /> Add Ledger Account
            </button>
          )}
        </div>
      </div>

      <div className="ledger-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card ledger-account-list" style={{ height: 'fit-content', maxHeight: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input className="input" style={{ paddingLeft: 28, height: 32, fontSize: 12.5 }}
                placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(type => {
              const grouped = filteredAccounts.filter(a => a.type === type)
              if (!grouped.length) return null
              return (
                <div key={type}>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{type}</div>
                  {grouped.map(a => (
                    <div key={a.id}
                      onClick={() => { setSelected(a.name); setPage(1) }}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: selectedName === a.name ? '#EFF6FF' : 'transparent',
                        borderLeft: selectedName === a.name ? '3px solid #2563EB' : '3px solid transparent',
                        transition: 'all 0.1s'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: selectedName === a.name ? 600 : 400, color: selectedName === a.name ? '#1D4ED8' : '#0F172A' }}><AccountDrilldown account={a.name} /></div>
                        <div className="narration-text">{a.group}</div>
                      </div>
                      {selectedName === a.name && <ChevronRight size={12} color="#2563EB" />}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{account.name}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span className="badge badge-blue">{account.type}</span>
                  <span className="badge badge-slate">{account.group}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>A/c Code: {account.id}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 2 }}>Closing Balance</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color: closingBalance >= 0 ? '#10B981' : '#EF4444' }}>
                  {formatMoney(Math.abs(closingBalance))}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{balanceSide(closingBalance)}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36, minWidth: 36, padding: 0 }} />
                  <th>Date</th>
                  <th>Particulars</th>
                  <th>Voucher No.</th>
                  <th>Type</th>
                  <th className="num dr-heading">Debit ({currencySymbol})</th>
                  <th className="num cr-heading">Credit ({currencySymbol})</th>
                  <th className="num total-amount">Balance ({currencySymbol})</th>
                </tr>
              </thead>
              <tbody>
                {loading && <TableSkeletonRows rows={pageSize} columns={8} />}
                {!loading && rows.map((r, i) => (
                  <tr key={`${r.voucherNo}-${i}`}>
                    <td style={{ width: 36, minWidth: 36, padding: '8px 4px', textAlign: 'center' }}>
                      <AuditCheckbox item={`ledger entry ${r.voucherNo}`} />
                    </td>
                    <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(r.date)}</span></td>
                    <td><span className="narration-text">{r.particulars}</span></td>
                    <td><span className="mono" style={{ fontSize: 12.5, color: '#64748B' }}>{r.voucherNo}</span></td>
                    <td><span className={`badge ${r.type === 'Receipt' ? 'badge-green' : 'badge-red'}`}>{r.type}</span></td>
                    <td className="num" style={{ color: r.dr ? '#059669' : '#CBD5E1' }}>{r.dr ? r.dr.toLocaleString('en-IN') : '-'}</td>
                    <td className="num" style={{ color: r.cr ? '#DC2626' : '#CBD5E1' }}>{r.cr ? r.cr.toLocaleString('en-IN') : '-'}</td>
                    <td className="num total-amount" style={{ fontWeight: 600 }}>{Math.abs(r.balance).toLocaleString('en-IN')} {balanceSide(r.balance)}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8}><div className="empty-state" style={{ padding: '36px 20px' }}>No journal entries posted for this account.</div></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td colSpan={5} style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700 }}>Page totals</td>
                  <td className="num dr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{totalDr.toLocaleString('en-IN')}</td>
                  <td className="num cr-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{totalCr.toLocaleString('en-IN')}</td>
                  <td className="num total-amount" style={{ padding: '11px 16px', fontWeight: 700 }}>{Math.abs(closingBalance).toLocaleString('en-IN')} {balanceSide(closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
            <TablePagination total={totalRows} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
          </div>
        </div>
      </div>
    </div>
  )
}
