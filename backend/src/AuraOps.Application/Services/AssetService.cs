using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AuraOps.Application.Services;

public sealed class AssetService(
    IApplicationDbContext db, HistoryRecorder history, IClock clock, ILogger<AssetService> logger)
{
    public async Task<PagedResult<AssetDto>> ListAsync(AssetQuery q, CancellationToken ct)
    {
        var query = db.Assets.AsNoTracking().AsQueryable();

        if (!q.IncludeArchived) query = query.Where(a => !a.IsArchived);
        if (q.Status is { } status) query = query.Where(a => a.Status == status);
        if (q.Category.Clean() is { } category) query = query.Where(a => a.Category == category);
        if (q.Location.Clean() is { } location) query = query.Where(a => a.Location == location);
        if (q.Search.Clean() is { } search)
        {
            var p = Mapping.ContainsPattern(search);
            query = query.Where(a => EF.Functions.Like(a.AssetCode, p, "\\")
                                  || EF.Functions.Like(a.Name, p, "\\")
                                  || EF.Functions.Like(a.Description, p, "\\"));
        }

        query = (q.SortBy?.ToLowerInvariant(), q.Desc) switch
        {
            ("code", false) => query.OrderBy(a => a.AssetCode),
            ("code", true) => query.OrderByDescending(a => a.AssetCode),
            ("name", false) => query.OrderBy(a => a.Name),
            ("name", true) => query.OrderByDescending(a => a.Name),
            ("category", false) => query.OrderBy(a => a.Category).ThenBy(a => a.Name),
            ("category", true) => query.OrderByDescending(a => a.Category).ThenBy(a => a.Name),
            ("location", false) => query.OrderBy(a => a.Location).ThenBy(a => a.Name),
            ("location", true) => query.OrderByDescending(a => a.Location).ThenBy(a => a.Name),
            ("status", false) => query.OrderBy(a => a.Status).ThenBy(a => a.Name),
            ("status", true) => query.OrderByDescending(a => a.Status).ThenBy(a => a.Name),
            (_, false) => query.OrderBy(a => a.CreatedAt).ThenBy(a => a.AssetId),
            _ => query.OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.AssetId),
        };

        return await query.Select(Mapping.AssetToDto).ToPagedAsync(q, ct);
    }

    public async Task<AssetDto> GetAsync(int id, CancellationToken ct) =>
        await db.Assets.AsNoTracking().Where(a => a.AssetId == id).Select(Mapping.AssetToDto).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Asset", id);

    public async Task<AssetFacetsDto> GetFacetsAsync(CancellationToken ct)
    {
        var categories = await db.Assets.AsNoTracking().Where(a => !a.IsArchived)
            .Select(a => a.Category).Distinct().OrderBy(c => c).ToListAsync(ct);
        var locations = await db.Assets.AsNoTracking().Where(a => !a.IsArchived)
            .Select(a => a.Location).Distinct().OrderBy(c => c).ToListAsync(ct);
        return new AssetFacetsDto(categories, locations);
    }

    public async Task<AssetDto> CreateAsync(AssetUpsertRequest input, CancellationToken ct)
    {
        var code = NormalizeCode(input.AssetCode);
        await EnsureCodeIsUniqueAsync(code, null, ct);

        var asset = new Asset { CreatedAt = clock.UtcNow };
        Apply(asset, input, code);
        db.Assets.Add(asset);
        history.Record(asset, HistoryAction.AssetCreated, $"Asset {asset.AssetCode} ({asset.Name}) registered.");
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Asset {AssetId} ({AssetCode}) created", asset.AssetId, asset.AssetCode);
        return await GetAsync(asset.AssetId, ct);
    }

    public async Task<AssetDto> UpdateAsync(int id, AssetUpsertRequest input, CancellationToken ct)
    {
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.AssetId == id, ct)
                    ?? throw new NotFoundException("Asset", id);
        asset.EnsureNotArchived();

        var code = NormalizeCode(input.AssetCode);
        await EnsureCodeIsUniqueAsync(code, id, ct);

        var changes = Describe(asset, input, code);
        Apply(asset, input, code);
        asset.UpdatedAt = clock.UtcNow;
        if (changes.Count > 0)
            history.Record(asset, HistoryAction.AssetUpdated, "Updated " + string.Join("; ", changes) + ".");
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Asset {AssetId} updated ({ChangeCount} changes)", id, changes.Count);
        return await GetAsync(id, ct);
    }

    /// <summary>
    /// Assets are archived (soft-deleted), never hard-deleted, so their maintenance history is retained.
    /// Archiving is blocked while the asset has active work orders.
    /// </summary>
    public async Task ArchiveAsync(int id, CancellationToken ct)
    {
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.AssetId == id, ct)
                    ?? throw new NotFoundException("Asset", id);

        var hasActiveWork = await db.WorkOrders.AnyAsync(w => w.Request.AssetId == id
            && w.Status != WorkOrderStatus.Completed && w.Status != WorkOrderStatus.Cancelled, ct);
        if (hasActiveWork)
            throw new ConflictException("The asset has active work orders. Complete or cancel them before archiving.");

        asset.Archive(clock.UtcNow);
        history.Record(asset, HistoryAction.AssetArchived, $"Asset {asset.AssetCode} archived.");
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Asset {AssetId} archived", id);
    }

    public async Task<PagedResult<HistoryEntryDto>> GetHistoryAsync(int id, PageQuery page, CancellationToken ct)
    {
        if (!await db.Assets.AnyAsync(a => a.AssetId == id, ct)) throw new NotFoundException("Asset", id);
        return await db.MaintenanceHistory.AsNoTracking()
            .Where(h => h.AssetId == id)
            .OrderByDescending(h => h.Timestamp).ThenByDescending(h => h.HistoryId)
            .Select(Mapping.HistoryToDto)
            .ToPagedAsync(page, ct);
    }

    private static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    private async Task EnsureCodeIsUniqueAsync(string code, int? excludeId, CancellationToken ct)
    {
        if (await db.Assets.AnyAsync(a => a.AssetCode == code && a.AssetId != excludeId, ct))
            throw new ConflictException($"An asset with code '{code}' already exists.");
    }

    private static void Apply(Asset asset, AssetUpsertRequest input, string code)
    {
        asset.AssetCode = code;
        asset.Name = input.Name.Trim();
        asset.Category = input.Category.Trim();
        asset.Location = input.Location.Trim();
        asset.Status = input.Status;
        asset.PurchaseDate = input.PurchaseDate;
        asset.Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();
    }

    private static List<string> Describe(Asset a, AssetUpsertRequest i, string code)
    {
        var c = new List<string>();
        if (a.AssetCode != code) c.Add($"code {a.AssetCode} → {code}");
        if (a.Name != i.Name.Trim()) c.Add($"name → {i.Name.Trim()}");
        if (a.Category != i.Category.Trim()) c.Add($"category {a.Category} → {i.Category.Trim()}");
        if (a.Location != i.Location.Trim()) c.Add($"location {a.Location} → {i.Location.Trim()}");
        if (a.Status != i.Status) c.Add($"status {a.Status} → {i.Status}");
        if (a.PurchaseDate != i.PurchaseDate) c.Add("purchase date");
        if ((a.Description ?? "") != (i.Description?.Trim() ?? "")) c.Add("description");
        return c;
    }
}
