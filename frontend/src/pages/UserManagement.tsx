import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCheck, UserX } from 'lucide-react'
import { api, type AuthUser, type UserRole } from '../lib/api'
import { useToast } from '../context/ToastContext'
import PageIntro from '../components/PageIntro'
import PasswordInput from '../components/PasswordInput'

export default function UserManagement() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', role: 'user' as UserRole })

  const load = async () => setUsers(await api.users())
  useEffect(() => { void load() }, [])

  const create = async () => {
    try {
      await api.createUser(form)
      setForm({ first_name: '', last_name: '', email: '', password: '', role: 'user' })
      await load()
      showToast('success', 'User created.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to create user.')
    }
  }

  const setStatus = async (user: AuthUser, is_active: boolean) => {
    await api.setUserStatus(user.id, is_active)
    await load()
  }

  const remove = async (user: AuthUser) => {
    await api.deleteUser(user.id)
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <PageIntro id="user-management" />
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Create User</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 1fr 140px', gap: 10 }}>
          <input className="input" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          <input className="input" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          <input className="input" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <PasswordInput className="input" placeholder="Password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <select className="select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
            <option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={create}><Plus size={14} /> Create User</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.first_name} {user.last_name}</td>
                <td>{user.email}</td>
                <td><span className="badge badge-blue">{user.role}</span></td>
                <td><span className={`badge ${user.is_active === false ? 'badge-red' : 'badge-green'}`}>{user.is_active === false ? 'Inactive' : 'Active'}</span></td>
                <td className="mono">{user.created_at || '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                    {user.is_active === false
                      ? <button className="btn btn-ghost" title="Activate" onClick={() => setStatus(user, true)}><UserCheck size={14} /></button>
                      : <button className="btn btn-ghost" title="Deactivate" onClick={() => setStatus(user, false)}><UserX size={14} /></button>}
                    <button className="btn btn-ghost" style={{ color: '#EF4444' }} title="Delete" onClick={() => remove(user)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
