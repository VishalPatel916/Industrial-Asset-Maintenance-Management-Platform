import { useEffect, useState } from 'react';
import { requestsApi, usersApi, workOrdersApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { PRIORITIES, REQUEST_TRANSITIONS } from '../utils/constants';
import { dateInputToIso, humanize } from '../utils/format';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { InlineAlert } from './States';

/** Admin: review a request — change status (allowed manual transitions) and/or priority. */
export function RequestReviewDialog({ open, request, onClose, onUpdated }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && request) {
      setStatus(request.status);
      setPriority(request.priority);
      setComment('');
      setError(null);
    }
  }, [open, request]);

  if (!request) return null;
  const options = [request.status, ...(REQUEST_TRANSITIONS[request.status] || [])];
  const unchanged = status === request.status && priority === request.priority;

  const submit = async (e) => {
    e.preventDefault();
    if (unchanged) {
      setError('Change the status or priority first.');
      return;
    }
    if (comment.length > 1000) {
      setError('Comment must be at most 1000 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await requestsApi.updateStatus(request.requestId, {
        status,
        priority: priority !== request.priority ? priority : null,
        comment: comment.trim() || null,
      });
      toast.success(`Request REQ-${request.requestId} updated.`);
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`Review request REQ-${request.requestId}`} onClose={onClose} busy={busy} size="sm">
      <form onSubmit={submit} noValidate>
        <p className="muted small dialog-context">{request.title}</p>
        <InlineAlert>{error}</InlineAlert>
        <div className="form-grid two">
          <FormField label="Status" hint={options.length === 1 ? 'No manual transitions from this status.' : undefined}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={options.length === 1}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                  {s === request.status ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Comment" hint="Optional; recorded in the asset history." counter={`${comment.length}/1000`}>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || unchanged}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Admin: raise a work order from a request, optionally assigning a technician and due date. */
export function CreateWorkOrderDialog({ open, request, onClose, onCreated }) {
  const toast = useToast();
  const [technicians, setTechnicians] = useState([]);
  const [techError, setTechError] = useState(null);
  const [technicianId, setTechnicianId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setTechnicianId('');
    setDueDate('');
    setError(null);
    setFieldError(null);
    const controller = new AbortController();
    usersApi
      .technicians({ signal: controller.signal })
      .then((list) => setTechnicians(list || []))
      .catch((err) => err?.name !== 'AbortError' && setTechError(err.message));
    return () => controller.abort();
  }, [open]);

  if (!request) return null;
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const submit = async (e) => {
    e.preventDefault();
    if (dueDate && dueDate < minDate) {
      setFieldError('Due date cannot be in the past.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await workOrdersApi.create({
        requestId: request.requestId,
        assignedTechnicianId: technicianId || null,
        dueDate: dateInputToIso(dueDate),
      });
      toast.success(`Work order WO-${created.workOrder.workOrderId} created.`);
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Create work order" onClose={onClose} busy={busy} size="sm">
      <form onSubmit={submit} noValidate>
        <p className="muted small dialog-context">
          From REQ-{request.requestId}: <strong>{request.title}</strong> ({request.assetCode})
        </p>
        <InlineAlert>{error}</InlineAlert>
        <FormField label="Assign technician" hint={techError || 'Optional — you can assign later.'}>
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Unassigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Due date" error={fieldError} hint="Optional">
          <input type="date" min={minDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create work order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
