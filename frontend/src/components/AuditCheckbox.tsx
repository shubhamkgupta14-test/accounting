import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

interface AuditCheckboxProps {
  item: string
}

export default function AuditCheckbox({ item }: AuditCheckboxProps) {
  const { user } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const reset = () => setChecked(false)
    window.addEventListener('audit-uncheck-all', reset)
    return () => window.removeEventListener('audit-uncheck-all', reset)
  }, [])

  if (!user?.audit_mode) return null

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={event => setChecked(event.target.checked)}
      aria-label={`Mark ${item} as matched`}
      title="Mark value as matched"
      style={{ width: 15, height: 15, margin: 0, cursor: 'pointer', accentColor: '#10B981', flex: '0 0 auto' }}
    />
  )
}

export function AuditUncheckAllButton() {
  const { user } = useAuth()
  if (!user?.audit_mode) return null

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => window.dispatchEvent(new Event('audit-uncheck-all'))}
      title="Clear all audit matches"
    >
      Uncheck All
    </button>
  )
}
