import { humanize } from '../utils/format';

/** Colour tone per status value (asset, request and work-order statuses share one palette). */
const STATUS_TONES = {
  // Asset
  Operational: 'green',
  UnderMaintenance: 'amber',
  OutOfService: 'red',
  Decommissioned: 'gray',
  Archived: 'gray',
  // Request
  Open: 'blue',
  InReview: 'purple',
  Approved: 'teal',
  InProgress: 'amber',
  Resolved: 'green',
  Rejected: 'gray',
  // Work order
  Assigned: 'indigo',
  Completed: 'green',
  Cancelled: 'gray',
  // Users
  Active: 'green',
  Inactive: 'gray',
};

export function statusTone(status) {
  return STATUS_TONES[status] || 'gray';
}

export function StatusBadge({ status, className = '' }) {
  if (!status) return null;
  const tone = statusTone(status);
  return (
    <span className={`badge badge-${tone} ${className}`} data-tone={tone} title={humanize(status)}>
      <span className="badge-dot" aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}

const PRIORITY_TONES = { Low: 'p-low', Medium: 'p-medium', High: 'p-high', Critical: 'p-critical' };
const PRIORITY_BARS = { Low: 1, Medium: 2, High: 3, Critical: 4 };

export function PriorityBadge({ priority }) {
  if (!priority) return null;
  const level = PRIORITY_BARS[priority] || 0;
  return (
    <span className={`badge priority ${PRIORITY_TONES[priority] || ''}`} data-tone={PRIORITY_TONES[priority]} title={`${priority} priority`}>
      <span className="priority-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= level ? 'on' : ''} />
        ))}
      </span>
      {priority}
    </span>
  );
}

export function RoleBadge({ role }) {
  const tone = role === 'Admin' ? 'indigo' : role === 'Technician' ? 'teal' : 'gray';
  return <span className={`badge badge-${tone} badge-plain`}>{role}</span>;
}
