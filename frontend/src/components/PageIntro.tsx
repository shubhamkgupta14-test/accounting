import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePageContent } from '../context/ContentContext'
import { Spinner } from './Loading'

export default function PageIntro({ id, onReload, beforeReload }: { id: string; onReload?: () => void | Promise<void>; beforeReload?: React.ReactNode }) {
  const content = usePageContent(id)
  const [reloading, setReloading] = useState(false)
  const reload = async () => {
    if (!onReload || reloading) return
    setReloading(true)
    try { await onReload() } finally { setReloading(false) }
  }
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
    <div><h1>{content.title}</h1><p>{content.description}</p></div>
    {(beforeReload || onReload) && <div style={{ marginLeft: 'auto', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
      {beforeReload}
      {onReload && <button className="btn btn-secondary" disabled={reloading} onClick={() => void reload()}>{reloading ? <Spinner size={13} /> : <RefreshCw size={13} />} {reloading ? 'Reloading' : 'Reload'}</button>}
    </div>}
  </div>
}
