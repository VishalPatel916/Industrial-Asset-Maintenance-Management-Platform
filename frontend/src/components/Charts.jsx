import { humanize } from '../utils/format';
import { statusTone } from './Badges';

/**
 * Horizontal bar chart in plain HTML/CSS. data: [{ key, count }].
 * `toneFor(key)` returns a CSS tone suffix (bar-<tone>).
 */
export function BarChart({ data, toneFor, label, onBarClick, emptyText = 'No data' }) {
  const items = data || [];
  const max = Math.max(1, ...items.map((d) => d.count));
  const total = items.reduce((s, d) => s + d.count, 0);
  if (!items.length || total === 0) return <p className="muted small">{emptyText}</p>;
  return (
    <ul className="bar-chart" aria-label={label}>
      {items.map((d) => {
        const pct = (d.count / max) * 100;
        const share = total ? Math.round((d.count / total) * 100) : 0;
        const tone = toneFor ? toneFor(d.key) : 'blue';
        const content = (
          <>
            <span className="bar-label">{humanize(d.key)}</span>
            <span className="bar-track">
              <span className={`bar-fill bar-${tone}`} style={{ width: `${Math.max(pct, d.count ? 2 : 0)}%` }} />
            </span>
            <span className="bar-value">
              {d.count}
              <span className="bar-share"> · {share}%</span>
            </span>
          </>
        );
        return (
          <li key={d.key} className="bar-row">
            {onBarClick ? (
              <button type="button" className="bar-btn" onClick={() => onBarClick(d.key)} aria-label={`${humanize(d.key)}: ${d.count}`}>
                {content}
              </button>
            ) : (
              <div className="bar-btn static" aria-label={`${humanize(d.key)}: ${d.count}`}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Single stacked bar (e.g. work-order status mix) with legend. */
export function StackedBar({ data, toneFor = statusTone, label }) {
  const total = (data || []).reduce((s, d) => s + d.count, 0);
  if (!total) return <p className="muted small">No data</p>;
  return (
    <div className="stacked" aria-label={label}>
      <div className="stacked-bar" role="img" aria-label={data.map((d) => `${humanize(d.key)} ${d.count}`).join(', ')}>
        {data
          .filter((d) => d.count > 0)
          .map((d) => (
            <span key={d.key} className={`stacked-seg bar-${toneFor(d.key)}`} style={{ flexGrow: d.count }} title={`${humanize(d.key)}: ${d.count}`} />
          ))}
      </div>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.key}>
            <span className={`legend-swatch bar-${toneFor(d.key)}`} aria-hidden="true" />
            {humanize(d.key)} <strong>{d.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const priorityTone = (p) => ({ Low: 'gray', Medium: 'blue', High: 'amber', Critical: 'red' })[p] || 'blue';
