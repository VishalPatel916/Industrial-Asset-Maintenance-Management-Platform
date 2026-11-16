using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AuraOps.Application.Services;

public sealed class MaintenanceRequestService(
    IApplicationDbContext db, ICurrentUser currentUser, HistoryRecorder history, IClock clock,
    ILogger<MaintenanceRequestService> logger)
{
    public async Task<PagedResult<MaintenanceRequestDto>> ListAsync(RequestQuery q, CancellationToken ct)
    {
        var query = db.MaintenanceRequests.AsNoTracking().AsQueryable();

        if (q.Status is { } status) query = query.Where(r => r.Status == status);
        if (q.Priority is { } priority) query = query.Where(r => r.Priority == priority);
        if (q.AssetId is { } assetId) query = query.Where(r => r.AssetId == assetId);
        if (q.Category.Clean() is { } category) query = query.Where(r => r.Asset.Category == category);
        if (q.Location.Clean() is { } location) query = query.Where(r => r.Asset.Location == location);
        if (q.Search.Clean() is { } search)
        {
            var p = Mapping.ContainsPattern(search);
            query = query.Where(r => EF.Functions.Like(r.Title, p, "\\")
                                  || EF.Functions.Like(r.Description, p, "\\")
                                  || EF.Functions.Like(r.Asset.AssetCode, p, "\\")
                                  || EF.Functions.Like(r.Asset.Name, p, "\\"));
        }

        query = (q.SortBy?.ToLowerInvariant(), q.Desc) switch
        {
            ("priority", true) => query.OrderByDescending(r => r.Priority).ThenByDescending(r => r.CreatedAt),
            ("priority", false) => query.OrderBy(r => r.Priority).ThenByDescending(r => r.CreatedAt),
            ("status", true) => query.OrderByDescending(r => r.Status).ThenByDescending(r => r.CreatedAt),
            ("status", false) => query.OrderBy(r => r.Status).ThenByDescending(r => r.CreatedAt),
            (_, false) => query.OrderBy(r => r.CreatedAt).ThenBy(r => r.RequestId),
            _ => query.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.RequestId),
        };

        return await query.Select(Mapping.RequestToDto).ToPagedAsync(q, ct);
    }

    public async Task<MaintenanceRequestDto> GetAsync(int id, CancellationToken ct) =>
        await db.MaintenanceRequests.AsNoTracking().Where(r => r.RequestId == id)
            .Select(Mapping.RequestToDto).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Maintenance request", id);

    public async Task<MaintenanceRequestDto> CreateAsync(CreateMaintenanceRequest input, CancellationToken ct)
    {
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.AssetId == input.AssetId, ct)
                    ?? throw new ValidationException(nameof(input.AssetId), $"Asset {input.AssetId} does not exist.");
        if (asset.IsArchived)
            throw new ValidationException(nameof(input.AssetId), "Issues cannot be reported against an archived asset.");

        var now = clock.UtcNow;
        var request = new MaintenanceRequest
        {
            Asset = asset,
            CreatedByUserId = currentUser.UserId,
            Title = input.Title.Trim(),
            Description = input.Description.Trim(),
            Priority = input.Priority,
            CreatedAt = now,
        };
        db.MaintenanceRequests.Add(request);
        history.Record(asset, HistoryAction.RequestCreated,
            $"Issue reported ({request.Priority}): {request.Title}", request);
        await db.SaveChangesAsync(ct); // request + history row in one transaction

        logger.LogInformation("Maintenance request {RequestId} created for asset {AssetId} with priority {Priority}",
            request.RequestId, asset.AssetId, request.Priority);
        return await GetAsync(request.RequestId, ct);
    }

    /// <summary>Review/prioritise a request. Only administrators may change request status.</summary>
    public async Task<MaintenanceRequestDto> UpdateStatusAsync(int id, UpdateRequestStatus input, CancellationToken ct)
    {
        if (!currentUser.IsInRole(Roles.Admin)) throw new ForbiddenException();

        var request = await db.MaintenanceRequests.Include(r => r.Asset)
                          .FirstOrDefaultAsync(r => r.RequestId == id, ct)
                      ?? throw new NotFoundException("Maintenance request", id);
        var now = clock.UtcNow;

        if (input.Priority is { } newPriority && newPriority != request.Priority)
        {
            var old = request.Priority;
            request.Priority = newPriority;
            request.UpdatedAt = now;
            history.Record(request.Asset, HistoryAction.RequestPriorityChanged,
                $"Request #{id} priority {old} → {newPriority}.", request);
        }

        if (input.Status != request.Status)
        {
            var old = request.Status;
            request.ChangeStatus(input.Status, now);
            var note = $"Request #{id} status {old} → {input.Status}.";
            if (!string.IsNullOrWhiteSpace(input.Comment)) note += " " + input.Comment.Trim();
            history.Record(request.Asset, HistoryAction.RequestStatusChanged, note, request);
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Maintenance request {RequestId} updated to {Status}/{Priority}", id, request.Status, request.Priority);
        return await GetAsync(id, ct);
    }
}
