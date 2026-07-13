import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NarrationSuggest from './NarrationSuggest'

describe('NarrationSuggest', () => {
  it('shows and applies suggestions from the narration being typed', () => {
    const onPick = vi.fn()
    render(<NarrationSuggest value="cash sale" onPick={onPick} />)
    expect(screen.getByLabelText('Narration suggestions')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Being goods sold for cash.'))
    expect(onPick).toHaveBeenCalledWith('Being goods sold for cash.')
  })
})
