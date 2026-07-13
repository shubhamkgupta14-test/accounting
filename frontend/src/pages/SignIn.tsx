import { useEffect, useState } from 'react'
import { BookOpen, Check, Copy, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { appName } from '../config/app'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import PasswordInput from '../components/PasswordInput'
import { usePageContent } from '../context/ContentContext'

export default function SignIn() {
  const pageContent = usePageContent('login')
  const { login } = useAuth()
  const { showToast } = useToast()
  const [email, setEmail] = useState('admin@accountingapp.com')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [otp, setOtp] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [otpCopied, setOtpCopied] = useState(false)

  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = window.setInterval(() => setOtpCooldown(seconds => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [otpCooldown > 0])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      showToast('success', 'Signed in successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const requestOtp = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.forgotPassword(email)
      setDevOtp(result.otp || '')
      setOtpCooldown(result.cooldown_seconds ?? 10)
      showToast('success', result.otp ? 'OTP generated for local/dev.' : 'OTP sent to email.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to request OTP'
      const waitSeconds = message.match(/wait\s+(\d+)\s+seconds?/i)
      if (waitSeconds) setOtpCooldown(Number(waitSeconds[1]))
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async () => {
    setLoading(true)
    setError('')
    try {
      await api.resetPassword(email, otp, newPassword)
      showToast('success', 'Password reset successfully. Sign in with your new password.')
      setResetMode(false)
      setPassword('')
      setOtp('')
      setNewPassword('')
      setDevOtp('')
      setOtpCooldown(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reset password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const copyDevOtp = async () => {
    try {
      await navigator.clipboard.writeText(devOtp)
      setOtpCopied(true)
      showToast('success', 'OTP copied.')
      window.setTimeout(() => setOtpCopied(false), 1500)
    } catch {
      showToast('error', 'Unable to copy OTP.')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel card">
        <div className="auth-brand">
          <div className="brand-mark"><BookOpen size={20} /></div>
          <div>
            <h1>{pageContent.title}</h1>
            <p>{pageContent.description}</p>
          </div>
        </div>
        {!resetMode ? <form onSubmit={submit} className="auth-form">
          <label className="form-label required">Email</label>
          <div className="input-icon">
            <Mail size={15} />
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <label className="form-label required">Password</label>
          <div className="input-icon">
            <Lock size={15} />
            <PasswordInput className="input" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary auth-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <button type="button" className="btn btn-ghost" style={{ justifyContent: 'center', fontSize: 12.5 }} onClick={() => setResetMode(true)}>
            Forgot password?
          </button>
        </form> : (
          <div className="auth-form">
            <label className="form-label required">Email</label>
            <div className="input-icon">
              <Mail size={15} />
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <button type="button" className="btn btn-secondary auth-submit" disabled={loading || otpCooldown > 0 || !email} onClick={requestOtp}>
              {loading ? 'Sending OTP...' : otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : devOtp ? 'Resend OTP' : 'Send OTP'}
            </button>
            {devOtp && (
              <div className="auth-error" style={{ background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>Local/dev OTP: <strong>{devOtp}</strong></span>
                <button type="button" onClick={() => void copyDevOtp()} aria-label="Copy OTP" title="Copy OTP"
                  style={{ border: 0, background: 'transparent', color: '#1D4ED8', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center' }}>
                  {otpCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            )}
            <label className="form-label required">OTP</label>
            <input className="input" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter 6 digit OTP" />
            <label className="form-label required">New Password</label>
            <PasswordInput className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            {error && <div className="auth-error">{error}</div>}
            <button type="button" className="btn btn-primary auth-submit" disabled={loading || !otp || !newPassword} onClick={resetPassword}>
              Reset Password
            </button>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'center', fontSize: 12.5 }} onClick={() => { setResetMode(false); setOtpCooldown(0) }}>
              Back to sign in
            </button>
          </div>
        )}
        <div className="demo-logins">
          <span>Demo roles</span>
          <button onClick={() => setEmail('superadmin@accountingapp.com')}>Superadmin</button>
          <button onClick={() => setEmail('admin@accountingapp.com')}>Admin</button>
          <button onClick={() => setEmail('user@accountingapp.com')}>User view</button>
        </div>
      </section>
    </main>
  )
}
