import { useEffect, useState } from 'react'
import { Database, PlusCircle, Trash2 } from 'lucide-react'
import { api, type AdminCollection } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'
import { CleanDatabaseSkeleton, Spinner } from '../components/Loading'
import ConfirmModal from '../components/ConfirmModal'
import PasswordInput from '../components/PasswordInput'

export default function CleanDatabase() {
  const { showToast } = useToast()
  const [collections, setCollections] = useState<AdminCollection[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [password, setPassword] = useState('')
  const [addingDefaults, setAddingDefaults] = useState(false)

  useEffect(() => {
    api.adminCollections().then(rows => {
      setCollections(rows)
      setSelected(rows.filter(row => row.default_selected).map(row => row.name))
    }).catch(() => showToast('error', 'Unable to load database collections.')).finally(() => setLoading(false))
  }, [])

  const clean = async () => {
    setCleaning(true)
    try {
      const result = await api.cleanCollections(selected, password)
      setShowConfirmation(false)
      setPassword('')
      showToast('success', `Cleaned ${Object.keys(result.deleted).length} collections.`)
      setSelected([])
      window.setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to clean database.')
      setCleaning(false)
    }
  }

  const addDefaultAccounts = async () => {
    setAddingDefaults(true)
    try {
      const result = await api.createDefaultAccounts()
      showToast(
        'success',
        result.created > 0
          ? `Created ${result.created} default ledger ${result.created === 1 ? 'account' : 'accounts'}.`
          : 'Default ledger accounts already exist.',
      )
      const rows = await api.adminCollections()
      setCollections(rows)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to add default accounts.')
    } finally {
      setAddingDefaults(false)
    }
  }

  if (loading) return <CleanDatabaseSkeleton />
  const allSelected = collections.length > 0 && selected.length === collections.length
  const selectedCollections = collections.filter(row => selected.includes(row.name))
  const selectedDocumentCount = selectedCollections.reduce((total, row) => total + row.document_count, 0)

  return (
    <div>
      <ConfirmModal
        open={showConfirmation}
        title="Clean selected database data?"
        message={`${selected.length} database ${selected.length === 1 ? 'collection is' : 'collections are'} selected, containing ${selectedDocumentCount.toLocaleString('en-IN')} ${selectedDocumentCount === 1 ? 'record' : 'records'}. This data will be permanently deleted.`}
        confirmLabel={`Delete ${selectedDocumentCount.toLocaleString('en-IN')} records`}
        danger
        confirmDisabled={!password || cleaning}
        onCancel={() => { setShowConfirmation(false); setPassword('') }}
        onConfirm={() => void clean()}
      >
        <div style={{ padding: '0 20px 16px' }}>
          <label className="form-label required" htmlFor="clean-database-password">Confirm your password</label>
          <PasswordInput
            id="clean-database-password"
            className="input"
            value={password}
            autoComplete="current-password"
            onChange={event => setPassword(event.target.value)}
          />
        </div>
      </ConfirmModal>
      <div className="page-header">
        <PageIntro id="clean-db" />
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Add Default Accounts</h2>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
            Create the essential ledger set for a clean database using the standard seed mapping.
          </p>
        </div>
        <button className="btn btn-primary" disabled={addingDefaults} onClick={() => void addDefaultAccounts()}>
          {addingDefaults ? <Spinner /> : <PlusCircle size={14} />} {addingDefaults ? 'Adding…' : 'Add Default Accounts'}
        </button>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button className="btn btn-secondary" onClick={() => setSelected(collections.filter(row => row.default_selected).map(row => row.name))}>
            <Database size={14} /> Select Default
          </button>
          <button className="btn btn-secondary" onClick={() => setSelected(allSelected ? [] : collections.map(row => row.name))}>
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button className="btn btn-danger" disabled={selected.length === 0 || cleaning} onClick={() => { setPassword(''); setShowConfirmation(true) }}>
            {cleaning ? <Spinner /> : <Trash2 size={14} />} {cleaning ? 'Cleaning…' : 'Run Clean Action'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {collections.map(row => (
            <label key={row.name} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selected.includes(row.name)}
                onChange={e => setSelected(current => e.target.checked ? [...current, row.name] : current.filter(name => name !== row.name))}
              />
              <span>{row.name}</span>
              <span className="badge badge-slate">{row.document_count.toLocaleString('en-IN')}</span>
              {row.default_selected && <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>default</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
