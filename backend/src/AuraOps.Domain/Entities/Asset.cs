using AuraOps.Domain.Enums;
using AuraOps.Domain.Exceptions;

namespace AuraOps.Domain.Entities;

public class Asset
{
    public int AssetId { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public AssetStatus Status { get; set; } = AssetStatus.Operational;
    public DateOnly? PurchaseDate { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Soft delete. Archived assets keep their history for traceability.</summary>
    public bool IsArchived { get; private set; }
    public DateTime? ArchivedAt { get; private set; }

    public ICollection<MaintenanceRequest> MaintenanceRequests { get; set; } = new List<MaintenanceRequest>();
    public ICollection<MaintenanceHistory> History { get; set; } = new List<MaintenanceHistory>();

    public void Archive(DateTime nowUtc)
    {
        if (IsArchived) throw new DomainException($"Asset '{AssetCode}' is already archived.");
        IsArchived = true;
        ArchivedAt = nowUtc;
        Status = AssetStatus.Decommissioned;
    }

    public void EnsureNotArchived()
    {
        if (IsArchived) throw new DomainException($"Asset '{AssetCode}' is archived and cannot be changed.");
    }
}
