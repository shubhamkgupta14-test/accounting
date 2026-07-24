import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import EmptyTableRow from './EmptyTableRow'

describe('EmptyTableRow', () => {
  it('shows the default empty message across the requested columns', () => {
    render(
      <table>
        <tbody>
          <EmptyTableRow colSpan={4} />
        </tbody>
      </table>,
    )

    expect(screen.getByText('No records found').closest('td')).toHaveAttribute('colspan', '4')
  })
})
