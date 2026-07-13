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
})
