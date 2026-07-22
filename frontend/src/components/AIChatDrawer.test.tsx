import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AIResponseMarkdown } from './AIChatDrawer'

describe('AIResponseMarkdown', () => {
  it('renders formatted Markdown and keeps raw HTML inert', () => {
    render(
      <AIResponseMarkdown
        content={'## Journal entry\n\n- **Debit:** Rent\n- `Credit:` Bank\n\n| Account | Amount |\n| --- | ---: |\n| Rent | 500 |\n\n<a href="javascript:alert(1)">unsafe</a>'}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Journal entry' })).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('<a href="javascript:alert(1)">unsafe</a>')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument()
  })
})
