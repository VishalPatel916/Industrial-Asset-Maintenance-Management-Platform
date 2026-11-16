using AuraOps.Application.Abstractions;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;

namespace AuraOps.Application.Services;

/// <summary>Adds append-only history rows to the current unit of work (saved with the business change).</summary>
public sealed class HistoryRecorder(IApplicationDbContext db, ICurrentUser currentUser, IClock clock)
{
    public void Record(Asset asset, HistoryAction action, string notes,
        MaintenanceRequest? request = null, WorkOrder? workOrder = null)
    {
        db.MaintenanceHistory.Add(new MaintenanceHistory
        {
            Asset = asset,
            Request = request,
            WorkOrder = workOrder,
            Action = action,
            Notes = notes.Length > 2000 ? notes[..2000] : notes,
            PerformedByUserId = currentUser.UserId,
            Timestamp = clock.UtcNow,
        });
    }
}
