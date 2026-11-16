import { Link, useNavigate } from 'react-router-dom';
import { assetsApi, dashboardApi } from '../api/endpoints';
import { statusTone } from '../components/Badges';
import { BarChart, priorityTone, StackedBar } from '../components/Charts';
import { PageHeader } from '../components/Layout';
import { ErrorState, Loading } from '../components/States';
import { Timeline } from '../components/Timeline';
import { useAsync } from '../hooks/useAsync';
import { useQueryParams } from '../hooks/useQueryParams';
import { formatHours } from '../utils/format';

function StatCard({ label, value, sub, tone = 'default', to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={`stat-card tone-${tone}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat-card tone-${tone}`}>{body}</div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams({ category: '', location: '' });
  const facets = useAsync((signal) => assetsApi.facets({ signal }), []);
  const summary = useAsync(
    (signal) => dashboardApi.summary({ category: params.category, location: params.location }, { signal }),
    [params.category, params.location],
  );
  const s = summary.data;
  const filtered = params.category || params.location;
  const scopeQs = new URLSearchParams(
    Object.entries({ category: params.category, location: params.location }).filter(([, v]) => v),
  ).toString();
  const withScope = (path, extra = '') => {
    const qs = [scopeQs, extra].filter(Boolean).join('&');
    return qs ? `${path}?${qs}` : path;
  };

  return (
    <div className="page">
      <PageHeader
        title="Operations dashboard"
        subtitle="Live overview of assets, maintenance requests and work orders."
        actions={
          <div className="filter-inline">
            <select
              className="input"
              aria-label="Filter by category"
              value={params.category}
              onChange={(e) => setParams({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {facets.data?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              className="input"
              aria-label="Filter by location"
              value={params.location}
              onChange={(e) => setParams({ location: e.target.value })}
            >
              <option value="">All locations</option>
              {facets.data?.locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            {filtered && (
              <button type="button" className="btn btn-ghost" onClick={() => setParams({ category: '', location: '' })}>
                Clear
              </button>
            )}
          </div>
        }
      />

      {summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : !s ? (
        <Loading label="Loading dashboard…" />
      ) : (
        <div className={summary.loading ? 'is-refreshing' : ''}>
          <section className="stat-grid" aria-label="Key metrics">
            <StatCard label="Total assets" value={s.totalAssets} sub={`${s.assetsUnderMaintenance} under maintenance · ${s.assetsOutOfService} out of service`} to={withScope('/assets')} />
            <StatCard label="Active assets" value={s.activeAssets} sub="Operational now" tone="green" to={withScope('/assets', 'status=Operational')} />
            <StatCard label="Open requests" value={s.openRequests} sub="Awaiting resolution" tone="blue" to={withScope('/requests')} />
            <StatCard label="Critical open" value={s.criticalOpenRequests} sub="Critical-priority requests" tone={s.criticalOpenRequests ? 'red' : 'default'} to={withScope('/requests', 'priority=Critical')} />
            <StatCard label="In-progress WOs" value={s.inProgressWorkOrders} sub={`${s.openWorkOrders} open / assigned`} tone="amber" to={withScope('/work-orders', 'status=InProgress')} />
            <StatCard label="Completed WOs" value={s.completedWorkOrders} tone="green" to={withScope('/work-orders', 'status=Completed')} />
            <StatCard label="Overdue WOs" value={s.overdueWorkOrders} sub="Past due date, still active" tone={s.overdueWorkOrders ? 'red' : 'default'} />
            <StatCard label="Avg completion" value={formatHours(s.averageCompletionHours)} sub="Created → completed" />
          </section>

          <div className="dash-grid">
            <section className="card">
              <div className="card-head">
                <h2>Work orders by status</h2>
              </div>
              <StackedBar data={s.workOrdersByStatus} label="Work order status mix" />
              <BarChart
                data={s.workOrdersByStatus}
                toneFor={statusTone}
                label="Work orders by status"
                onBarClick={(key) => navigate(withScope('/work-orders', `status=${key}`))}
              />
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Requests by priority</h2>
                <span className="muted small">Open requests</span>
              </div>
              <BarChart
                data={s.requestsByPriority}
                toneFor={priorityTone}
                label="Requests by priority"
                onBarClick={(key) => navigate(withScope('/requests', `priority=${key}`))}
              />
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Assets by category</h2>
              </div>
              <BarChart
                data={s.assetsByCategory}
                toneFor={() => 'slate'}
                label="Assets by category"
                onBarClick={(key) => navigate(`/assets?category=${encodeURIComponent(key)}`)}
              />
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Technician workload</h2>
              </div>
              {s.technicianWorkload.length === 0 ? (
                <p className="muted small">No active technicians.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th scope="col">Technician</th>
                        <th scope="col" className="ta-right">Assigned</th>
                        <th scope="col" className="ta-right">In progress</th>
                        <th scope="col" className="ta-right">Done (30d)</th>
                        <th scope="col">Load</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.technicianWorkload.map((t) => {
                        const load = t.assigned + t.inProgress;
                        return (
                          <tr key={t.technician.id}>
                            <td>
                              <Link to={`/work-orders?technicianId=${t.technician.id}`}>{t.technician.fullName}</Link>
                            </td>
                            <td className="ta-right">{t.assigned}</td>
                            <td className="ta-right">{t.inProgress}</td>
                            <td className="ta-right">{t.completedLast30Days}</td>
                            <td>
                              <span className="load-meter" title={`${load} active`}>
                                {Array.from({ length: 5 }, (_, i) => (
                                  <i key={i} className={i < load ? (load >= 4 ? 'on hot' : 'on') : ''} />
                                ))}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card span-2">
              <div className="card-head">
                <h2>Recent activity</h2>
              </div>
              <Timeline entries={s.recentActivity} showAsset compact />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
