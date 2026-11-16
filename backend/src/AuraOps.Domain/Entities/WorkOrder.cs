using AuraOps.Domain.Enums;
using AuraOps.Domain.Exceptions;

namespace AuraOps.Domain.Entities;

public class WorkOrder
{
    public int WorkOrderId { get; set; }
    public int RequestId { get; set; }
    public MaintenanceRequest Request { get; set; } = null!;
    public string? AssignedTechnicianId { get; private set; }
    public ApplicationUser? AssignedTechnician { get; set; }
    public WorkOrderStatus Status { get; private set; } = WorkOrderStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AssignedAt { get; private set; }
    public DateTime? StartDate { get; private set; }
    public DateTime? CompletionDate { get; private set; }
    public DateTime? DueDate { get; set; }
    public string? Remarks { get; private set; }

    public ICollection<WorkOrderNote> Notes { get; set; } = new List<WorkOrderNote>();

    public bool IsActive => Status is not (WorkOrderStatus.Completed or WorkOrderStatus.Cancelled);

    private static readonly Dictionary<WorkOrderStatus, WorkOrderStatus[]> Transitions = new()
    {
        [WorkOrderStatus.Open] = [WorkOrderStatus.Assigned, WorkOrderStatus.Cancelled],
        [WorkOrderStatus.Assigned] = [WorkOrderStatus.InProgress, WorkOrderStatus.Cancelled],
        [WorkOrderStatus.InProgress] = [WorkOrderStatus.Completed, WorkOrderStatus.Cancelled],
        [WorkOrderStatus.Completed] = [],
        [WorkOrderStatus.Cancelled] = [],
    };

    public static bool CanTransition(WorkOrderStatus from, WorkOrderStatus to) =>
        Transitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public static IReadOnlyCollection<WorkOrderStatus> AllowedNext(WorkOrderStatus from) => Transitions[from];

    /// <summary>Assign or re-assign a technician. Allowed while the work order is still active.</summary>
    public void AssignTo(string technicianId, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(technicianId))
            throw new DomainException("A technician must be specified.");
        if (!IsActive)
            throw new DomainException($"A {Status.ToString().ToLowerInvariant()} work order cannot be re-assigned.");

        AssignedTechnicianId = technicianId;
        AssignedAt = nowUtc;
        if (Status == WorkOrderStatus.Open) Status = WorkOrderStatus.Assigned;
    }

    public void ChangeStatus(WorkOrderStatus to, DateTime nowUtc, string? remarks = null)
    {
        if (to == WorkOrderStatus.Assigned)
            throw new DomainException("Use the assign operation to assign a technician.");
        if (!CanTransition(Status, to))
            throw new InvalidStatusTransitionException("Work order", Status, to);

        switch (to)
        {
            case WorkOrderStatus.InProgress:
                if (AssignedTechnicianId is null)
                    throw new DomainException("A work order must be assigned before work can start.");
                StartDate = nowUtc;
                break;
            case WorkOrderStatus.Completed:
                // Rule: a completed work order always carries a completion timestamp.
                CompletionDate = nowUtc;
                break;
            case WorkOrderStatus.Cancelled:
                if (string.IsNullOrWhiteSpace(remarks))
                    throw new DomainException("A reason (remarks) is required to cancel a work order.");
                break;
        }

        if (!string.IsNullOrWhiteSpace(remarks)) Remarks = remarks.Trim();
        Status = to;
    }

    public bool IsAssignedTo(string userId) => AssignedTechnicianId == userId;
}
