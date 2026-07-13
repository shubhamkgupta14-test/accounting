import { describe, expect, it } from 'vitest'
import { fillNarrationTemplate, getNarrationSuggestions, narrationTemplates } from './narrationTemplates'

describe('narration templates', () => {
  it('contains the full categorized catalog', () => {
    expect(narrationTemplates.length).toBeGreaterThanOrEqual(50)
    expect(narrationTemplates.some(item => item.category === 'Cheque Bounce')).toBe(true)
    expect(narrationTemplates.some(item => item.category === 'General Payment')).toBe(true)
  })

  it('fills known party placeholders from context', () => {
    expect(fillNarrationTemplate('Being goods purchased from {Supplier} on credit.', { supplier: 'Acme Traders' }))
      .toBe('Being goods purchased from Acme Traders on credit.')
  })

  it('keeps missing placeholders editable after selection', () => {
    expect(fillNarrationTemplate('Being {AssetName} purchased.')).toBe('Being {AssetName} purchased.')
  })

  it('prioritizes templates matching the selected voucher type', () => {
    const suggestions = getNarrationSuggestions('', { voucherType: 'Contra' })
    expect(suggestions[0].category).toBe('Contra (Cash ↔ Bank)')
  })

  it('matches multiple words typed in any useful phrase order', () => {
    const suggestions = getNarrationSuggestions('sale cash')
    expect(suggestions.some(item => item.value === 'Being goods sold for cash.')).toBe(true)
  })
})
