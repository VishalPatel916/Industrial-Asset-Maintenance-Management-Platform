import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usersApi, workOrdersApi } from '../api/endpoints';
import { PriorityBadge, StatusBadge, statusTone } from '../components/Badges';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useQueryParams } from '../hooks/useQueryParams';
import { PRIORITIES, WORK_ORDER_STATUSES } from '../utils/constants';
import { formatDate, formatDateTime, humanize, isOverdue } from '../utils/format';

const DEFAULTS = {
  view: 'list',
  search: '',
  status: '',
  priority: '',
  technicianId: '',
  assetId: '',
  category: '',
  location: '',
  activeOnly: false,
  sortBy: 'createdAt',
  desc: true,
  page: 1,
  pageSize: 20,
};

const BOARD_LIMIT = 100;

export default function WorkOrderListPage() {
  const { isAdmin, isTechnician } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams(DEFAULTS);
  const [searchText, setSearchText] = useState(params.search);
  const debouncedSearch = useDebounce(searchText, 350);
  const isBoard = params.view === 'board';

  useEffect(() => {
    if (debouncedSearch.trim() !== params.search) setParams({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { view, ...filterParams } = params;
  const query = isBoard
    ? { ...filterParams, status: '', page: 1, pageSize: BOARD_LIMIT, sortBy: 'priority', desc: true }
    : filterParams;
  const list = useAsync((signal) => workOrdersApi.list(query, { signal }), [JSON.stringify(query)]);
  const technicians = useAsync((signal) => usersApi.technicians({ signal }), [], { enabled: isAdmin });

  const filtersActive =
    params.search || params.status || params.priority || params.technicianId || params.activeOnly || params.assetId || params.category || params.location;

  const columns = [
    {
      key: 'workOrderId',
      header: 'WO',
      render: (w) => (
        <Link to={`/work-orders/${w.workOrderId}`} className="mono-link">
          WO-{w.workOrderId}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Work',
      render: (w) => (
        <div className="cell-stack">
          <span className="cell-strong">{w.requestTitle}</span>
          <span className="muted small">
            <Link to={`/assets/${w.assetId}`} className="mono-link">
              {w.assetCode}
            </Link>{' '}
            · {w.assetName}
          </span>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', sortKey: 'priority', render: (w) => <PriorityBadge priority={w.priority} /> },
    { key: 'status', header: 'Status', sortKey: 'status', render: (w) => <StatusBadge status={w.status} /> },
    {
      key: 'tech',
      header: 'Technician',
      render: (w) => w.assignedTechnician?.fullName || <span className="muted">Unassigned</span>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortKey: 'dueDate',
      render: (w) =>
        w.dueDate ? (
          <span className={isOverdue(w) ? 'text-danger strong' : ''} title={formatDateTime(w.dueDate)}>
            {formatDate(w.dueDate)}
            {isOverdue(w) && ' · overdue'}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (w) => formatDate(w.createdAt) },
  ];

  return (
    <div className="page">
      <PageHeader
        title={isTechnician && !isAdmin ? 'My work orders' : 'Work orders'}
        subtitle={isTechnician && !isAdmin ? 'Work orders assigned to you.' : 'Planned and in-flight maintenance work.'}
        actions={
          <div className="view-toggle" role="group" aria-label="View">
            <button type="button" className={`btn btn-sm ${!isBoard ? 'active' : 'btn-ghost'}`} aria-pressed={!isBoard} onClick={() => setParams({ view: 'list', page: 1 })}>
              ☰ List
            </button>
            <button type="button" className={`btn btn-sm ${isBoard ? 'active' : 'btn-ghost'}`} aria-pressed={isBoard} onClick={() => setParams({ view: 'board', page: 1 })}>
              ▦ Board
            </button>
          </div>
        }
      />

      <div className="card filters-card">
        <div className="filters">
          <div className="filter-search">
            <input
              type="search"
              className="input"
              placeholder="Search work orders…"
              aria-label="Search work orders"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          {!isBoard && (
            <select className="input" aria-label="Status" value={params.status} onChange={(e) => setParams({ status: e.target.value })}>
              <option value="">All statuses</option>
              {WORK_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          )}
          <select className="input" aria-label="Priority" value={params.priority} onChange={(e) => setParams({ priority: e.target.value })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          {isAdmin && (
            <select className="input" aria-label="Technician" value={params.technicianId} onChange={(e) => setParams({ technicianId: e.target.value })}>
              <option value="">All technicians</option>
              <option value="unassigned">Unassigned</option>
              {technicians.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={params.activeOnly} onChange={(e) => setParams({ activeOnly: e.target.checked })} />
            Active only
          </label>
          {filtersActive && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchText('');
                setParams({ search: '', status: '', priority: '', technicianId: '', activeOnly: false, assetId: '', category: '', location: '' });
              }}
            >
              Reset
            </button>
          )}
        </div>
        {(params.assetId || params.category || params.location) && (
          <div className="filter-chips">
            {params.assetId && (
              <span className="chip">
                Asset #{params.assetId}
                <button type="button" aria-label="Remove asset filter" onClick={() => setParams({ assetId: '' })}>
                  ×
                </button>
              </span>
            )}
            {params.category && (
              <span className="chip">
                Category: {params.category}
                <button type="button" aria-label="Remove category filter" onClick={() => setParams({ category: '' })}>
                  ×
                </button>
              </span>
            )}
            {params.location && (
              <span className="chip">
                Location: {params.location}
                <button type="button" aria-label="Remove location filter" onClick={() => setParams({ location: '' })}>
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {isBoard ? (
        <KanbanBoard list={list} activeOnly={params.activeOnly} />
      ) : (
        <div className="card table-card">
          <DataTable
            caption="Work orders"
            columns={columns}
            rows={list.data?.items}
            rowKey={(w) => w.workOrderId}
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
            onRowClick={(w) => navigate(`/work-orders/${w.workOrderId}`)}
            empty={
              <EmptyState
                title={filtersActive ? 'No work orders match your filters' : 'No work orders'}
                message={
                  isTechnician && !isAdmin
                    ? 'Nothing is assigned to you right now.'
                    : 'Work orders are created from maintenance requests.'
                }
              />
            }
          />
        </div>
      )}
    </div>
  );
}

function KanbanBoard({ list, activeOnly }) {
  if (list.error && !list.data) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading label="Loading board…" />;
  const items = list.data.items;
  const columns = activeOnly ? WORK_ORDER_STATUSES.filter((s) => s !== 'Completed' && s !== 'Cancelled') : WORK_ORDER_STATUSES;

  return (
    <>
      {list.data.totalCount > items.length && (
        <div className="alert alert-info">
          Showing the {items.length} highest-priority of {list.data.totalCount} work orders. Narrow the filters or use the list view to see all.
        </div>
      )}
      <div className={`kanban ${list.loading ? 'is-refreshing' : ''}`} style={{ '--kanban-cols': columns.length }}>
        {columns.map((status) => {
          const cards = items.filter((w) => w.status === status);
          return (
            <section key={status} className={`kanban-col col-${statusTone(status)}`} aria-label={`${humanize(status)} column`}>
              <header className="kanban-col-head">
                <StatusBadge status={status} />
                <span className="count-pill">{cards.length}</span>
              </header>
              <div className="kanban-cards">
                {cards.length === 0 ? (
                  <p className="kanban-empty">No work orders</p>
                ) : (
                  cards.map((w) => (
                    <Link key={w.workOrderId} to={`/work-orders/${w.workOrderId}`} className={`kanban-card ${isOverdue(w) ? 'overdue' : ''}`}>
                      <div className="kanban-card-top">
                        <span className="mono muted small">WO-{w.workOrderId}</span>
                        <PriorityBadge priority={w.priority} />
                      </div>
                      <strong className="kanban-title">{w.requestTitle}</strong>
                      <span className="muted small">
                        {w.assetCode} · {w.assetName}
                      </span>
                      <div className="kanban-card-foot">
                        <span className="small">{w.assignedTechnician?.fullName || <em className="muted">Unassigned</em>}</span>
                        {w.dueDate && (
                          <span className={`small ${isOverdue(w) ? 'text-danger strong' : 'muted'}`}>
                            {isOverdue(w) ? 'Overdue · ' : 'Due '}
                            {formatDate(w.dueDate)}
                          </span>
                        )}
                        {w.noteCount > 0 && (
                          <span className="small muted" title={`${w.noteCount} notes`}>
                            ✎ {w.noteCount}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      {items.length === 0 && <EmptyState title="No work orders" message="Nothing matches the current filters." />}
    </>
  );
}
