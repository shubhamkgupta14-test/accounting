import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { AIProvider, useAI } from './AIContext'

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

describe('AI session context', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
    vi.spyOn(api, 'aiKeyStatus').mockResolvedValue({ configured: false, active_provider: null, active_model: null, configurations: [] })
    vi.spyOn(api, 'connectAIKey').mockResolvedValue({
      configured: true,
      active_provider: 'grok',
      active_model: 'grok-4.3',
      configurations: [{ provider: 'grok', model: 'grok-4.3', expires_at: '2030-01-01T00:00:00Z' }],
    })
    vi.spyOn(api, 'disconnectAIProvider').mockResolvedValue({ configured: false, active_provider: null, active_model: null, configurations: [] })
    vi.spyOn(api, 'streamAIChat').mockImplementation(async (_message, _history, provider, _signal, onEvent) => {
      onEvent({ type: 'start', provider: provider || 'grok', model: 'grok-4.3' })
      onEvent({ type: 'delta', delta: 'Accounting ' })
      onEvent({ type: 'delta', delta: 'reply' })
      onEvent({ type: 'done', response: { in_scope: true, answer: 'Accounting reply', suggestions: [], provider: provider || 'grok', model: 'grok-4.3' } })
    })
  })

  it('keeps at most 50 displayed messages and sends only 12-message context', async () => {
    let current: ReturnType<typeof useAI> | null = null
    function Harness() {
      current = useAI()
      return null
    }
    render(<AIProvider><Harness /></AIProvider>)
    await waitFor(() => expect(api.aiKeyStatus).toHaveBeenCalled())

    act(() => { current!.openChat() })
    expect(current!.chatOpen).toBe(true)
    act(() => { current!.closeChat() })

    await act(async () => { await current!.connect('grok', 'grok-4.3', 'xai-temporary-key') })
    for (let index = 0; index < 27; index += 1) {
      await act(async () => { await current!.sendMessage(`Accounting question ${index}`) })
    }

    expect(current!.messages).toHaveLength(50)
    const lastCall = vi.mocked(api.streamAIChat).mock.calls.at(-1)
    expect(lastCall?.[1]).toHaveLength(11)
    expect(lastCall?.[0]).toBe('Accounting question 26')
  })

  it('restores session chat history and removes it when the conversation is cleared', async () => {
    window.sessionStorage.setItem('accounting.aiChat.messages.user-1', JSON.stringify([
      { id: 'stored-user', role: 'user', content: 'How is rent recorded?' },
      { id: 'stored-assistant', role: 'assistant', content: 'Debit rent and credit cash.' },
    ]))

    let current: ReturnType<typeof useAI> | null = null
    function Harness() {
      current = useAI()
      return null
    }
    render(<AIProvider><Harness /></AIProvider>)

    await waitFor(() => expect(current!.messages).toHaveLength(2))
    expect(current!.messages[0].content).toBe('How is rent recorded?')

    act(() => { current!.clearChat() })
    expect(current!.messages).toHaveLength(0)
    expect(window.sessionStorage.getItem('accounting.aiChat.messages.user-1')).toBeNull()
  })
})
