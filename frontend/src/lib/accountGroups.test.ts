import { describe, expect, it } from 'vitest'
import { balanceSheetAssetGroup, balanceSheetLiabilityGroup } from './accountGroups'

describe('balance sheet tax groups', () => {
  it('keeps input GST in a separate deferred tax asset group', () => {
    expect(balanceSheetAssetGroup({ name: 'Input IGST', type: 'Asset', group: 'Deffered Tax Assets' }))
      .toBe('Deffered Tax Assets')
  })

  it('keeps output GST in a separate deferred tax liability group', () => {
    expect(balanceSheetLiabilityGroup({ name: 'Output SGST', type: 'Liability', group: 'Deffered Tax Liabilities' }))
      .toBe('Deffered Tax Liabilities')
  })
})
