import { useEffect, useState } from 'react'
import { Bell, Send } from 'lucide-react'
import { api, type Notification } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'

export default function NotificationCenter() {
  const { canManageUsers } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<Notification[]>([])
  const [form, setForm] = useState({ title: '', message: '', audience: 'all' })

  const load = async () => setItems(await api.notifications())

  useEffect(() => { void load() }, [])

  const send = async () => {
    try {
      await api.createNotification(form)
      setForm({ title: '', message: '', audience: 'all' })
      await load()
      showToast('success', 'Notification sent.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to send notification.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <PageIntro id="notifications" />
      </div>

      {canManageUsers && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Send Manual Notification</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 12 }}>
            <input className="input" placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className="input" placeholder="Message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
            <select className="select" value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}>
              <option value="all">All</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
              <option value="superadmin">Superadmins</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" disabled={!form.title || !form.message} onClick={send}><Send size={14} /> Send</button>
          </div>
        </div>
      )}

      <div className="card">
        {items.map(item => (
          <div key={item.id} style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 12 }}>
            <Bell size={16} color="#2563EB" />
            <div>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div className="narration-text">{item.message}</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4 }}>{item.audience}</div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="empty-state">No notifications yet.</div>}
      </div>
    </div>
  )
}
