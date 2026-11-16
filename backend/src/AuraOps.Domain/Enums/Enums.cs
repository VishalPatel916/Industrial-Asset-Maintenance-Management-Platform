namespace AuraOps.Domain.Enums;

/// <summary>Operational state of a physical asset.</summary>
public enum AssetStatus
{
    Operational = 0,
    UnderMaintenance = 1,
    OutOfService = 2,
    Decommissioned = 3
}

public enum Priority
{
    Low = 0,
    Medium = 1,
    High = 2,
    Critical = 3
}

/// <summary>
/// Lifecycle of a maintenance request (an issue report).
/// Open → InReview → Approved → InProgress → Resolved, with Rejected as a terminal exit.
/// InProgress/Resolved are driven by work orders.
/// </summary>
public enum RequestStatus
{
    Open = 0,
    InReview = 1,
    Approved = 2,
    InProgress = 3,
    Resolved = 4,
    Rejected = 5
}

/// <summary>Open → Assigned → InProgress → Completed, optionally Cancelled.</summary>
public enum WorkOrderStatus
{
    Open = 0,
    Assigned = 1,
    InProgress = 2,
    Completed = 3,
    Cancelled = 4
}

/// <summary>Kinds of entries recorded in the append-only maintenance history.</summary>
public enum HistoryAction
{
    AssetCreated = 0,
    AssetUpdated = 1,
    AssetArchived = 2,
    RequestCreated = 10,
    RequestStatusChanged = 11,
    RequestPriorityChanged = 12,
    WorkOrderCreated = 20,
    WorkOrderAssigned = 21,
    WorkOrderStatusChanged = 22,
    WorkOrderNoteAdded = 23
}
