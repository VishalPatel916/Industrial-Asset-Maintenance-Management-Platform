using AuraOps.Domain.Enums;

namespace AuraOps.Domain.Entities;

/// <summary>
/// Append-only audit/timeline entry. Rows are only ever inserted; the DbContext
/// rejects updates and deletes of history rows.
/// </summary>
public class MaintenanceHistory
{
    public long HistoryId { get; set; }
    public int AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    public int? RequestId { get; set; }
    public MaintenanceRequest? Request { get; set; }
    public int? WorkOrderId { get; set; }
    public WorkOrder? WorkOrder { get; set; }
    public HistoryAction Action { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string PerformedByUserId { get; set; } = string.Empty;
    public ApplicationUser PerformedBy { get; set; } = null!;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
