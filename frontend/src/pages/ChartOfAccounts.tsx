import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react'
import { useLedgerData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import ExportMenu from '../components/ExportMenu'
import TablePagination from '../components/TablePagination'
import PageIntro from '../components/PageIntro'
import { useAppSettings } from '../context/SettingsContext'
import { api, type Account } from '../lib/api'
import { Spinner, TableSkeletonRows } from '../components/Loading'
import AuditCheckbox, { AuditUncheckAllButton } from '../components/AuditCheckbox'
import AccountDrilldown from '../components/AccountDrilldown'
import ConfirmModal from '../components/ConfirmModal'
import { accountGroups, defaultAccountGroup } from '../lib/accountGroups'
import { formatReportNumber } from '../lib/export'
import { paginationConfig } from '../config/app'
import EmptyTableRow from '../components/EmptyTableRow'

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'

interface AccountForm {
  code: string
  name: string
  type: AccountType
  group: string
  opening_balance: number
}

const typeColors: Record<string, string> = {
  Asset: 'badge-blue', Liability: 'badge-red', Equity: 'badge-amber',
  Income: 'badge-green', Expense: 'badge-slate',
}

const nextAccountCode = (count: number) => `AC${String(count + 1).padStart(3, '0')}`

export default function ChartOfAccounts() {
  const { accounts, createAccount, updateAccount, deleteAccount } = useLedgerData()
  const { currencySymbol } = useAppSettings()
  const { canWrite, canManageRecord } = useAuth()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [groupFilter, setGroupFilter] = useState('All')
  const [sortBy, setSortBy] = useState('code')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(paginationConfig.defaultPageSize)
  const [rows, setRows] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ total: number; by_type: Record<string, number>; groups: string[] }>({ total: 0, by_type: {}, groups: [] })
  const [reloadKey, setReloadKey] = useState(0)
  const [loadingRows, setLoadingRows] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<AccountForm>({
    code: nextAccountCode(accounts.length),
    name: '',
    type: 'Asset',
    group: defaultAccountGroup('Asset'),
    opening_balance: 0,
  })

  const openForm = () => {
    setEditingId(null)
    setForm({
      code: nextAccountCode(accounts.length),
      name: '',
      type: 'Asset',
      group: defaultAccountGroup('Asset'),
      opening_balance: 0,
    })
    setError('')
    setShowForm(true)
  }

  const openEditForm = (account: Account) => {
    if (!account.backendId) return
    setEditingId(account.backendId)
    setForm({
      code: account.code,
      name: account.name,
      type: account.type,
      group: account.group,
      opening_balance: account.opening_balance,
    })
    setError('')
    setShowForm(true)
  }

  useEffect(() => {
    if (!showForm) return
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editingId, showForm])

  const updateType = (type: AccountType) => {
    setForm(current => ({ ...current, type, group: defaultAccountGroup(type) }))
  }

  const saveAccount = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.group.trim()) {
      const message = 'Account code, name, and group are required.'
      setError(message)
      showToast('error', message)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        group: form.group.trim(),
        opening_balance: Number(form.opening_balance) || 0,
        is_active: true,
      }
      if (editingId) await updateAccount(editingId, payload)
      else await createAccount(payload)
      setReloadKey(value => value + 1)
      setShowForm(false)
      showToast('success', editingId ? 'Account updated successfully.' : 'Account created successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : editingId ? 'Unable to update account.' : 'Unable to create account.'
      setError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  const removeAccount = async (account: Account) => {
    if (!account.backendId) return
    setDeleteTarget(null)
    try {
      await deleteAccount(account.backendId)
      if (rows.length === 1 && page > 1) setPage(current => current - 1)
      else setReloadKey(value => value + 1)
      showToast('success', `Ledger account "${account.name}" deleted.`, {
        duration: 10000,
        action: { label: 'Undo', onClick: () => {
          void createAccount({
            code: account.code,
            name: account.name,
            type: account.type,
            group: account.group,
            opening_balance: account.opening_balance,
            is_active: account.is_active,
          }).then(() => {
            setReloadKey(value => value + 1)
            showToast('success', `Ledger account "${account.name}" restored.`)
          }).catch(err => showToast('error', err instanceof Error ? err.message : 'Unable to restore account.'))
        } },
      })
    } catch (err) {
        setReloadKey(value => value + 1)
        showToast('error', err instanceof Error ? err.message : 'Unable to delete account.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingRows(true)
      void Promise.all([
        api.accountsPage({
          page,
          page_size: pageSize,
          search,
          account_type: typeFilter === 'All' ? undefined : typeFilter,
          group: groupFilter === 'All' ? undefined : groupFilter,
          sort_by: sortBy,
          sort_order: 'asc',
        }),
        api.accountStats(),
      ]).then(([result, accountStats]) => {
        setRows(result.items.map(row => ({ ...row, backendId: row.id, id: row.code })))
        setTotal(result.total)
        setStats(accountStats)
      }).catch(error => showToast('error', error instanceof Error ? error.message : 'Unable to load accounts.')).finally(() => setLoadingRows(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [groupFilter, page, pageSize, reloadKey, search, showToast, sortBy, typeFilter])

  const summary = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(type => ({
    type, count: stats.by_type[type] || 0
  }))

  return (
    <div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete ledger account?"
        message={`Delete "${deleteTarget?.name || ''}"? You will have 10 seconds to undo this action.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void removeAccount(deleteTarget) }}
      />
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageIntro id="chart-of-accounts" />
        <div style={{ display: 'flex', gap: 8 }}>
          <AuditUncheckAllButton />
          <ExportMenu fullReport rowsOnly title="Ledger Accounts" rows={rows.map(row => ({
            'A/c Code': row.id,
            'Ledger Account Name': row.name,
            Type: row.type,
            Group: row.group,
            [`Balance (${currencySymbol})`]: row.balance || 0,
          }))} />
          {canWrite && (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openForm}>
              <Plus size={14} /> Add Ledger Account
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div ref={formRef} className="card" style={{ marginBottom: 20, padding: '20px 24px', scrollMarginTop: 76 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{editingId ? 'Edit Ledger Account' : 'Add Ledger Account'}</h3>
            <button className="btn btn-ghost btn-icon" style={{ padding: '4px 8px' }} onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1.5fr 1fr', gap: 14 }}>
            <div>
              <label className="form-label required">A/c Code</label>
              <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="form-label required">Ledger Account Name</label>
              <input className="input" placeholder="Cash, Bank, Sales, Rent..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label required">Type</label>
              <select className="select" style={{ width: '100%' }} value={form.type} onChange={e => updateType(e.target.value as AccountType)}>
                <option>Asset</option>
                <option>Liability</option>
                <option>Equity</option>
                <option>Income</option>
                <option>Expense</option>
              </select>
            </div>
            <div>
              <label className="form-label required">Group</label>
              <select className="select" style={{ width: '100%' }} value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))}>
                {!accountGroups[form.type].includes(form.group) && <option value={form.group}>{form.group} (Legacy)</option>}
                {accountGroups[form.type].map(group => <option key={group} value={group}>{group}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Opening Balance</label>
              <input className="input mono" type="number" value={form.opening_balance || ''} onChange={e => setForm(f => ({ ...f, opening_balance: Number(e.target.value) }))} />
            </div>
          </div>
          {error && <div style={{ marginTop: 12, color: '#B91C1C', fontSize: 12.5 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveAccount}>{saving && <Spinner />} {saving ? 'Saving...' : editingId ? 'Update Ledger Account' : 'Save Ledger Account'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ type: 'All', count: stats.total }, ...summary].map(s => (
          <button key={s.type} className="btn"
            style={{
              background: typeFilter === s.type ? '#2563EB' : 'white',
              color: typeFilter === s.type ? 'white' : '#475569',
              border: `1px solid ${typeFilter === s.type ? '#2563EB' : '#E2E8F0'}`,
              fontSize: 13, fontWeight: typeFilter === s.type ? 600 : 400,
              padding: '6px 14px', gap: 8
            }}
            onClick={() => { setTypeFilter(s.type); setPage(1) }}
          >
            {s.type}
            <span style={{
              background: typeFilter === s.type ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
              color: typeFilter === s.type ? 'white' : '#64748B',
              padding: '1px 7px', borderRadius: 20, fontSize: 11.5, fontWeight: 700
            }}>{s.count}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input className="input" style={{ paddingLeft: 30, height: 34, fontSize: 13 }}
              placeholder="Search by name, code, group..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="select" style={{ fontSize: 13 }} value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1) }}>
            <option value="All">All Groups</option>
            {stats.groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="select" style={{ fontSize: 13 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="code">Sort: Code</option><option value="name">Sort: Name</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748B', display: 'flex', alignItems: 'center' }}>
            {total} ledger accounts
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36, minWidth: 36, padding: 0 }} />
                <th>A/c Code</th>
                <th>Ledger Account Name</th>
                <th>Type</th>
                <th>Group</th>
                <th className="num">Balance ({currencySymbol})</th>
                {canWrite && <th style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loadingRows && <TableSkeletonRows rows={pageSize} columns={canWrite ? 7 : 6} />}
              {!loadingRows && rows.map(a => (
                <tr key={a.id}>
                  <td style={{ width: 36, minWidth: 36, padding: '8px 4px', textAlign: 'center' }}>
                    <AuditCheckbox item={`ledger account ${a.name}`} />
                  </td>
                  <td><span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{a.id}</span></td>
                  <td style={{ fontWeight: 500 }}><AccountDrilldown account={a.name} /></td>
                  <td><span className={`badge ${typeColors[a.type] || 'badge-slate'}`}>{a.type}</span></td>
                  <td><span className="group-text">{a.group}</span></td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatReportNumber(a.balance || 0)}</td>
                  {canWrite && (
                    <td style={{ textAlign: 'center' }}>
                      <div className="table-action-icons">
                        <button
                          className="btn btn-ghost btn-icon btn-icon-primary"
                          title={canManageRecord(a.created_by) ? 'Edit ledger account' : 'Only the creator or a superadmin can edit this ledger account'}
                          aria-label="Edit ledger account"
                          disabled={!canManageRecord(a.created_by)}
                          onClick={() => openEditForm(a)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-delete-icon"
                          title={canManageRecord(a.created_by) ? 'Delete ledger account' : 'Only the creator or a superadmin can delete this ledger account'}
                          aria-label="Delete ledger account"
                          disabled={!canManageRecord(a.created_by)}
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!loadingRows && rows.length === 0 && <EmptyTableRow colSpan={canWrite ? 7 : 6} />}
            </tbody>
          </table>
        </div>
        <TablePagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
      </div>
    </div>
  )
}
