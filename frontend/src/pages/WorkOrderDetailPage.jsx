import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usersApi, workOrdersApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/Layout';
import { ConfirmDialog } from '../components/Modal';
import { ErrorState, InlineAlert, Loading } from '../components/States';
import { Timeline } from '../components/Timeline';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { WO_ACTION_LABELS } from '../utils/constants';
import { formatDateTime, formatRelative, humanize, isOverdue } from '../utils/format';

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const { isAdmin, user } = useAuth();
  const toast = useToast();
  const detail = useAsync((signal) => workOrdersApi.get(id, { signal }), [id]);
  const technicians = useAsync((signal) => usersApi.technicians({ signal }), [], { enabled: isAdmin });

  const [pending, setPending] = useState(null); // status being confirmed
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const [techId, setTechId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [savingNote, setSavingNote] = useState(false);

  const d = detail.data;
  const wo = d?.workOrder;

  useEffect(() => {
    setTechId(wo?.assignedTechnician?.id || '');
  }, [wo?.assignedTechnician?.id]);

  if (detail.error && !d) {
    return (
      <div className="page">
        <PageHeader title="Work order" breadcrumbs={[{ label: 'Work orders', to: '/work-orders' }, { label: `WO-${id}` }]} />
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!d) return <Loading label="Loading work order…" />;

  const isActive = wo.status !== 'Completed' && wo.status !== 'Cancelled';
  const isAssignee = wo.assignedTechnician?.id === user?.id;
  const canAddNote = isAdmin || isAssignee;

  const runTransition = async (status, remarks) => {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await workOrdersApi.updateStatus(wo.workOrderId, status, remarks);
      detail.setData(updated);
      toast.success(`WO-${wo.workOrderId} is now ${humanize(status)}.`);
      setPending(null);
    } catch (err) {
      setActionError(err.message);
      if (err.status === 409) detail.reload();
    } finally {
      setBusy(false);
    }
  };

  const assign = async (e) => {
    e.preventDefault();
    if (!techId) return;
    setAssigning(true);
    try {
      const updated = await workOrdersApi.assign(wo.workOrderId, techId);
      detail.setData(updated);
      toast.success(`Assigned to ${updated.workOrder.assignedTechnician?.fullName}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    const text = note.trim();
    if (text.length < 2) {
      setNoteError('Note must be at least 2 characters.');
      return;
    }
    if (text.length > 4000) {
      setNoteError('Note must be at most 4000 characters.');
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      await workOrdersApi.addNote(wo.workOrderId, text);
      setNote('');
      toast.success('Note added.');
      detail.reload();
    } catch (err) {
      setNoteError(err.errors?.Text?.join(' ') || err.message);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        breadcrumbs={[{ label: 'Work orders', to: '/work-orders' }, { label: `WO-${wo.workOrderId}` }]}
        title={
          <span className="title-with-badge">
            {wo.requestTitle} <StatusBadge status={wo.status} /> <PriorityBadge priority={wo.priority} />
          </span>
        }
        subtitle={
          <>
            <span className="mono">WO-{wo.workOrderId}</span> · from{' '}
            <Link to={`/requests/${wo.requestId}`}>REQ-{wo.requestId}</Link> ·{' '}
            <Link to={`/assets/${wo.assetId}`} className="mono-link">
              {wo.assetCode}
            </Link>{' '}
            {wo.assetName}
          </>
        }
      />

      {d.allowedTransitions.length > 0 && (
        <section className="card action-bar" aria-label="Status actions">
          <span className="muted small">Next step:</span>
          {d.allowedTransitions.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${s === 'Cancelled' ? 'btn-danger-outline' : s === 'Completed' ? 'btn-success' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => {
                setActionError(null);
                setPending(s);
              }}
            >
              {WO_ACTION_LABELS[s] || humanize(s)}
            </button>
          ))}
        </section>
      )}
      {!isAdmin && !isAssignee && isActive && (
        <InlineAlert type="info">You can view this work order, but only the assigned technician or an admin can update it.</InlineAlert>
      )}

      <div className="detail-grid">
        <section className="card">
          <div className="card-head">
            <h2>Request</h2>
          </div>
          <p className="prewrap">{d.requestDescription}</p>
          <dl className="meta-list">
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(wo.createdAt)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd className={isOverdue(wo) ? 'text-danger strong' : ''}>
                {formatDateTime(wo.dueDate)}
                {isOverdue(wo) && ' (overdue)'}
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatDateTime(wo.startDate)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatDateTime(wo.completionDate)}</dd>
            </div>
          </dl>
          {wo.remarks && (
            <>
              <h3 className="sub-heading">Remarks</h3>
              <p className="prewrap remarks">{wo.remarks}</p>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Assignment</h2>
          </div>
          <div className="assignee">
            {wo.assignedTechnician ? (
              <>
                <span className="avatar" aria-hidden="true">
                  {wo.assignedTechnician.fullName
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div>
                  <strong>{wo.assignedTechnician.fullName}</strong>
                  <div className="muted small">
                    {wo.assignedTechnician.email}
                    {wo.assignedAt && ` · assigned ${formatRelative(wo.assignedAt)}`}
                  </div>
                </div>
              </>
            ) : (
              <span className="muted">Not assigned yet.</span>
            )}
          </div>
          {isAdmin && isActive && (
            <form className="assign-form" onSubmit={assign}>
              <FormField label={wo.assignedTechnician ? 'Reassign to' : 'Assign to'} hint={technicians.error?.message}>
                <select value={techId} onChange={(e) => setTechId(e.target.value)} disabled={!technicians.data}>
                  <option value="">Select technician…</option>
                  {technicians.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
              </FormField>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={assigning || !techId || techId === wo.assignedTechnician?.id}
              >
                {assigning ? 'Saving…' : wo.assignedTechnician ? 'Reassign' : 'Assign'}
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Notes</h2>
            <span className="count-pill">{d.notes.length}</span>
          </div>
          {d.notes.length === 0 ? (
            <p className="muted small">No notes yet.</p>
          ) : (
            <ul className="notes">
              {d.notes.map((n) => (
                <li key={n.noteId} className="note">
                  <div className="note-head">
                    <strong>{n.author.fullName}</strong>
                    <time className="muted small" dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                      {formatRelative(n.createdAt)}
                    </time>
                  </div>
                  <p className="prewrap">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
          {canAddNote && (
            <form className="note-form" onSubmit={addNote} noValidate>
              <FormField label="Add a note" error={noteError} counter={`${note.trim().length}/4000`}>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (noteError) setNoteError(null);
                  }}
                  placeholder="Findings, parts used, readings…"
                />
              </FormField>
              <button type="submit" className="btn btn-primary" disabled={savingNote}>
                {savingNote ? 'Adding…' : 'Add note'}
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Timeline</h2>
          </div>
          <Timeline entries={d.history} />
        </section>
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending ? `${WO_ACTION_LABELS[pending] || humanize(pending)} — WO-${wo.workOrderId}` : ''}
        message={
          pending === 'Cancelled' ? (
            <p>Cancelling returns the request to the approved queue. Please give a reason.</p>
          ) : pending === 'Completed' ? (
            <p>Mark this work as completed? The request will be resolved. You can add closing remarks.</p>
          ) : pending === 'InProgress' ? (
            <p>Start work on this order now? The start time will be recorded.</p>
          ) : null
        }
        confirmLabel={pending ? WO_ACTION_LABELS[pending] || humanize(pending) : 'Confirm'}
        danger={pending === 'Cancelled'}
        requireReason={pending === 'Cancelled'}
        reasonOptional={pending === 'Completed'}
        reasonLabel={pending === 'Cancelled' ? 'Reason for cancelling' : 'Completion remarks'}
        busy={busy}
        error={actionError}
        onConfirm={(remarks) => runTransition(pending, remarks)}
        onCancel={() => {
          setPending(null);
          setActionError(null);
        }}
      />
    </div>
  );
}
