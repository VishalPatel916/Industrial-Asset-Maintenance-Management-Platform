using AuraOps.Domain.Enums;
using AuraOps.Domain.Exceptions;

namespace AuraOps.Domain.Entities;

public class MaintenanceRequest
{
    public int RequestId { get; set; }
    public int AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    public string CreatedByUserId { get; set; } = string.Empty;
    public ApplicationUser CreatedBy { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Priority Priority { get; set; } = Priority.Medium;
    public RequestStatus Status { get; private set; } = RequestStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// A request may have several work orders over time (e.g. a repeat repair),
    /// but only one active (non-terminal) work order at once.
    /// </summary>
    public ICollection<WorkOrder> WorkOrders { get; set; } = new List<WorkOrder>();

    /// <summary>Transitions a user may request explicitly through the API.</summary>
    private static readonly Dictionary<RequestStatus, RequestStatus[]> ManualTransitions = new()
    {
        [RequestStatus.Open] = [RequestStatus.InReview, RequestStatus.Approved, RequestStatus.Rejected],
        [RequestStatus.InReview] = [RequestStatus.Approved, RequestStatus.Rejected, RequestStatus.Open],
        [RequestStatus.Approved] = [RequestStatus.Rejected, RequestStatus.InReview],
        [RequestStatus.InProgress] = [],               // driven by work orders
        [RequestStatus.Resolved] = [RequestStatus.Open], // re-open if the problem returns
        [RequestStatus.Rejected] = [RequestStatus.Open],
    };

    public static bool CanTransition(RequestStatus from, RequestStatus to) =>
        ManualTransitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public void ChangeStatus(RequestStatus to, DateTime nowUtc)
    {
        if (!CanTransition(Status, to))
            throw new InvalidStatusTransitionException("Maintenance request", Status, to);
        Status = to;
        UpdatedAt = nowUtc;
    }

    public bool CanCreateWorkOrder =>
        Status is RequestStatus.Open or RequestStatus.InReview or RequestStatus.Approved;

    /// <summary>Called when a work order is raised against this request.</summary>
    public void MarkInProgress(DateTime nowUtc)
    {
        if (!CanCreateWorkOrder)
            throw new DomainException($"A work order cannot be created for a request in status '{Status}'.");
        Status = RequestStatus.InProgress;
        UpdatedAt = nowUtc;
    }

    /// <summary>Called when the active work order completes.</summary>
    public void MarkResolved(DateTime nowUtc)
    {
        Status = RequestStatus.Resolved;
        UpdatedAt = nowUtc;
    }

    /// <summary>Called when the active work order is cancelled; the request returns to the approved queue.</summary>
    public void ReturnToQueue(DateTime nowUtc)
    {
        if (Status == RequestStatus.InProgress)
        {
            Status = RequestStatus.Approved;
            UpdatedAt = nowUtc;
        }
    }
}
