using AuraOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuraOps.Application.Abstractions;

/// <summary>Persistence port used by application services (implemented by EF Core in Infrastructure).</summary>
public interface IApplicationDbContext
{
    DbSet<Asset> Assets { get; }
    DbSet<MaintenanceRequest> MaintenanceRequests { get; }
    DbSet<WorkOrder> WorkOrders { get; }
    DbSet<WorkOrderNote> WorkOrderNotes { get; }
    DbSet<MaintenanceHistory> MaintenanceHistory { get; }
    DbSet<ApplicationUser> Users { get; }

    /// <summary>Persists all pending changes atomically (a single database transaction).</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

/// <summary>The authenticated caller for the current request.</summary>
public interface ICurrentUser
{
    string UserId { get; }
    bool IsInRole(string role);
}

/// <summary>Abstracted clock so time-dependent rules are testable.</summary>
public interface IClock
{
    DateTime UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}

/// <summary>Identity lookups needed by business rules (implemented over ASP.NET Core Identity).</summary>
public interface IUserRoleLookup
{
    Task<bool> IsActiveTechnicianAsync(string userId, CancellationToken ct);
    Task<IReadOnlyList<Dtos.UserSummaryDto>> GetActiveTechniciansAsync(CancellationToken ct);
}
