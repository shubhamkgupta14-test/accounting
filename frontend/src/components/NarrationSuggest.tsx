import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getNarrationSuggestions, type NarrationContext } from '../data/narrationTemplates'

interface Props {
  value: string
  context?: NarrationContext
  onPick: (value: string) => void
}

export default function NarrationSuggest({ value, context, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const suggestions = getNarrationSuggestions(search, context, 100)
  const typedSuggestions = getNarrationSuggestions(value, context, 6)
    .filter(suggestion => suggestion.value.trim().toLowerCase() !== value.trim().toLowerCase())

  return (
    <div className="narration-browser">
      {!open && value.trim().length >= 2 && typedSuggestions.length > 0 && (
        <div className="narration-suggest" aria-label="Narration suggestions">
          <div className="narration-live-label">Suggestions</div>
          {typedSuggestions.map(suggestion => (
            <button
              key={`typed-${suggestion.category}-${suggestion.value}`}
              type="button"
              className="narration-option"
              onClick={() => onPick(suggestion.value)}
            >
              <span>{suggestion.category}</span>
              <strong>{suggestion.value}</strong>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="narration-browser-toggle" aria-expanded={open} onClick={() => { setOpen(current => !current); setSearch('') }}>
        <span>Browse narration templates</span>
        <small>{suggestions.length} available</small>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="narration-suggest">
          <div className="narration-search">
            <input className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search capital, payment, cheque, salary…" autoFocus />
          </div>
          {suggestions.length ? suggestions.map(suggestion => (
            <button
              key={`${suggestion.category}-${suggestion.value}`}
              type="button"
              className="narration-option"
              onClick={() => { onPick(suggestion.value); setOpen(false); setSearch('') }}
            >
              <span>{suggestion.category}</span>
              <strong>{suggestion.value}</strong>
            </button>
          )) : <div className="narration-empty">No matching narration templates.</div>}
        </div>
      )}
    </div>
  )
}
