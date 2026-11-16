import { Component } from 'react';

/** Catches render errors in a page so the shell (nav, sign-out) keeps working. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-state" role="alert">
        <div className="error-icon" aria-hidden="true">!</div>
        <h3>This page failed to load</h3>
        <p>An unexpected error occurred while rendering. Try again, or go back to the previous page.</p>
        <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
