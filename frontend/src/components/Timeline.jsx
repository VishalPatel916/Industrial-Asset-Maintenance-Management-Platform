import { Link } from 'react-router-dom';
import { HISTORY_ACTION_LABELS } from '../utils/constants';
import { formatDateTime, formatRelative, humanize } from '../utils/format';

const ACTION_TONE = {
  AssetCreated: 'blue',
  AssetUpdated: 'gray',
  AssetArchived: 'gray',
  RequestCreated: 'red',
  RequestStatusChanged: 'purple',
  RequestPriorityChanged: 'amber',
  WorkOrderCreated: 'indigo',
  WorkOrderAssigned: 'teal',
  WorkOrderStatusChanged: 'green',
  WorkOrderNoteAdded: 'gray',
};

/** Renders HistoryEntryDto[] as a vertical timeline. */
export function Timeline({ entries, showAsset = false, compact = false }) {
  if (!entries?.length) return <p className="muted small">No activity recorded yet.</p>;
  return (
    <ol className={`timeline ${compact ? 'compact' : ''}`}>
      {entries.map((h) => (
        <li key={h.historyId} className="timeline-item">
          <span className={`timeline-dot dot-${ACTION_TONE[h.action] || 'gray'}`} aria-hidden="true" />
          <div className="timeline-body">
            <div className="timeline-head">
              <strong>{HISTORY_ACTION_LABELS[h.action] || humanize(h.action)}</strong>
              {showAsset && (
                <Link to={`/assets/${h.assetId}`} className="mono-link">
                  {h.assetCode}
                </Link>
              )}
              {h.workOrderId && (
                <Link to={`/work-orders/${h.workOrderId}`} className="chip-link">
                  WO-{h.workOrderId}
                </Link>
              )}
              {!h.workOrderId && h.requestId && (
                <Link to={`/requests/${h.requestId}`} className="chip-link">
                  REQ-{h.requestId}
                </Link>
              )}
            </div>
            {h.notes && <p className="timeline-notes">{h.notes}</p>}
            <div className="timeline-meta">
              <span>{h.performedBy?.fullName}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={h.timestamp} title={formatDateTime(h.timestamp)}>
                {compact ? formatRelative(h.timestamp) : formatDateTime(h.timestamp)}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
