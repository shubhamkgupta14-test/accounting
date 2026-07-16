import { useEffect, useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { api, type AdminCollection } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'
import { CleanDatabaseSkeleton, Spinner } from '../components/Loading'

export default function CleanDatabase() {
  const { showToast } = useToast()
  const [collections, setCollections] = useState<AdminCollection[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.adminCollections().then(rows => {
      setCollections(rows)
      setSelected(rows.filter(row => row.default_selected).map(row => row.name))
    }).catch(() => showToast('error', 'Unable to load database collections.')).finally(() => setLoading(false))
  }, [])

  const clean = async () => {
    setCleaning(true)
    try {
      const result = await api.cleanCollections(selected)
      showToast('success', `Cleaned ${Object.keys(result.deleted).length} collections.`)
      setSelected([])
      window.setTimeout(() => window.location.reload(), 500)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to clean database.')
      setCleaning(false)
    }
  }

  if (loading) return <CleanDatabaseSkeleton />
  const allSelected = collections.length > 0 && selected.length === collections.length

  return (
    <div>
      <div className="page-header">
        <PageIntro id="clean-db" />
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <button className="btn btn-secondary" onClick={() => setSelected(collections.filter(row => row.default_selected).map(row => row.name))}>
            <Database size={14} /> Select Default
          </button>
          <button className="btn btn-secondary" onClick={() => setSelected(allSelected ? [] : collections.map(row => row.name))}>
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button className="btn btn-danger" disabled={selected.length === 0 || cleaning} onClick={clean}>
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
              {row.default_selected && <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>default</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
