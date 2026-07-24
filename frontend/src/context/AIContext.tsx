import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type AIChatHistoryMessage, type AIKeyStatus, type AIProvider, type AIProviderConfiguration } from '../lib/api'
import { useAuth } from './AuthContext'

const CONTEXT_MESSAGE_LIMIT = 12
const DISPLAY_MESSAGE_LIMIT = 50
const CHAT_STORAGE_PREFIX = 'accounting.aiChat.messages.'

export const AI_PROVIDER_OPTIONS: Array<{ id: AIProvider; label: string; models: Array<{ id: string; label: string }> }> = [
  { id: 'grok', label: 'xAI Grok', models: [{ id: 'grok-4.3', label: 'Grok 4.3' }, { id: 'grok-4.5', label: 'Grok 4.5' }] },
  { id: 'groq', label: 'GroqCloud', models: [
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
  ] },
  { id: 'gemini', label: 'Google Gemini', models: [
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  ] },
]

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions?: string[]
  provider?: AIProvider
  status?: 'streaming' | 'stopped' | 'error'
}

export interface AIChatError { message: string; code: string; provider?: AIProvider; retryable: boolean }

interface AIContextValue {
  configured: boolean
  checking: boolean
  expiresAt: string | null
  activeProvider: AIProvider | null
  activeModel: string | null
  configurations: AIProviderConfiguration[]
  chatOpen: boolean
  messages: AIMessage[]
  sending: boolean
  streamError: AIChatError | null
  connect: (provider: AIProvider, model: string, apiKey: string) => Promise<void>
  activate: (provider: AIProvider) => Promise<void>
  disconnect: (provider: AIProvider) => Promise<void>
  openChat: () => void
  closeChat: () => void
  clearChat: () => void
  sendMessage: (message: string) => Promise<void>
  stopGenerating: () => void
  retryLast: (provider?: AIProvider) => Promise<void>
}

const AIContext = createContext<AIContextValue | null>(null)

const messageId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const trimMessages = (messages: AIMessage[]) => messages.slice(-DISPLAY_MESSAGE_LIMIT)
const chatStorageKey = (userId: string | number) => `${CHAT_STORAGE_PREFIX}${userId}`

function readStoredMessages(userId: string | number): AIMessage[] {
  try {
    const stored = window.sessionStorage.getItem(chatStorageKey(userId))
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return trimMessages(parsed.filter((item): item is AIMessage => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<AIMessage>
      return typeof candidate.id === 'string'
        && (candidate.role === 'user' || candidate.role === 'assistant')
        && typeof candidate.content === 'string'
        && (candidate.suggestions === undefined
          || (Array.isArray(candidate.suggestions) && candidate.suggestions.every(value => typeof value === 'string')))
    }).map(item => item.status === 'streaming' ? { ...item, status: 'stopped' as const } : item))
  } catch {
    return []
  }
}

function storeMessages(userId: string | number, messages: AIMessage[]) {
  try {
    const key = chatStorageKey(userId)
    if (messages.length === 0) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify(trimMessages(messages)))
  } catch {
    // Chat remains usable when browser storage is disabled or full.
  }
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [configured, setConfigured] = useState(false)
  const [checking, setChecking] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<AIProvider | null>(null)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [configurations, setConfigurations] = useState<AIProviderConfiguration[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [historyUserId, setHistoryUserId] = useState<string | number | null>(null)
  const [sending, setSending] = useState(false)
  const [streamError, setStreamError] = useState<AIChatError | null>(null)
  const messagesRef = useRef<AIMessage[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<{ content: string; userMessageId: string; provider?: AIProvider } | null>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])

  const applyStatus = useCallback((status: AIKeyStatus) => {
    setConfigured(status.configured)
    setActiveProvider(status.active_provider)
    setActiveModel(status.active_model)
    setConfigurations(status.configurations)
    const active = status.configurations.find(item => item.provider === status.active_provider)
    setExpiresAt(active?.expires_at || null)
  }, [])

  useEffect(() => {
    if (!user) {
      if (historyUserId !== null) storeMessages(historyUserId, [])
      setMessages([])
      setHistoryUserId(null)
      return
    }
    setMessages(readStoredMessages(user.id))
    setHistoryUserId(user.id)
  }, [user?.id])

  useEffect(() => {
    if (user && historyUserId === user.id) storeMessages(user.id, messages)
  }, [historyUserId, messages, user?.id])

  useEffect(() => {
    if (!user) {
      setConfigured(false)
      setExpiresAt(null)
      setActiveProvider(null)
      setActiveModel(null)
      setConfigurations([])
      setMessages([])
      setChatOpen(false)
      return
    }
    let active = true
    setChecking(true)
    api.aiKeyStatus()
      .then(status => {
        if (!active) return
        applyStatus(status)
      })
      .catch(() => {
        if (!active) return
        setConfigured(false)
        setExpiresAt(null)
        setActiveProvider(null)
        setActiveModel(null)
        setConfigurations([])
      })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [applyStatus, user?.id])

  const connect = useCallback(async (provider: AIProvider, model: string, apiKey: string) => {
    applyStatus(await api.connectAIKey(provider, model, apiKey))
  }, [applyStatus])

  const activate = useCallback(async (provider: AIProvider) => {
    applyStatus(await api.activateAIProvider(provider))
  }, [applyStatus])

  const disconnect = useCallback(async (provider: AIProvider) => {
    const status = await api.disconnectAIProvider(provider)
    applyStatus(status)
    if (!status.configured) setMessages([])
  }, [applyStatus])

  const runMessage = useCallback(async (rawMessage: string, provider?: AIProvider, retry = false) => {
    const content = rawMessage.trim()
    if (!content || controllerRef.current) return
    const current = messagesRef.current
    let userMessage: AIMessage
    let baseMessages: AIMessage[]
    if (retry && lastRequestRef.current) {
      const index = current.findIndex(item => item.id === lastRequestRef.current?.userMessageId)
      if (index < 0) return
      userMessage = current[index]
      baseMessages = current.slice(0, index + 1)
    } else {
      userMessage = { id: messageId(), role: 'user', content }
      baseMessages = [...current, userMessage]
    }
    const history: AIChatHistoryMessage[] = baseMessages
      .slice(0, -1)
      .slice(-(CONTEXT_MESSAGE_LIMIT - 1))
      .map(message => ({ role: message.role, content: message.content }))
    const assistantId = messageId()
    const placeholder: AIMessage = { id: assistantId, role: 'assistant', content: '', status: 'streaming', provider }
    lastRequestRef.current = { content, userMessageId: userMessage.id, provider }
    setMessages(trimMessages([...baseMessages, placeholder]))
    setStreamError(null)
    setSending(true)
    const controller = new AbortController()
    controllerRef.current = controller
    let terminalEvent = false
    let invalidKeyReported = false
    try {
      await api.streamAIChat(content, history, provider, controller.signal, event => {
        if (event.type === 'start') {
          lastRequestRef.current = { content, userMessageId: userMessage.id, provider: event.provider }
          setMessages(items => items.map(item => item.id === assistantId ? { ...item, provider: event.provider } : item))
        } else if (event.type === 'delta') {
          setMessages(items => items.map(item => item.id === assistantId
            ? { ...item, content: item.content + event.delta }
            : item))
        } else if (event.type === 'done') {
          terminalEvent = true
          setMessages(items => items.map(item => item.id === assistantId ? {
            ...item, content: event.response.answer, suggestions: event.response.suggestions.slice(0, 5),
            provider: event.response.provider, status: undefined,
          } : item))
        } else if (event.type === 'error') {
          terminalEvent = true
          invalidKeyReported = event.code === 'invalid_key'
          setStreamError({ message: event.message, code: event.code, provider: event.provider, retryable: event.retryable })
          setMessages(items => items.map(item => item.id === assistantId ? { ...item, status: 'error' } : item))
        }
      })
      if (!terminalEvent) throw new ApiError('The provider response ended unexpectedly. Please retry.', 502)
      if (invalidKeyReported) {
        try { applyStatus(await api.aiKeyStatus()) }
        catch { /* Keep the current status until the next status refresh. */ }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessages(items => items.map(item => item.id === assistantId ? { ...item, status: 'stopped' } : item))
        return
      }
      setStreamError({
        message: error instanceof Error ? error.message : 'Unable to reach the AI provider.',
        code: error instanceof ApiError ? `http_${error.status}` : 'connection_error', retryable: true,
        provider,
      })
      setMessages(items => items.map(item => item.id === assistantId ? { ...item, status: 'error' } : item))
      if (error instanceof ApiError && (error.status === 409 || error.status === 428)) {
        try { applyStatus(await api.aiKeyStatus()) }
        catch { applyStatus({ configured: false, active_provider: null, active_model: null, configurations: [] }) }
      }
    } finally {
      controllerRef.current = null
      setSending(false)
    }
  }, [applyStatus])

  const sendMessage = useCallback((message: string) => runMessage(message), [runMessage])
  const retryLast = useCallback(async (provider?: AIProvider) => {
    const last = lastRequestRef.current
    if (!last) return
    await runMessage(last.content, provider ?? last.provider, true)
  }, [runMessage])
  const stopGenerating = useCallback(() => controllerRef.current?.abort(), [])

  const value = useMemo<AIContextValue>(() => ({
    configured,
    checking,
    expiresAt,
    activeProvider,
    activeModel,
    configurations,
    chatOpen,
    messages,
    sending,
    streamError,
    connect,
    activate,
    disconnect,
    openChat: () => setChatOpen(true),
    closeChat: () => setChatOpen(false),
    clearChat: () => {
      if (user) storeMessages(user.id, [])
      setMessages([])
      setStreamError(null)
      lastRequestRef.current = null
    },
    sendMessage,
    stopGenerating,
    retryLast,
  }), [activeModel, activeProvider, activate, chatOpen, checking, configurations, configured, connect, disconnect, expiresAt, messages, retryLast, sendMessage, sending, stopGenerating, streamError, user])

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

export function useAI() {
  const value = useContext(AIContext)
  if (!value) throw new Error('useAI must be used within AIProvider')
  return value
}
