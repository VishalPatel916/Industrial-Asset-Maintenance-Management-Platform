import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assetsApi, requestsApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { CreateWorkOrderDialog, RequestReviewDialog } from '../components/RequestDialogs';
import { EmptyState } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useQueryParams } from '../hooks/useQueryParams';
import { PRIORITIES, REQUEST_STATUSES, WORK_ORDER_ELIGIBLE } from '../utils/constants';
import { formatDateTime, humanize } from '../utils/format';

const DEFAULTS = {
  search: '',
  status: '',
  priority: '',
  assetId: '',
  category: '',
  location: '',
  sortBy: 'createdAt',
  desc: true,
  page: 1,
  pageSize: 20,
};

export default function RequestListPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams(DEFAULTS);
  const [searchText, setSearchText] = useState(params.search);
  const debouncedSearch = useDebounce(searchText, 350);
  const [reviewing, setReviewing] = useState(null);
  const [raising, setRaising] = useState(null);

  useEffect(() => {
    if (debouncedSearch.trim() !== params.search) setParams({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const list = useAsync((signal) => requestsApi.list(params, { signal }), [JSON.stringify(params)]);
  const facets = useAsync((signal) => assetsApi.facets({ signal }), []);
  const scopedAsset = useAsync((signal) => assetsApi.get(params.assetId, { signal }), [params.assetId], { enabled: !!params.assetId });

  const filtersActive = params.search || params.status || params.priority || params.assetId || params.category || params.location;

  const columns = [
    {
      key: 'requestId',
      header: 'ID',
      render: (r) => (
        <Link to={`/requests/${r.requestId}`} className="mono-link">
          REQ-{r.requestId}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Issue',
      render: (r) => (
        <div className="cell-stack">
          <Link to={`/requests/${r.requestId}`} className="cell-strong plain-link">
            {r.title}
          </Link>
          <span className="muted small">
            <Link to={`/assets/${r.assetId}`} className="mono-link">
              {r.assetCode}
            </Link>{' '}
            · {r.assetName}
          </span>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', sortKey: 'priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'createdBy', header: 'Reported by', render: (r) => r.createdBy?.fullName },
    { key: 'createdAt', header: 'Reported', sortKey: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
    {
      key: 'workOrder',
      header: 'Work order',
      render: (r) =>
        r.activeWorkOrderId ? (
          <Link to={`/work-orders/${r.activeWorkOrderId}`} className="chip-link">
            WO-{r.activeWorkOrderId}
          </Link>
        ) : r.workOrderCount ? (
          <span className="muted small">{r.workOrderCount} closed</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReviewing(r)}>
            Review
          </button>
          {WORK_ORDER_ELIGIBLE.includes(r.status) && !r.activeWorkOrderId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRaising(r)}>
              Create WO
            </button>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="page">
      <PageHeader
        title="Maintenance requests"
        subtitle="Issues reported against assets, from intake through resolution."
        actions={
          <Link to={params.assetId ? `/requests/new?assetId=${params.assetId}` : '/requests/new'} className="btn btn-primary">
            + Report issue
          </Link>
        }
      />

      <div className="card filters-card">
        <div className="filters">
          <div className="filter-search">
            <input
              type="search"
              className="input"
              placeholder="Search requests…"
              aria-label="Search requests"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select className="input" aria-label="Status" value={params.status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Priority" value={params.priority} onChange={(e) => setParams({ priority: e.target.value })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select className="input" aria-label="Category" value={params.category} onChange={(e) => setParams({ category: e.target.value })}>
            <option value="">All categories</option>
            {facets.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="input" aria-label="Location" value={params.location} onChange={(e) => setParams({ location: e.target.value })}>
            <option value="">All locations</option>
            {facets.data?.locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchText('');
                setParams({ search: '', status: '', priority: '', assetId: '', category: '', location: '' });
              }}
            >
              Reset
            </button>
          )}
        </div>
        {params.assetId && (
          <div className="filter-chips">
            <span className="chip">
              Asset: {scopedAsset.data ? `${scopedAsset.data.assetCode} · ${scopedAsset.data.name}` : `#${params.assetId}`}
              <button type="button" aria-label="Remove asset filter" onClick={() => setParams({ assetId: '' })}>
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      <div className="card table-card">
        <DataTable
          caption="Maintenance requests"
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.requestId}
          sortBy={params.sortBy}
          desc={params.desc}
          onSort={(sortBy, desc) => setParams({ sortBy, desc })}
          page={list.data?.page || params.page}
          pageSize={list.data?.pageSize || params.pageSize}
          totalCount={list.data?.totalCount}
          totalPages={list.data?.totalPages}
          onPageChange={(page) => setParams({ page })}
          onPageSizeChange={(pageSize) => setParams({ pageSize })}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(r) => navigate(`/requests/${r.requestId}`)}
          empty={
            <EmptyState
              title={filtersActive ? 'No requests match your filters' : 'No maintenance requests'}
              message={filtersActive ? 'Try clearing some filters.' : 'When someone reports an issue it will appear here.'}
              action={
                <Link to="/requests/new" className="btn btn-primary">
                  Report issue
                </Link>
              }
            />
          }
        />
      </div>

      <RequestReviewDialog open={!!reviewing} request={reviewing} onClose={() => setReviewing(null)} onUpdated={list.reload} />
      <CreateWorkOrderDialog
        open={!!raising}
        request={raising}
        onClose={() => setRaising(null)}
        onCreated={(detail) => navigate(`/work-orders/${detail.workOrder.workOrderId}`)}
      />
    </div>
  );
}
