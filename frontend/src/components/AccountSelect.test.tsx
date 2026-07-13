import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccountSelect from './AccountSelect'
import type { Account } from '../lib/api'

const accounts: Account[] = [
  { id: '1', code: 'A-CH-001', name: 'Cash', type: 'Asset', group: 'Cash', opening_balance: 0, is_active: true },
  { id: '2', code: 'A-BK-001', name: 'Bank Account', type: 'Asset', group: 'Bank', opening_balance: 0, is_active: true },
  { id: '3', code: 'X-IE-001', name: 'Salary Expense', type: 'Expense', group: 'Indirect Expenses', opening_balance: 0, is_active: true },
]

describe('AccountSelect', () => {
  it('searches and selects an account by typed text', () => {
    const onChange = vi.fn()
    render(<AccountSelect accounts={accounts} value="" onChange={onChange} />)
    fireEvent.focus(screen.getByLabelText('Search and select account'))
    fireEvent.change(screen.getByLabelText('Search and select account'), { target: { value: 'bank' } })
    fireEvent.click(screen.getByText('Bank Account'))
    expect(onChange).toHaveBeenLastCalledWith('Bank Account')
  })
})
