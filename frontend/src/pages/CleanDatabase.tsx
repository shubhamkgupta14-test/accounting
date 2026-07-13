import { useEffect, useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { api, type AdminCollection } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'

export default function CleanDatabase() {
  const { showToast } = useToast()
  const [collections, setCollections] = useState<AdminCollection[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    api.adminCollections().then(rows => {
      setCollections(rows)
      setSelected(rows.filter(row => row.default_selected).map(row => row.name))
    })
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

  return (
    <div>
      <div className="page-header">
        <PageIntro id="clean-db" />
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <button className="btn btn-secondary" onClick={() => setSelected(collections.filter(row => row.default_selected).map(row => row.name))}>
            <Database size={14} /> Select Normal Models
          </button>
          <button className="btn btn-secondary" onClick={() => setSelected(collections.map(row => row.name))}>
            Select All
          </button>
          <button className="btn btn-danger" disabled={selected.length === 0 || cleaning} onClick={clean}>
            <Trash2 size={14} /> {cleaning ? 'Cleaning…' : 'Run Clean Action'}
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
              {row.protected_default && <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>normal skip</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
