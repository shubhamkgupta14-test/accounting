import { afterEach, describe, expect, it, vi } from 'vitest'

describe('API session transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends requests with browser credentials and no bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await import('./api')
    await api.accounts()
    const [, options] = fetchMock.mock.calls[0]
    expect(options.credentials).toBe('include')
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('sends a provider key and selected model only to the session-key endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: true, active_provider: 'groq', active_model: 'openai/gpt-oss-20b', configurations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await import('./api')
    await api.connectAIKey('groq', 'openai/gpt-oss-20b', 'gsk-temporary-key')
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/ai/session-key')
    expect(JSON.parse(options.body)).toEqual({ provider: 'groq', model: 'openai/gpt-oss-20b', api_key: 'gsk-temporary-key' })
    expect(options.credentials).toBe('include')
  })

  it('posts only the question and supplied bounded history to AI chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ in_scope: true, answer: 'Debit expense.', suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await import('./api')
    const history = [{ role: 'user' as const, content: 'What is an expense?' }]
    await api.aiChat('How is rent recorded?', history)
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ message: 'How is rent recorded?', history })
  })
})
