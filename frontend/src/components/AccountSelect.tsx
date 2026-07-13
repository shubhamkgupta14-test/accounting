import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Account } from '../lib/api'

interface Props {
  accounts: Account[]
  value: string
  onChange: (accountName: string) => void
}

export default function AccountSelect({ accounts, value, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionsId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)

  useEffect(() => { if (!open) setQuery(value) }, [open, value])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [value])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return accounts.filter(account => {
      const searchable = `${account.name} ${account.code} ${account.group}`.toLowerCase()
      return !term || searchable.includes(term)
    })
  }, [accounts, query])

  const selectAccount = (account: Account) => {
    onChange(account.name)
    setQuery(account.name)
    setOpen(false)
  }

  return (
    <div className="account-combobox" ref={rootRef}>
      <div className="account-combobox-input">
        <Search size={13} aria-hidden="true" />
        <input
          ref={inputRef}
          className="input"
          role="combobox"
          aria-label="Search and select account"
          aria-expanded={open}
          aria-controls={optionsId}
          placeholder="Type to search account…"
          value={query}
          onFocus={event => { setOpen(true); event.currentTarget.select() }}
          onChange={event => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            const exact = accounts.find(account => account.name.toLowerCase() === next.trim().toLowerCase())
            onChange(exact?.name || '')
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && open && filtered.length > 0) {
              event.preventDefault()
              selectAccount(filtered[0])
            }
            if (event.key === 'Escape') {
              setOpen(false)
              setQuery(value)
            }
          }}
        />
        <button
          type="button"
          title="Browse accounts"
          aria-label="Browse accounts"
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            setOpen(true)
            setQuery('')
            inputRef.current?.focus()
          }}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="account-options" id={optionsId} role="listbox">
          <div className="account-options-list">
            {filtered.map(account => (
              <button
                type="button"
                role="option"
                aria-selected={account.name === value}
                className="account-option"
                key={account.id}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectAccount(account)}
              >
                <span className="account-option-main">
                  <strong>{account.name}</strong>
                  <small>{account.code} · {account.group}</small>
                </span>
                <span className={`account-type account-type-${account.type.toLowerCase()}`}>{account.type}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="account-options-empty">No matching accounts.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
