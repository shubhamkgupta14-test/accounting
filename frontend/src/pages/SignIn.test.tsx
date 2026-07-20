import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignIn from './SignIn'

const { forgotPassword, login, showToast } = vi.hoisted(() => ({ forgotPassword: vi.fn(), login: vi.fn(), showToast: vi.fn() }))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast }) }))
vi.mock('../lib/api', () => ({
  api: {
    forgotPassword,
    resetPassword: vi.fn(),
  },
}))

describe('SignIn OTP flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    login.mockReset()
    showToast.mockReset()
    forgotPassword.mockResolvedValue({ message: 'sent', otp: '123456', cooldown_seconds: 10 })
  })
  afterEach(() => vi.useRealTimers())

  it('shows local OTP, copy action, and configured resend countdown', async () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
      await Promise.resolve()
    })
    expect(screen.getByText(/Dev\/test OTP:/)).toHaveTextContent('123456')
    expect(screen.getByRole('button', { name: 'Copy OTP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend OTP in 10s' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('button', { name: 'Resend OTP in 9s' })).toBeDisabled()
  })

  it('shows login failures inline without a duplicate toast', async () => {
    login.mockRejectedValue(new Error('Invalid email or password'))
    render(<SignIn />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      await Promise.resolve()
    })
    expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    expect(showToast).not.toHaveBeenCalled()
  })
})
