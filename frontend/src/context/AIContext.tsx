import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
}

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
  connect: (provider: AIProvider, model: string, apiKey: string) => Promise<void>
  activate: (provider: AIProvider) => Promise<void>
  disconnect: (provider: AIProvider) => Promise<void>
  openChat: () => void
  closeChat: () => void
  clearChat: () => void
  sendMessage: (message: string) => Promise<void>
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
    }))
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

  const sendMessage = useCallback(async (rawMessage: string) => {
    const content = rawMessage.trim()
    if (!content || sending) return
    const userMessage: AIMessage = { id: messageId(), role: 'user', content }
    const history: AIChatHistoryMessage[] = messages
      .slice(-(CONTEXT_MESSAGE_LIMIT - 1))
      .map(message => ({ role: message.role, content: message.content }))
    setMessages(current => trimMessages([...current, userMessage]))
    setSending(true)
    try {
      const result = await api.aiChat(content, history)
      const assistantMessage: AIMessage = {
        id: messageId(),
        role: 'assistant',
        content: result.answer,
        suggestions: result.suggestions.slice(0, 5),
      }
      setMessages(current => trimMessages([...current, assistantMessage]))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 428)) {
        try { applyStatus(await api.aiKeyStatus()) }
        catch { applyStatus({ configured: false, active_provider: null, active_model: null, configurations: [] }) }
      }
      throw error
    } finally {
      setSending(false)
    }
  }, [applyStatus, messages, sending])

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
    connect,
    activate,
    disconnect,
    openChat: () => setChatOpen(true),
    closeChat: () => setChatOpen(false),
    clearChat: () => {
      if (user) storeMessages(user.id, [])
      setMessages([])
    },
    sendMessage,
  }), [activeModel, activeProvider, activate, chatOpen, checking, configurations, configured, connect, disconnect, expiresAt, messages, sendMessage, sending, user])

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

export function useAI() {
  const value = useContext(AIContext)
  if (!value) throw new Error('useAI must be used within AIProvider')
  return value
}
