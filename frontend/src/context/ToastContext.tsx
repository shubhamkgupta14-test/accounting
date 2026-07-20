import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Undo2 } from 'lucide-react'

type ToastType = 'success' | 'error'

interface Toast {
  id: number
  type: ToastType
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, options?: { duration?: number; action?: Toast['action'] }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: ToastType, message: string, options?: { duration?: number; action?: Toast['action'] }) => {
    const id = Date.now() + Math.random()
    setToasts(current => [...current, { id, type, message, action: options?.action }])
    window.setTimeout(() => {
      setToasts(current => current.filter(toast => toast.id !== id))
    }, options?.duration ?? 3200)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
            {toast.action && <button className="toast-action" onClick={() => {
              toast.action?.onClick()
              setToasts(current => current.filter(item => item.id !== toast.id))
            }}><Undo2 size={15} /> {toast.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used within ToastProvider')
  return value
}
