import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = React.InputHTMLAttributes<HTMLInputElement>

export default function PasswordInput({ style, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input {...props} className={props.className || 'input'} type={visible ? 'text' : 'password'} style={{ ...style, paddingRight: 38 }} />
      <button type="button" className="btn-icon" aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(value => !value)}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: '#64748B', cursor: 'pointer', padding: 3, display: 'flex' }}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
