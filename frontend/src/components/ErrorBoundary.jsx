import { Component } from 'react';

/** Last line of defence: a render error shows a recoverable message instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold text-slate-800">Something went wrong on this screen.</p>
        <p className="max-w-md text-sm text-slate-500">{String(this.state.error.message || this.state.error)}</p>
        <button
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
