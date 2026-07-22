import { FormEvent, useEffect, useRef, useState } from 'react'
import { Bot, Eraser, Send, Settings, X } from 'lucide-react'
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
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}

export default function AIChatDrawer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { chatOpen, closeChat, configured, activeProvider, activeModel, messages, sending, sendMessage, clearChat } = useAI()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])
  if (!chatOpen) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = message.trim()
    if (!next || sending) return
    setMessage('')
    setError('')
    try { await sendMessage(next) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to reach Grok.') }
  }

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
                {item.role === 'assistant'
                  ? <AIResponseMarkdown content={item.content} />
                  : <div>{item.content}</div>}
                {item.suggestions && item.suggestions.length > 0 && (
                  <ol>{item.suggestions.slice(0, 5).map((suggestion, index) => <li key={`${item.id}-${index}`}>{suggestion}</li>)}</ol>
                )}
              </div>
            ))}
            {sending && <div className="ai-message ai-message-assistant ai-thinking">Grok is preparing an accounting reply...</div>}
            {error && <div className="ai-chat-error">{error}</div>}
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
            <button className="btn btn-primary btn-icon" type="submit" aria-label="Send question" disabled={!message.trim() || sending}><Send size={16} /></button>
            <small>Accounting guidance only. Maximum five suggestions.</small>
          </form>
        </>
      )}
    </aside>
  )
}
