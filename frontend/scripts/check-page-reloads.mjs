import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const pages = [
  'dashboard', 'journal', 'vouchers', 'ledger', 'cashbook', 'bankbook',
  'trial-balance', 'trading', 'profit-loss', 'balance-sheet', 'daybook',
  'chart-of-accounts', 'reports', 'settings', 'notifications',
  'user-management', 'clean-db', 'account-summary', 'profit-analysis',
  'cash-flow-report',
]
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = 'http://127.0.0.1:5173'
const debuggingPort = 9_300 + (process.pid % 300)
const profile = mkdtempSync(path.join(tmpdir(), 'accounting-page-check-'))

function developmentCredentials() {
  const values = {}
  for (const line of readFileSync(new URL('../.env.development', import.meta.url), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) values[match[1].trim()] = match[2].trim()
  }
  const password = values.VITE_DEMO_PASSWORD
  const accounts = [
    ['superadmin', values.VITE_DEMO_SUPERADMIN_EMAIL],
    ['admin', values.VITE_DEMO_ADMIN_EMAIL],
    ['user', values.VITE_DEMO_USER_EMAIL],
  ]
  if (!password || accounts.some(([, email]) => !email)) {
    throw new Error('Development role credentials are not configured')
  }
  return accounts.map(([role, email]) => ({ role, email, password }))
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function waitForBrowser() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      if (response.ok) return response.json()
    } catch {
      // Browser is still starting.
    }
    await delay(100)
  }
  throw new Error('Timed out waiting for the headless browser')
}

class CdpClient {
  constructor(url) {
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.socket = new WebSocket(url)
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || []
    listeners.push(listener)
    this.listeners.set(method, listeners)
  }

  once(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) || []
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs)
      const listener = params => {
        clearTimeout(timeout)
        this.listeners.set(method, (this.listeners.get(method) || []).filter(item => item !== listener))
        resolve(params)
      }
      listeners.push(listener)
      this.listeners.set(method, listeners)
    })
  }
}

async function navigate(client, url) {
  const loaded = client.once('Page.loadEventFired')
  await client.send('Page.navigate', { url })
  await loaded
  await delay(1200)
}

const browser = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profile}`,
  `${baseUrl}/`,
], { stdio: 'ignore' })

let client
try {
  const targets = await waitForBrowser()
  const target = targets.find(item => item.type === 'page' && item.url.startsWith(baseUrl))
  if (!target) throw new Error('No browser page target was created')
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await navigate(client, `${baseUrl}/`)

  const failures = []
  for (const credentials of developmentCredentials()) {
    const login = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          credentials: 'include',
          body: JSON.stringify(${JSON.stringify(credentials)})
        });
        return response.status;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (login.result.value !== 200) {
      throw new Error(
        `${credentials.role} development login failed: ${JSON.stringify({
          result: login.result,
          exceptionDetails: login.exceptionDetails,
        })}`,
      )
    }

    for (const page of pages) {
      const exceptions = []
      const recordException = params => exceptions.push(params.exceptionDetails?.text || 'Runtime exception')
      client.on('Runtime.exceptionThrown', recordException)
      await navigate(client, `${baseUrl}/?page=${encodeURIComponent(page)}`)
      const result = await client.send('Runtime.evaluate', {
        expression: `({
        rootHtmlLength: document.querySelector('#root')?.innerHTML.length || 0,
        hasAppShell: Boolean(document.querySelector('.main-content')),
        hasAuthPage: Boolean(document.querySelector('.auth-page'))
      })`,
        returnByValue: true,
      })
      const state = result.result.value
      const passed = state.rootHtmlLength > 100 && state.hasAppShell && !state.hasAuthPage && exceptions.length === 0
      console.log(`${passed ? 'PASS' : 'FAIL'} ${credentials.role}/${page} root=${state.rootHtmlLength} shell=${state.hasAppShell} exceptions=${exceptions.length}`)
      if (!passed) failures.push({ role: credentials.role, page, state, exceptions })
    }
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2))
    process.exitCode = 1
  }
} finally {
  await client?.send('Browser.close').catch(() => undefined)
  client?.socket.close()
  await Promise.race([
    new Promise(resolve => browser.once('exit', resolve)),
    delay(2_000),
  ])
  const resolvedTemp = path.resolve(tmpdir())
  const resolvedProfile = path.resolve(profile)
  if (!resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) {
    throw new Error(`Refusing to remove browser profile outside temp: ${resolvedProfile}`)
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(resolvedProfile, { recursive: true, force: true })
      break
    } catch (error) {
      if (attempt === 4) throw error
      await delay(200)
    }
  }
}
