import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { requestsApi, workOrdersApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { PageHeader } from '../components/Layout';
import { CreateWorkOrderDialog, RequestReviewDialog } from '../components/RequestDialogs';
import { ErrorState, Loading } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { WORK_ORDER_ELIGIBLE } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';

export default function RequestDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);

  const req = useAsync((signal) => requestsApi.get(id, { signal }), [id]);
  const r = req.data;
  // No requestId filter on the API: list the asset's work orders and keep this request's.
  const wos = useAsync(
    (signal) => workOrdersApi.list({ assetId: r.assetId, pageSize: 100 }, { signal }),
    [r?.assetId],
    { enabled: !!r },
  );
  const related = (wos.data?.items || []).filter((w) => w.requestId === Number(id));

  if (req.error && !r) {
    return (
      <div className="page">
        <PageHeader title="Request" breadcrumbs={[{ label: 'Maintenance requests', to: '/requests' }, { label: `REQ-${id}` }]} />
        <ErrorState error={req.error} onRetry={req.reload} />
      </div>
    );
  }
  if (!r) return <Loading label="Loading request…" />;

  const canRaise = isAdmin && WORK_ORDER_ELIGIBLE.includes(r.status) && !r.activeWorkOrderId;

  return (
    <div className="page">
      <PageHeader
        breadcrumbs={[{ label: 'Maintenance requests', to: '/requests' }, { label: `REQ-${r.requestId}` }]}
        title={
          <span className="title-with-badge">
            {r.title} <StatusBadge status={r.status} /> <PriorityBadge priority={r.priority} />
          </span>
        }
        subtitle={
          <>
            Reported by {r.createdBy?.fullName} · {formatDateTime(r.createdAt)}
          </>
        }
        actions={
          isAdmin && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setReviewOpen(true)}>
                Review / prioritise
              </button>
              {canRaise && (
                <button type="button" className="btn btn-primary" onClick={() => setWoOpen(true)}>
                  Create work order
                </button>
              )}
            </>
          )
        }
      />

      <div className="detail-grid">
        <section className="card">
          <div className="card-head">
            <h2>Issue</h2>
          </div>
          <p className="prewrap">{r.description}</p>
          <dl className="meta-list">
            <div>
              <dt>Asset</dt>
              <dd>
                <Link to={`/assets/${r.assetId}`} className="mono-link">
                  {r.assetCode}
                </Link>{' '}
                {r.assetName}
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <PriorityBadge priority={r.priority} />
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={r.status} />
              </dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateTime(r.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Work orders</h2>
          </div>
          {wos.loading && !wos.data ? (
            <Loading inline />
          ) : related.length === 0 ? (
            <p className="muted small">
              {r.workOrderCount > 0
                ? 'Work orders exist for this request but are not visible to you.'
                : 'No work order has been raised for this request yet.'}
            </p>
          ) : (
            <ul className="related-list">
              {related.map((w) => (
                <li key={w.workOrderId}>
                  <Link to={`/work-orders/${w.workOrderId}`} className="related-link">
                    <span className="related-title">
                      <span className="mono muted">WO-{w.workOrderId}</span> {w.assignedTechnician?.fullName || 'Unassigned'}
                    </span>
                    <span className="related-meta">
                      <StatusBadge status={w.status} />
                      <span className="muted small">{w.dueDate ? `Due ${formatDate(w.dueDate)}` : formatDate(w.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {isAdmin && !canRaise && !r.activeWorkOrderId && (
            <p className="muted small">Work orders can only be created for Open, In Review or Approved requests.</p>
          )}
        </section>
      </div>

      <RequestReviewDialog
        open={reviewOpen}
        request={r}
        onClose={() => setReviewOpen(false)}
        onUpdated={(updated) => req.setData(updated)}
      />
      <CreateWorkOrderDialog
        open={woOpen}
        request={r}
        onClose={() => setWoOpen(false)}
        onCreated={(detail) => navigate(`/work-orders/${detail.workOrder.workOrderId}`)}
      />
    </div>
  );
}
