import { EmptyState, ErrorState, Loading } from './States';

/**
 * Server-driven table.
 * columns: [{ key, header, render?(row), sortKey?, align?, className?, width? }]
 * Sorting: clicking a sortable header calls onSort(sortKey, desc).
 * Pagination: pass page/pageSize/totalCount/totalPages + onPageChange (and optionally onPageSizeChange).
 */
export function DataTable({
  columns,
  rows,
  rowKey,
  sortBy,
  desc,
  onSort,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  caption,
  pageSizeOptions = [10, 20, 50, 100],
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;

  if (error && !hasRows) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !hasRows) return <Loading label="Loading data…" />;
  if (!hasRows) return empty || <EmptyState title="No results" message="Try adjusting your filters." />;

  const handleSort = (col) => {
    if (!col.sortKey || !onSort) return;
    if (sortBy === col.sortKey) onSort(col.sortKey, !desc);
    else onSort(col.sortKey, false);
  };

  return (
    <div className={`table-wrap ${loading ? 'is-refreshing' : ''}`}>
      {error && (
        <div className="alert alert-error table-alert" role="alert">
          {error.message}{' '}
          {onRetry && (
            <button type="button" className="link-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col) => {
                const active = col.sortKey && sortBy === col.sortKey;
                const ariaSort = active ? (desc ? 'descending' : 'ascending') : col.sortKey ? 'none' : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    style={col.width ? { width: col.width } : undefined}
                    className={`${col.align === 'right' ? 'ta-right' : ''} ${col.className || ''}`}
                  >
                    {col.sortKey && onSort ? (
                      <button type="button" className={`sort-btn ${active ? 'active' : ''}`} onClick={() => handleSort(col)}>
                        {col.header}
                        <span className="sort-ind" aria-hidden="true">
                          {active ? (desc ? '▼' : '▲') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'clickable' : undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        if (e.target.closest('a,button,select,input,label')) return;
                        onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td key={col.key} className={`${col.align === 'right' ? 'ta-right' : ''} ${col.className || ''}`} data-label={typeof col.header === 'string' ? col.header : undefined}>
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPageChange && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, totalCount, totalPages, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }) {
  if (!totalCount) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const pages = pageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="page-info">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{totalCount}</strong>
      </span>
      <div className="page-controls">
        {onPageSizeChange && (
          <label className="page-size">
            <span>Rows</span>
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="input input-sm">
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          ‹ Prev
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap${i}`} className="page-gap">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`btn btn-sm page-num ${p === page ? 'active' : 'btn-ghost'}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          Next ›
        </button>
      </div>
    </nav>
  );
}

function pageWindow(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, page, page - 1, page + 1]);
  const list = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}
