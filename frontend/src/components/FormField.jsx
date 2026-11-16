import { cloneElement, isValidElement, useId } from 'react';

/**
 * Label + control + hint + error. The control (input/select/textarea) is passed as the
 * only child; id / aria-invalid / aria-describedby are wired automatically.
 */
export function FormField({ label, error, hint, required, children, className = '', counter }) {
  const autoId = useId();
  const id = (isValidElement(children) && children.props.id) || `f${autoId.replace(/:/g, '')}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
        'aria-required': required ? 'true' : undefined,
        className: [children.props.className || 'input', error ? 'has-error' : ''].join(' ').trim(),
      })
    : children;

  return (
    <div className={`form-field ${error ? 'is-invalid' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="form-label">
          {label}
          {required && <span className="req" aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      <div className="form-meta">
        {error ? (
          <span id={errorId} className="field-error">
            {error}
          </span>
        ) : hint ? (
          <span id={hintId} className="field-hint">
            {hint}
          </span>
        ) : (
          <span />
        )}
        {counter && <span className="field-counter">{counter}</span>}
      </div>
    </div>
  );
}
