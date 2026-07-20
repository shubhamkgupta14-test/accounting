import type { MouseEvent, ReactNode } from 'react'

export function openAccountLedger(account: string) {
  window.dispatchEvent(new CustomEvent('open-account-ledger', { detail: { account } }))
}

export default function AccountDrilldown({ account, children }: { account: string; children?: ReactNode }) {
  const open = (event: MouseEvent<HTMLSpanElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    openAccountLedger(account)
  }
  return <span onDoubleClick={open} title="Ctrl + double-click to open ledger window">{children ?? account}</span>
}
