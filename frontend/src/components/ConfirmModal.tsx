import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="card confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div className="confirm-modal-heading">
          <span className={`confirm-modal-icon ${danger ? 'danger' : ''}`}><AlertTriangle size={20} /></span>
          <div>
            <h3 id="confirm-modal-title">{title}</h3>
            <p>{message}</p>
          </div>
          <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="confirm-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
