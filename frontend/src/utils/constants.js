// Enum values exactly as the API serialises them (JsonStringEnumConverter).

export const ROLES = { Admin: 'Admin', Technician: 'Technician', Viewer: 'Viewer' };
export const ROLE_LIST = [ROLES.Admin, ROLES.Technician, ROLES.Viewer];

export const ASSET_STATUSES = ['Operational', 'UnderMaintenance', 'OutOfService', 'Decommissioned'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const REQUEST_STATUSES = ['Open', 'InReview', 'Approved', 'InProgress', 'Resolved', 'Rejected'];
export const WORK_ORDER_STATUSES = ['Open', 'Assigned', 'InProgress', 'Completed', 'Cancelled'];

/** Manual request transitions allowed by the API (mirrors MaintenanceRequest.ManualTransitions). */
export const REQUEST_TRANSITIONS = {
  Open: ['InReview', 'Approved', 'Rejected'],
  InReview: ['Approved', 'Rejected', 'Open'],
  Approved: ['Rejected', 'InReview'],
  InProgress: [],
  Resolved: ['Open'],
  Rejected: ['Open'],
};

/** Request states from which a work order may be raised. */
export const WORK_ORDER_ELIGIBLE = ['Open', 'InReview', 'Approved'];

export const HISTORY_ACTION_LABELS = {
  AssetCreated: 'Asset created',
  AssetUpdated: 'Asset updated',
  AssetArchived: 'Asset archived',
  RequestCreated: 'Issue reported',
  RequestStatusChanged: 'Request status changed',
  RequestPriorityChanged: 'Request priority changed',
  WorkOrderCreated: 'Work order created',
  WorkOrderAssigned: 'Work order assigned',
  WorkOrderStatusChanged: 'Work order status changed',
  WorkOrderNoteAdded: 'Note added',
};

/** Button labels for work-order transitions. */
export const WO_ACTION_LABELS = {
  InProgress: 'Start work',
  Completed: 'Mark completed',
  Cancelled: 'Cancel work order',
};
