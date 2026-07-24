import { FormEvent, useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, Eraser, RefreshCw, Send, Settings, Square, X } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAI } from '../context/AIContext'

export function AIResponseMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          table: ({ node: _node, ...props }) => <div className="ai-markdown-table-wrap"><table {...props} /></div>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}

async function writeToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = content
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard copy failed')
}

export default function AIChatDrawer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    chatOpen, closeChat, configured, activeProvider, activeModel, configurations,
    messages, sending, streamError, sendMessage, stopGenerating, retryLast, clearChat,
  } = useAI()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])
  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])
  if (!chatOpen) return null

  const copyMessage = async (id: string, content: string) => {
    try {
      await writeToClipboard(content)
      setCopiedMessageId(id)
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedMessageId(null), 1600)
    } catch {
      setError('Unable to copy this message. Please allow clipboard access and try again.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = message.trim()
    if (!next || sending) return
    setMessage('')
    setError('')
    await sendMessage(next)
  }

  const lastAssistantId = [...messages].reverse().find(item => item.role === 'assistant')?.id
  const retryProvider = streamError?.provider || messages.find(item => item.id === lastAssistantId)?.provider || activeProvider
  const alternateProviders = configurations.filter(item => item.provider !== retryProvider)
  const providerName = (provider?: string | null) => provider === 'grok' ? 'Grok' : provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : 'provider'

  return (
    <aside className="ai-chat-drawer" role="dialog" aria-modal="true" aria-label="Accounting AI assistant">
      <div className="ai-chat-header">
        <div className="ai-chat-title"><span className="ai-chat-mark"><Bot size={17} /></span><div><strong>Accounting AI</strong><span>{configured ? `${activeProvider?.toUpperCase()} - ${activeModel}` : 'Provider setup required'}</span></div></div>
        <div className="ai-chat-actions">
          <button className="btn btn-ghost btn-icon" type="button" title="Clear conversation" aria-label="Clear conversation" onClick={clearChat}><Eraser size={15} /></button>
          <button className="btn btn-ghost btn-icon" type="button" title="Close" aria-label="Close AI chat" onClick={closeChat}><X size={17} /></button>
        </div>
      </div>

      {!configured ? (
        <div className="ai-chat-empty">
          <Settings size={25} />
          <strong>No AI provider is connected</strong>
          <p>Add a Grok, Groq, or Gemini API key in Settings. Keys are retained only in backend memory for this login session.</p>
          <button className="btn btn-primary" onClick={() => { closeChat(); onOpenSettings() }}>Open Settings</button>
        </div>
      ) : (
        <>
          <div className="ai-chat-messages" aria-live="polite">
            {messages.length > 0 && (
              <div className="ai-chat-top-marker" role="status">
                <span>You're at the top</span>
                <small>Only the latest 50 messages are kept</small>
              </div>
            )}
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                <Bot size={28} />
                <strong>Ask an accounting question</strong>
                <p>I can explain bookkeeping and example entries. I cannot inspect or update your application data.</p>
              </div>
            )}
            {messages.map(item => (
              <div key={item.id} className={`ai-message ai-message-${item.role}`}>
                {item.role === 'assistant' && !item.content && item.status === 'streaming'
                  ? <div className="ai-thinking">{providerName(item.provider)} is preparing an accounting reply...</div>
                  : item.role === 'assistant'
                  ? <AIResponseMarkdown content={item.content} />
                  : <div>{item.content}</div>}
                {item.suggestions && item.suggestions.length > 0 && (
                  <ol>{item.suggestions.slice(0, 5).map((suggestion, index) => <li key={`${item.id}-${index}`}>{suggestion}</li>)}</ol>
                )}
                <button
                  className="ai-message-copy"
                  type="button"
                  aria-label={copiedMessageId === item.id ? 'Message copied' : 'Copy message'}
                  title={copiedMessageId === item.id ? 'Copied' : 'Copy message'}
                  onClick={() => copyMessage(item.id, item.content)}
                >
                  {copiedMessageId === item.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
                {item.role === 'assistant' && item.id === lastAssistantId && !sending && (
                  <button className="ai-message-retry" type="button" onClick={() => retryLast()} title="Retry response">
                    <RefreshCw size={12} /> Retry
                  </button>
                )}
                {item.status === 'stopped' && <small className="ai-message-status">Generation stopped</small>}
                {item.status === 'error' && item.content && <small className="ai-message-status">Response interrupted</small>}
              </div>
            ))}
            {(error || streamError) && (
              <div className="ai-chat-error" role="alert">
                <strong>{streamError?.code === 'rate_limit' ? 'Provider limit reached' : 'AI response failed'}</strong>
                <span>{error || streamError?.message}</span>
                {(streamError?.retryable || alternateProviders.length > 0) && !sending && (
                  <div className="ai-chat-retry-actions">
                    {streamError?.retryable && (
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => retryLast()}>
                        <RefreshCw size={13} /> Retry with {providerName(retryProvider)}
                      </button>
                    )}
                    {alternateProviders.map(item => (
                      <button className="btn btn-secondary btn-sm" type="button" key={item.provider} onClick={() => retryLast(item.provider)}>
                        Retry with {providerName(item.provider)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="ai-chat-composer" onSubmit={submit}>
            <textarea
              value={message}
              maxLength={2000}
              rows={2}
              aria-label="Accounting question"
              placeholder="Ask an accounting question..."
              onChange={event => setMessage(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            {sending
              ? <button className="btn btn-danger btn-icon" type="button" aria-label="Stop generating" title="Stop generating" onClick={stopGenerating}><Square size={14} fill="currentColor" /></button>
              : <button className="btn btn-primary btn-icon" type="submit" aria-label="Send question" disabled={!message.trim()}><Send size={16} /></button>}
            <small>Accounting guidance only. Maximum five suggestions.</small>
          </form>
        </>
      )}
    </aside>
  )
}
