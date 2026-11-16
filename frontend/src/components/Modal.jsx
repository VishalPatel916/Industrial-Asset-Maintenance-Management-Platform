import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from './FormField';
import { InlineAlert } from './States';

export function Modal({ open, title, onClose, children, footer, size = 'md', busy = false }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };

  useEffect(() => {
    if (!open) return undefined;
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && !latest.current.busy) latest.current.onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = dialogRef.current?.querySelector('[data-autofocus], input, select, textarea, button.btn-primary');
      el?.focus();
    }, 0);
    document.body.classList.add('modal-open');
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation dialog. When `requireReason` is set a textarea is shown and its
 * (trimmed) value is passed to onConfirm; `reasonOptional` shows it without requiring it.
 */
export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  error,
  requireReason = false,
  reasonOptional = false,
  reasonLabel = 'Remarks',
  reasonMaxLength = 2000,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setReasonError(null);
    }
  }, [open]);

  const showReason = requireReason || reasonOptional;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (requireReason && !trimmed) {
      setReasonError(`${reasonLabel} ${reasonLabel.endsWith('s') ? 'are' : 'is'} required.`);
      return;
    }
    if (trimmed.length > reasonMaxLength) {
      setReasonError(`Must be at most ${reasonMaxLength} characters.`);
      return;
    }
    onConfirm(trimmed || null);
  };

  return (
    <Modal open={open} title={title} onClose={onCancel} busy={busy} size="sm">
      <form onSubmit={submit} noValidate>
        {message && <div className="confirm-message">{message}</div>}
        <InlineAlert>{error}</InlineAlert>
        {showReason && (
          <FormField label={reasonLabel} required={requireReason} error={reasonError} counter={`${reason.length}/${reasonMaxLength}`}>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input" data-autofocus />
          </FormField>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} data-autofocus={!showReason || undefined}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
