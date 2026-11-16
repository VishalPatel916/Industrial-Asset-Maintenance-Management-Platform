/**
 * Parses an API timestamp. The API stores UTC; some values arrive without a zone
 * designator (e.g. "2026-11-14T20:29:06.48"), which JS would treat as local time,
 * so those are interpreted as UTC.
 */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d); // date-only values (e.g. purchaseDate) are calendar dates
  }
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value) {
  const d = parseDate(value);
  return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function formatDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
}

export function formatRelative(value) {
  const d = parseDate(value);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ];
  for (const [limit, unit, size] of steps) {
    if (abs < limit) return rtf.format(-Math.round(diff / size), unit);
  }
  return formatDate(value);
}

/** "InProgress" → "In Progress", "UnderMaintenance" → "Under Maintenance" */
export function humanize(value) {
  if (!value) return '';
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function isOverdue(workOrder) {
  if (!workOrder?.dueDate) return false;
  if (workOrder.status === 'Completed' || workOrder.status === 'Cancelled') return false;
  const due = parseDate(workOrder.dueDate);
  return !!due && due.getTime() < Date.now();
}

/** Converts a <input type="date"> value to an ISO timestamp at the end of that local day. */
export function dateInputToIso(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 0).toISOString();
}

export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}
