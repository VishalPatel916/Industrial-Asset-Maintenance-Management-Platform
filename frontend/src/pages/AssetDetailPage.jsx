import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assetsApi, requestsApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { Pagination } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { ConfirmDialog } from '../components/Modal';
import { ShowFor } from '../components/RequireRole';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { Timeline } from '../components/Timeline';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { ROLES } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';

export default function AssetDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [historyPage, setHistoryPage] = useState(1);
  const [reqPage, setReqPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState(null);

  const asset = useAsync((signal) => assetsApi.get(id, { signal }), [id]);
  const requests = useAsync(
    (signal) => requestsApi.list({ assetId: id, page: reqPage, pageSize: 5, sortBy: 'createdAt', desc: true }, { signal }),
    [id, reqPage],
  );
  const history = useAsync((signal) => assetsApi.history(id, { page: historyPage, pageSize: 10 }, { signal }), [id, historyPage]);

  if (asset.error && !asset.data) {
    return (
      <div className="page">
        <PageHeader title="Asset" breadcrumbs={[{ label: 'Assets', to: '/assets' }, { label: `#${id}` }]} />
        <ErrorState error={asset.error} onRetry={asset.reload} />
      </div>
    );
  }
  if (!asset.data) return <Loading label="Loading asset…" />;
  const a = asset.data;

  const archive = async () => {
    setArchiving(true);
    setArchiveError(null);
    try {
      await assetsApi.archive(a.assetId);
      toast.success(`Asset ${a.assetCode} archived.`);
      setConfirmOpen(false);
      asset.reload();
      history.reload();
    } catch (err) {
      setArchiveError(err.message);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        breadcrumbs={[{ label: 'Assets', to: '/assets' }, { label: a.assetCode }]}
        title={
          <span className="title-with-badge">
            {a.name} <StatusBadge status={a.status} />
            {a.isArchived && <StatusBadge status="Archived" />}
          </span>
        }
        subtitle={
          <>
            <span className="mono">{a.assetCode}</span> · {a.category} · {a.location}
          </>
        }
        actions={
          <>
            {!a.isArchived && (
              <Link to={`/requests/new?assetId=${a.assetId}`} className="btn btn-accent">
                Report issue
              </Link>
            )}
            <ShowFor roles={[ROLES.Admin]}>
              {!a.isArchived && (
                <>
                  <Link to={`/assets/${a.assetId}/edit`} className="btn btn-secondary">
                    Edit
                  </Link>
                  <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmOpen(true)}>
                    Archive
                  </button>
                </>
              )}
            </ShowFor>
          </>
        }
      />

      {a.isArchived && <div className="alert alert-info">This asset is archived. Its history is retained but it no longer accepts new requests.</div>}

      <div className="detail-grid">
        <section className="card">
          <div className="card-head">
            <h2>Details</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Asset code</dt>
              <dd className="mono">{a.assetCode}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={a.status} />
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{a.category}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{a.location}</dd>
            </div>
            <div>
              <dt>Purchase date</dt>
              <dd>{formatDate(a.purchaseDate)}</dd>
            </div>
            <div>
              <dt>Open requests</dt>
              <dd>{a.openRequestCount}</dd>
            </div>
            <div>
              <dt>Registered</dt>
              <dd>{formatDateTime(a.createdAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateTime(a.updatedAt)}</dd>
            </div>
          </dl>
          {a.description && (
            <>
              <h3 className="sub-heading">Description</h3>
              <p className="prewrap">{a.description}</p>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Maintenance requests</h2>
            <Link to={`/requests?assetId=${a.assetId}`} className="small">
              View all
            </Link>
          </div>
          {requests.error && !requests.data ? (
            <ErrorState error={requests.error} onRetry={requests.reload} />
          ) : !requests.data ? (
            <Loading inline />
          ) : requests.data.items.length === 0 ? (
            <EmptyState title="No requests" message="No issues have been reported for this asset." icon="✓" />
          ) : (
            <>
              <ul className="related-list">
                {requests.data.items.map((r) => (
                  <li key={r.requestId}>
                    <Link to={`/requests/${r.requestId}`} className="related-link">
                      <span className="related-title">
                        <span className="mono muted">REQ-{r.requestId}</span> {r.title}
                      </span>
                      <span className="related-meta">
                        <PriorityBadge priority={r.priority} />
                        <StatusBadge status={r.status} />
                        <span className="muted small">{formatDate(r.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={requests.data.page}
                pageSize={requests.data.pageSize}
                totalCount={requests.data.totalCount}
                totalPages={requests.data.totalPages}
                onPageChange={setReqPage}
              />
            </>
          )}
        </section>

        <section className="card span-2">
          <div className="card-head">
            <h2>Maintenance timeline</h2>
          </div>
          {history.error && !history.data ? (
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : !history.data ? (
            <Loading inline />
          ) : (
            <div className={history.loading ? 'is-refreshing' : ''}>
              <Timeline entries={history.data.items} />
              <Pagination
                page={history.data.page}
                pageSize={history.data.pageSize}
                totalCount={history.data.totalCount}
                totalPages={history.data.totalPages}
                onPageChange={setHistoryPage}
              />
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Archive ${a.assetCode}?`}
        message={
          <p>
            Archived assets are hidden from lists and cannot receive new maintenance requests. Their history is kept. This
            action cannot be undone from the UI.
          </p>
        }
        confirmLabel="Archive asset"
        danger
        busy={archiving}
        error={archiveError}
        onConfirm={archive}
        onCancel={() => {
          setConfirmOpen(false);
          setArchiveError(null);
        }}
      />
    </div>
  );
}
