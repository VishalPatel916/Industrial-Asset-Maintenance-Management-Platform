import { Link } from 'react-router-dom';
import { workOrdersApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { PageHeader } from '../components/Layout';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatRelative, isOverdue } from '../utils/format';

/** Landing page for technicians (who cannot see the dashboard): their active work. */
export default function MyWorkPage() {
  const { user } = useAuth();
  const active = useAsync(
    (signal) => workOrdersApi.list({ activeOnly: true, pageSize: 100, sortBy: 'dueDate', desc: false }, { signal }),
    [],
  );
  const done = useAsync(
    (signal) => workOrdersApi.list({ status: 'Completed', pageSize: 5, sortBy: 'createdAt', desc: true }, { signal }),
    [],
  );

  const items = active.data?.items || [];
  const assigned = items.filter((w) => w.status === 'Assigned' || w.status === 'Open');
  const inProgress = items.filter((w) => w.status === 'InProgress');
  const overdue = items.filter(isOverdue);

  return (
    <div className="page">
      <PageHeader
        title={`Hello, ${user?.fullName?.split(' ')[0] || 'there'}`}
        subtitle="Your assigned work orders, most urgent first."
        actions={
          <>
            <Link to="/work-orders?view=board" className="btn btn-secondary">
              Board view
            </Link>
            <Link to="/requests/new" className="btn btn-primary">
              Report issue
            </Link>
          </>
        }
      />

      <section className="stat-grid small" aria-label="My work summary">
        <div className="stat-card tone-blue">
          <span className="stat-label">To start</span>
          <span className="stat-value">{active.data ? assigned.length : '–'}</span>
        </div>
        <div className="stat-card tone-amber">
          <span className="stat-label">In progress</span>
          <span className="stat-value">{active.data ? inProgress.length : '–'}</span>
        </div>
        <div className={`stat-card ${overdue.length ? 'tone-red' : ''}`}>
          <span className="stat-label">Overdue</span>
          <span className="stat-value">{active.data ? overdue.length : '–'}</span>
        </div>
        <div className="stat-card tone-green">
          <span className="stat-label">Completed (total)</span>
          <span className="stat-value">{done.data ? done.data.totalCount : '–'}</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Active work orders</h2>
          <Link to="/work-orders?activeOnly=true" className="small">
            View all
          </Link>
        </div>
        {active.error && !active.data ? (
          <ErrorState error={active.error} onRetry={active.reload} />
        ) : !active.data ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="You're all caught up" message="No active work orders are assigned to you." icon="✓" />
        ) : (
          <ul className="work-list">
            {items.map((w) => (
              <li key={w.workOrderId} className={`work-item ${isOverdue(w) ? 'overdue' : ''}`}>
                <Link to={`/work-orders/${w.workOrderId}`} className="work-link">
                  <div className="work-main">
                    <span className="mono muted">WO-{w.workOrderId}</span>
                    <strong>{w.requestTitle}</strong>
                    <span className="muted small">
                      {w.assetCode} · {w.assetName}
                    </span>
                  </div>
                  <div className="work-side">
                    <PriorityBadge priority={w.priority} />
                    <StatusBadge status={w.status} />
                    <span className={`small ${isOverdue(w) ? 'text-danger' : 'muted'}`}>
                      {w.dueDate ? `Due ${formatDate(w.dueDate)}` : 'No due date'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Recently completed</h2>
        </div>
        {done.data?.items?.length ? (
          <ul className="simple-list">
            {done.data.items.map((w) => (
              <li key={w.workOrderId}>
                <Link to={`/work-orders/${w.workOrderId}`}>
                  WO-{w.workOrderId} · {w.requestTitle}
                </Link>
                <span className="muted small">{formatRelative(w.completionDate)}</span>
              </li>
            ))}
          </ul>
        ) : done.loading ? (
          <Loading inline />
        ) : (
          <p className="muted small">Nothing completed yet.</p>
        )}
      </section>
    </div>
  );
}
