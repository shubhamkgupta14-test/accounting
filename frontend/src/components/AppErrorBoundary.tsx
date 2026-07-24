import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unable to render the application page', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="auth-page">
        <section className="auth-panel card" role="alert">
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Unable to load this page</h1>
          <p style={{ color: '#64748B', lineHeight: 1.5 }}>
            The page encountered an unexpected loading error. Your saved data was not changed.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </section>
      </main>
    )
  }
}
