export function Loading({ label = 'Loading…', inline = false }) {
  return (
    <div className={inline ? 'loading loading-inline' : 'loading'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action, icon = '◇' }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title }) {
  const status = error?.status;
  const heading =
    title || (status === 403 ? 'Access denied' : status === 404 ? 'Not found' : 'Something went wrong');
  return (
    <div className="error-state" role="alert">
      <div className="error-icon" aria-hidden="true">!</div>
      <h3>{heading}</h3>
      <p>{error?.message || 'An unexpected error occurred.'}</p>
      {onRetry && status !== 403 && status !== 404 && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function InlineAlert({ type = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
