import { AlertOctagon } from 'lucide-react';
import { Component } from 'react';

/** Catches render errors in a subtree (one broken chart must not blank the whole app). Never shows stack traces. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div role="alert" className="mx-auto my-12 max-w-md rounded-xl border border-red-300 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
        <AlertOctagon className="mx-auto mb-3 text-red-700 dark:text-red-400" size={32} aria-hidden="true" />
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">This section failed to load</h2>
        <p className="mt-1 text-sm text-red-800 dark:text-red-300">Something went wrong while drawing this page. Your data is safe.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={this.reset} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800">Try again</button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-4 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40">Go home</a>
        </div>
      </div>
    );
  }
}
