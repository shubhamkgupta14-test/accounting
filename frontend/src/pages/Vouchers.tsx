import { useEffect, useState } from 'react'
import { Plus, Search, Eye, CheckCircle, Clock, Pencil, Trash2 } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import NarrationSuggest from '../components/NarrationSuggest'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type Voucher } from '../lib/api'
import ConfirmModal from '../components/ConfirmModal'
import { Spinner, TableSkeletonRows } from '../components/Loading'

type VoucherType = 'Payment' | 'Receipt' | 'Contra' | 'Sales' | 'Purchase' | 'Journal'

const typeColors: Record<string, string> = {
  Payment: 'badge-red', Receipt: 'badge-green', Contra: 'badge-blue',
  Sales: 'badge-slate', Purchase: 'badge-amber', Journal: 'badge-blue',
}

const types: VoucherType[] = ['Payment', 'Receipt', 'Contra', 'Sales', 'Purchase', 'Journal']
const VoucherModal = ({ voucher, onClose, onApprove, canWrite, formatMoney }: { voucher: any; onClose: () => void; onApprove: () => void; canWrite: boolean; formatMoney: (value: number) => string }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="card" style={{ width: 520, padding: '28px 32px', position: 'relative' }}>
      <button style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }} onClick={onClose}>x</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span className={`badge ${typeColors[voucher.type] || 'badge-slate'}`} style={{ fontSize: 13 }}>{voucher.type} Voucher</span>
        <span className={`badge ${voucher.status === 'Approved' ? 'badge-green' : 'badge-amber'}`}>{voucher.status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {[
          ['Voucher No.', voucher.id],
          ['Date', voucher.date],
          ['Party / Account', voucher.party],
          ['Mode of Payment', voucher.mode],
          ['Amount', formatMoney(voucher.amount)],
          ['Status', voucher.status],
        ].map(([k, v]) => (
          <div key={k}>
            <p style={{ margin: '0 0 3px', fontSize: 11.5, color: '#64748B', fontWeight: 500 }}>{k}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0F172A', fontFamily: k === 'Amount' || k === 'Voucher No.' ? 'JetBrains Mono, monospace' : undefined }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, marginBottom: 20 }}>
        <p style={{ margin: '0 0 3px', fontSize: 11.5, color: '#64748B', fontWeight: 500 }}>Narration</p>
        <p className="narration-text" style={{ margin: 0 }}>{voucher.narration}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        {voucher.status === 'Pending' && canWrite && <button className="btn btn-secondary" onClick={onApprove}>Approve</button>}
        <button className="btn btn-primary">Print Voucher</button>
      </div>
    </div>
  </div>
)

export default function Vouchers() {
  const { createVoucher, approveVoucher } = useLedgerData()
  const { formatMoney, formatDate, currencySymbol } = useAppSettings()
  const { canWrite } = useAuth()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sortBy, setSortBy] = useState('date-desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<any | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [filtered, setFiltered] = useState<Voucher[]>([])
  const [totalVouchers, setTotalVouchers] = useState(0)
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [reloadKey, setReloadKey] = useState(0)
  const [loadingRows, setLoadingRows] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null)
  const [form, setForm] = useState({
    voucher_no: '',
    date: new Date().toISOString().slice(0, 10),
    type: 'Payment' as VoucherType,
    party: '',
    amount: 0,
    mode: '',
    narration: '',
    status: 'Pending' as const,
  })

  const openForm = () => {
    setEditingId(null)
    setForm({ voucher_no: `V-${String(totalVouchers + 1).padStart(3, '0')}`, date: new Date().toISOString().slice(0, 10), type: 'Payment', party: '', amount: 0, mode: '', narration: '', status: 'Pending' })
    setError('')
    setShowForm(true)
  }

  const openEditForm = (voucher: Voucher) => {
    setEditingId(voucher.backendId || voucher.id)
    setForm({
      voucher_no: voucher.voucherNo || voucher.voucher_no,
      date: voucher.date.slice(0, 10),
      type: voucher.type,
      party: voucher.party,
      amount: voucher.amount,
      mode: voucher.mode,
      narration: voucher.narration,
      status: 'Pending',
    })
    setError('')
    setShowForm(true)
    setSelected(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteVoucher = async (voucher: Voucher) => {
    const voucherNo = voucher.voucherNo || voucher.voucher_no
    setDeleteTarget(null)
    try {
      await api.deleteVoucher(voucher.backendId || voucher.id)
      if (selected?.backendId === voucher.backendId) setSelected(null)
      if (filtered.length === 1 && page > 1) setPage(current => current - 1)
      else setReloadKey(key => key + 1)
      showToast('success', `Voucher ${voucherNo} deleted successfully.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to delete voucher.')
    }
  }

  const saveVoucher = async () => {
    if (!form.voucher_no.trim() || !form.party.trim() || !form.mode.trim() || !form.narration.trim() || form.amount <= 0) {
      const message = 'Voucher no., party, mode, amount, and narration are required.'
      setError(message)
      showToast('error', message)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        voucher_no: form.voucher_no.trim(),
        date: form.date,
        type: form.type,
        party: form.party.trim(),
        amount: form.amount,
        mode: form.mode.trim(),
        narration: form.narration.trim(),
      }
      if (editingId) await api.updateVoucher(editingId, payload)
      else await createVoucher({ ...payload, status: 'Pending' })
      setShowForm(false)
      setEditingId(null)
      setReloadKey(key => key + 1)
      showToast('success', editingId ? 'Voucher updated successfully.' : 'Voucher created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create voucher.'
      setError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  const paged = filtered
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingRows(true)
      const [sort_by, sort_order] = sortBy === 'amount-desc' ? ['amount', 'desc'] : ['date', sortBy === 'date-asc' ? 'asc' : 'desc']
      Promise.all([
        api.vouchersPage({ page, page_size: pageSize, search, type: typeFilter === 'All' ? undefined : typeFilter, sort_by, sort_order }),
        api.voucherStats(),
      ]).then(([result, stats]) => {
        setFiltered(result.items.map(row => ({ ...row, backendId: row.id, id: row.voucher_no, voucherNo: row.voucher_no })))
        setTotalVouchers(result.total)
        setTypeCounts(stats.by_type)
      }).catch(() => { setFiltered([]); setTotalVouchers(0) }).finally(() => setLoadingRows(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [page, pageSize, reloadKey, search, sortBy, typeFilter])
  const exportRows = filtered.map(row => ({
    'Voucher No.': row.voucherNo || row.voucher_no, Date: row.date, Type: row.type,
    Party: row.party, Mode: row.mode, Amount: row.amount, Status: row.status, Narration: row.narration,
  }))

  const summary = types.map(t => ({ type: t, count: typeCounts[t] || 0 }))

  return (
    <div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete voucher?"
        message={`Delete voucher ${deleteTarget ? (deleteTarget.voucherNo || deleteTarget.voucher_no) : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void deleteVoucher(deleteTarget) }}
      />
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="vouchers" />
        <div style={{ display: 'flex', gap: 8 }}><ExportMenu title="Vouchers" rows={exportRows} />{canWrite && (
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openForm}>
            <Plus size={14} /> Create Voucher
          </button>
        )}</div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>{editingId ? 'Edit Voucher' : 'Create Voucher'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label className="form-label required">Voucher No.</label><input className="input" value={form.voucher_no} onChange={e => setForm(f => ({ ...f, voucher_no: e.target.value }))} /></div>
            <div><label className="form-label required">Date</label><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label className="form-label required">Type</label><select className="select" style={{ width: '100%' }} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as VoucherType }))}>{types.map(type => <option key={type}>{type}</option>)}</select></div>
            <div><label className="form-label required">Party / Account</label><input className="input" value={form.party} onChange={e => setForm(f => ({ ...f, party: e.target.value }))} /></div>
            <div><label className="form-label required">Amount</label><input className="input mono" type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 14 }}>
            <div><label className="form-label required">Mode</label><input className="input" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))} /></div>
            <div>
              <label className="form-label required">Narration</label>
              <input className="input" placeholder="Example: Being payment made by cash" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} />
              <NarrationSuggest
                value={form.narration}
                context={{
                  voucherType: form.type,
                  paymentMode: form.mode ? `by ${form.mode}` : undefined,
                  party: form.party,
                  supplier: form.party,
                  customer: form.party,
                  expenseName: form.party,
                  incomeName: form.party,
                }}
                onPick={narration => setForm(f => ({ ...f, narration }))}
              />
            </div>
          </div>
          {error && <div style={{ marginTop: 12, color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" disabled={saving} onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveVoucher}>{saving && <Spinner />} {saving ? 'Saving...' : editingId ? 'Update Voucher' : 'Save Voucher'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {summary.map(s => (
          <div key={s.type} className="card" style={{ padding: '10px 18px', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }} onClick={() => { setTypeFilter(s.type); setPage(1) }}>
            <span className={`badge ${typeColors[s.type] || 'badge-slate'}`}>{s.type}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700 }}>{s.count}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input className="input" style={{ paddingLeft: 30, height: 34, fontSize: 13 }} placeholder="Search vouchers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="select" style={{ fontSize: 13 }} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option>All</option>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select" style={{ fontSize: 13 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date-desc">Newest date</option><option value="date-asc">Oldest date</option><option value="amount-desc">Highest amount</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Voucher ID</th><th>Date</th><th>Type</th><th>Party / Account</th><th>Mode</th><th className="num">Amount ({currencySymbol})</th><th>Status</th><th>Narration</th><th style={{ textAlign: 'center' }}>Action</th></tr></thead>
            <tbody>
              {loadingRows && <TableSkeletonRows rows={pageSize} columns={9} />}
              {!loadingRows && paged.map(v => (
                <tr key={v.id}>
                  <td><span className="mono" style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 500 }}>{v.id}</span></td>
                  <td className="date-cell"><span className="mono" style={{ fontSize: 12.5 }}>{formatDate(v.date)}</span></td>
                  <td><span className={`badge ${typeColors[v.type] || 'badge-slate'}`}>{v.type}</span></td>
                  <td style={{ fontWeight: 500 }}>{v.party}</td>
                  <td style={{ fontSize: 12.5, color: '#64748B' }}>{v.mode}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{v.amount.toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${v.status === 'Approved' ? 'badge-green' : 'badge-amber'}`}>{v.status === 'Approved' ? <CheckCircle size={10} /> : <Clock size={10} />} {v.status}</span></td>
                  <td style={{ maxWidth: 200 }}><span className="truncate narration-text" style={{ display: 'block' }}>{v.narration}</span></td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div className="table-action-icons">
                    <button className="btn btn-ghost btn-icon" title="View voucher" aria-label="View voucher" onClick={() => setSelected(v)}><Eye size={14} /></button>
                    {canWrite && <>
                      <button className="btn btn-ghost btn-icon btn-icon-primary" title="Edit voucher" aria-label="Edit voucher" onClick={() => openEditForm(v)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-delete-icon" title="Delete voucher" aria-label="Delete voucher" onClick={() => setDeleteTarget(v)}><Trash2 size={14} /></button>
                    </>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state" style={{ padding: '36px 20px' }}>No vouchers found.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination total={totalVouchers} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
        <div className="total-amount" style={{ padding: '0 20px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>Filtered total: {formatMoney(filtered.reduce((s, v) => s + v.amount, 0))}</div>
      </div>

      {selected && <VoucherModal voucher={selected} canWrite={canWrite} formatMoney={formatMoney} onClose={() => setSelected(null)} onApprove={async () => {
        try {
          await approveVoucher(selected.backendId || selected.id)
          setSelected(null)
          showToast('success', 'Voucher approved successfully.')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to approve voucher.'
          setError(message)
          showToast('error', message)
        }
      }} />}
    </div>
  )
}
