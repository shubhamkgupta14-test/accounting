import { RefreshCw } from 'lucide-react'
import { usePageContent } from '../context/ContentContext'

export default function PageIntro({ id, onReload }: { id: string; onReload?: () => void | Promise<void> }) {
  const content = usePageContent(id)
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
    <div><h1>{content.title}</h1><p>{content.description}</p></div>
    {onReload && <button className="btn btn-secondary" onClick={() => void onReload()} style={{ marginLeft: 'auto', marginTop: 2 }}><RefreshCw size={13} /> Reload</button>}
  </div>
}
