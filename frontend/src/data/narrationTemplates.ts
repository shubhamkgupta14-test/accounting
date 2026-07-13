export interface NarrationContext {
  voucherType?: string
  party?: string
  paymentMode?: string
  supplier?: string
  customer?: string
  assetName?: string
  expenseName?: string
  incomeName?: string
}

export interface NarrationTemplate {
  category: string
  template: string
  aliases: string[]
}

const definitions: Array<[string, string[]]> = [
  ['Capital', ['Being capital introduced in cash.', 'Being capital introduced through bank.']],
  ['Cash Purchase', ['Being goods purchased for cash.']],
  ['Credit Purchase', ['Being goods purchased from {Supplier} on credit.']],
  ['Cash Sale', ['Being goods sold for cash.']],
  ['Credit Sale', ['Being goods sold to {Customer} on credit.']],
  ['Purchase Return', ['Being goods returned to {Supplier}.']],
  ['Sales Return', ['Being goods returned by {Customer}.']],
  ['Cash Receipt', ['Being cash received from {Customer}.', 'Being amount received in cash.']],
  ['Bank Receipt', ['Being cheque received from {Customer}.', 'Being amount received through bank.']],
  ['Cash Payment', ['Being cash paid to {Supplier}.', 'Being payment made in cash.']],
  ['Bank Payment', ['Being cheque issued to {Supplier}.', 'Being payment made through bank.']],
  ['Contra (Cash ↔ Bank)', ['Being cash deposited into bank.', 'Being cash withdrawn from bank.']],
  ['Wages', ['Being wages paid.', 'Being labour charges paid.']],
  ['Salary', ['Being salary paid.', 'Being staff salary paid.']],
  ['Rent', ['Being office rent paid.', 'Being shop rent paid.']],
  ['Electricity', ['Being electricity charges paid.']],
  ['Insurance', ['Being insurance premium paid.']],
  ['Advertisement', ['Being advertisement expense paid.']],
  ['Stationery', ['Being office stationery purchased.']],
  ['Carriage', ['Being carriage inward paid.', 'Being freight charges paid.']],
  ['Commission Income', ['Being commission received.']],
  ['Interest Income', ['Being interest received.']],
  ['Discount Allowed', ['Being discount allowed to {Customer}.']],
  ['Discount Received', ['Being discount received from {Supplier}.']],
  ['Drawings (Cash)', ['Being cash withdrawn by proprietor for personal use.']],
  ['Drawings (Goods)', ['Being goods withdrawn by proprietor for personal use.']],
  ['Cheque Received', ['Being cheque received from {Customer}.', 'Being cheque received and deposited into bank.']],
  ['Cheque Issued', ['Being cheque issued to {Supplier}.', 'Being payment made through cheque.']],
  ['Cheque Bounce', ['Being cheque received from {Customer} dishonoured by bank.', 'Being cheque issued to {Supplier} dishonoured by bank.']],
  ['Bank Charges', ['Being bank charges debited by bank.']],
  ['Bank Interest', ['Being bank interest credited by bank.']],
  ['Loan Received', ['Being loan received from bank.']],
  ['Loan Repaid', ['Being loan repaid to bank.']],
  ['Asset Purchase', ['Being {AssetName} purchased.']],
  ['Asset Sale', ['Being {AssetName} sold.']],
  ['Depreciation', ['Being depreciation charged on {AssetName}.']],
  ['Bad Debts', ['Being bad debts written off.']],
  ['Bad Debts Recovered', ['Being bad debts recovered.']],
  ['Closing Stock', ['Being closing stock valued and recorded.']],
  ['Adjustment Entry', ['Being adjustment entry passed.']],
  ['Opening Balance', ['Being opening balance brought forward.']],
  ['General Payment', ['Being payment made.']],
]

export const narrationTemplates: NarrationTemplate[] = definitions.flatMap(([category, templates]) =>
  templates.map(template => ({
    category,
    template,
    aliases: Array.from(new Set(`${category} ${template}`.toLowerCase().replace(/[{}().↔]/g, ' ').split(/\s+/).filter(word => word.length > 2))),
  })),
)

const contextValue = (placeholder: string, context: NarrationContext) => {
  if (placeholder === 'Supplier') return context.supplier || context.party
  if (placeholder === 'Customer') return context.customer || context.party
  if (placeholder === 'AssetName') return context.assetName
  return undefined
}

export function fillNarrationTemplate(template: string, context: NarrationContext = {}) {
  return template.replace(/\{(Supplier|Customer|AssetName)\}/g, (match, placeholder: string) =>
    contextValue(placeholder, context)?.trim() || match,
  )
}

const voucherMatches = (category: string, voucherType?: string) => {
  if (!voucherType) return false
  const categoryText = category.toLowerCase()
  const voucherText = voucherType.toLowerCase()
  if (categoryText.includes(voucherText)) return true
  if (voucherText === 'purchase') return categoryText.includes('purchase') || categoryText.includes('payment')
  if (voucherText === 'sales') return categoryText.includes('sale') || categoryText.includes('receipt')
  if (voucherText === 'receipt') return categoryText.includes('receipt') || categoryText.includes('income')
  if (voucherText === 'payment') return categoryText.includes('payment') || ['wages', 'salary', 'rent', 'electricity', 'insurance', 'advertisement', 'stationery', 'carriage'].includes(categoryText)
  if (voucherText === 'contra') return categoryText.includes('contra')
  if (voucherText === 'journal') return ['adjustment entry', 'opening balance', 'closing stock', 'depreciation'].includes(categoryText)
  return false
}

export function getNarrationSuggestions(query: string, context: NarrationContext = {}, limit = 10) {
  const normalized = query.trim().toLowerCase()
  const tokens = normalized.split(/\s+/).filter(Boolean)
  return narrationTemplates
    .filter(item => {
      if (!normalized) return true
      const searchable = [item.category, item.template, ...item.aliases].join(' ').toLowerCase()
      return tokens.every(token => searchable.includes(token))
    })
    .sort((a, b) => Number(voucherMatches(b.category, context.voucherType)) - Number(voucherMatches(a.category, context.voucherType)))
    .slice(0, limit)
    .map(item => ({
      category: item.category,
      template: item.template,
      value: fillNarrationTemplate(item.template, context),
    }))
}
