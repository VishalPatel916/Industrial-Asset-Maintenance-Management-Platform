import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assetsApi } from '../api/endpoints';
import { StatusBadge } from '../components/Badges';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { ShowFor } from '../components/RequireRole';
import { EmptyState } from '../components/States';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useQueryParams } from '../hooks/useQueryParams';
import { ASSET_STATUSES, ROLES } from '../utils/constants';
import { formatDate, humanize } from '../utils/format';

const DEFAULTS = {
  search: '',
  status: '',
  category: '',
  location: '',
  includeArchived: false,
  sortBy: 'code',
  desc: false,
  page: 1,
  pageSize: 20,
};

export default function AssetListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams(DEFAULTS);
  const [searchText, setSearchText] = useState(params.search);
  const debouncedSearch = useDebounce(searchText, 350);

  useEffect(() => {
    if (debouncedSearch.trim() !== params.search) setParams({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const facets = useAsync((signal) => assetsApi.facets({ signal }), []);
  const list = useAsync((signal) => assetsApi.list(params, { signal }), [JSON.stringify(params)]);

  const filtersActive = params.search || params.status || params.category || params.location || params.includeArchived;

  const columns = [
    {
      key: 'assetCode',
      header: 'Code',
      sortKey: 'code',
      render: (a) => (
        <Link to={`/assets/${a.assetId}`} className="mono-link">
          {a.assetCode}
        </Link>
      ),
    },
    { key: 'name', header: 'Name', sortKey: 'name', render: (a) => <span className="cell-strong">{a.name}</span> },
    { key: 'category', header: 'Category', sortKey: 'category' },
    { key: 'location', header: 'Location', sortKey: 'location' },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (a) => (
        <span className="badge-stack">
          <StatusBadge status={a.status} />
          {a.isArchived && <StatusBadge status="Archived" />}
        </span>
      ),
    },
    {
      key: 'openRequestCount',
      header: 'Open requests',
      align: 'right',
      render: (a) => (a.openRequestCount ? <span className="count-pill">{a.openRequestCount}</span> : <span className="muted">0</span>),
    },
    { key: 'createdAt', header: 'Added', sortKey: 'createdAt', render: (a) => formatDate(a.createdAt) },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Assets"
        subtitle="Equipment registry across all plants and lines."
        actions={
          <ShowFor roles={[ROLES.Admin]}>
            <Link to="/assets/new" className="btn btn-primary">
              + New asset
            </Link>
          </ShowFor>
        }
      />

      <div className="card filters-card">
        <div className="filters">
          <div className="filter-search">
            <input
              type="search"
              className="input"
              placeholder="Search code, name or description…"
              aria-label="Search assets"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select className="input" aria-label="Status" value={params.status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
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
          <label className="checkbox">
            <input type="checkbox" checked={params.includeArchived} onChange={(e) => setParams({ includeArchived: e.target.checked })} />
            Include archived
          </label>
          {filtersActive && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchText('');
                setParams({ search: '', status: '', category: '', location: '', includeArchived: false });
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="card table-card">
        <DataTable
          caption="Assets"
          columns={columns}
          rows={list.data?.items}
          rowKey={(a) => a.assetId}
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
          onRowClick={(a) => navigate(`/assets/${a.assetId}`)}
          empty={
            <EmptyState
              title={filtersActive ? 'No assets match your filters' : 'No assets yet'}
              message={filtersActive ? 'Try a different search or clear the filters.' : 'Register your first piece of equipment to get started.'}
              action={
                <ShowFor roles={[ROLES.Admin]}>
                  {!filtersActive && (
                    <Link to="/assets/new" className="btn btn-primary">
                      + New asset
                    </Link>
                  )}
                </ShowFor>
              }
            />
          }
        />
      </div>
    </div>
  );
}
