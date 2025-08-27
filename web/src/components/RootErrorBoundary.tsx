import React from 'react'

type Props = { children: React.ReactNode }

type State = { hasError: boolean; error?: any }

export default class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, errorInfo: any) {
    // eslint-disable-next-line no-console
    console.error('RootErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 border border-destructive/40 rounded bg-destructive/10 text-destructive-foreground">
          <div className="font-semibold mb-1">Something went wrong rendering this view.</div>
          <div className="text-sm opacity-80">Try refreshing the page. If this persists, please capture the console error and open an issue.</div>
        </div>
      )
    }
    return this.props.children
  }
}

