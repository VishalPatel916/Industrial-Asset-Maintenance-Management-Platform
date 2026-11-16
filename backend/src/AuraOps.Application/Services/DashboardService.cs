using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace AuraOps.Application.Services;

public sealed class DashboardService(IApplicationDbContext db, IUserRoleLookup users, IClock clock)
{
    public async Task<DashboardSummaryDto> GetSummaryAsync(DashboardQuery q, CancellationToken ct)
    {
        var category = q.Category.Clean();
        var location = q.Location.Clean();

        var assets = db.Assets.AsNoTracking().Where(a => !a.IsArchived);
        if (category is not null) assets = assets.Where(a => a.Category == category);
        if (location is not null) assets = assets.Where(a => a.Location == location);

        var requests = db.MaintenanceRequests.AsNoTracking().Where(r => !r.Asset.IsArchived);
        if (category is not null) requests = requests.Where(r => r.Asset.Category == category);
        if (location is not null) requests = requests.Where(r => r.Asset.Location == location);

        var workOrders = db.WorkOrders.AsNoTracking().AsQueryable();
        if (category is not null) workOrders = workOrders.Where(w => w.Request.Asset.Category == category);
        if (location is not null) workOrders = workOrders.Where(w => w.Request.Asset.Location == location);

        var assetStatus = await assets.GroupBy(a => a.Status)
            .Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        int AssetCount(AssetStatus s) => assetStatus.FirstOrDefault(x => x.Key == s)?.Count ?? 0;

        var openRequestStatuses = new[] { RequestStatus.Open, RequestStatus.InReview, RequestStatus.Approved, RequestStatus.InProgress };
        var openRequestsByPriority = await requests.Where(r => openRequestStatuses.Contains(r.Status))
            .GroupBy(r => r.Priority).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);

        var woByStatus = await workOrders.GroupBy(w => w.Status)
            .Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        int WoCount(WorkOrderStatus s) => woByStatus.FirstOrDefault(x => x.Key == s)?.Count ?? 0;

        var now = clock.UtcNow;
        var overdue = await workOrders.CountAsync(w => w.DueDate != null && w.DueDate < now
            && w.Status != WorkOrderStatus.Completed && w.Status != WorkOrderStatus.Cancelled, ct);

        // Average time from start to completion (computed client-side so it works on any provider).
        var durations = await workOrders
            .Where(w => w.Status == WorkOrderStatus.Completed && w.StartDate != null && w.CompletionDate != null)
            .OrderByDescending(w => w.CompletionDate).Take(500)
            .Select(w => new { w.StartDate, w.CompletionDate }).ToListAsync(ct);
        double? avgHours = durations.Count == 0 ? null
            : Math.Round(durations.Average(d => (d.CompletionDate!.Value - d.StartDate!.Value).TotalHours), 1);

        var byCategory = (await assets.GroupBy(a => a.Category)
                .Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct))
            .OrderByDescending(x => x.Count).ThenBy(x => x.Key)
            .Select(x => new CountByKey(x.Key, x.Count)).ToList();

        var since = now.AddDays(-30);
        var technicians = await users.GetActiveTechniciansAsync(ct);

        var workload = await workOrders.Where(w => w.AssignedTechnicianId != null)
            .GroupBy(w => w.AssignedTechnicianId!)
            .Select(g => new
            {
                TechId = g.Key,
                Assigned = g.Count(w => w.Status == WorkOrderStatus.Assigned),
                InProgress = g.Count(w => w.Status == WorkOrderStatus.InProgress),
                Completed = g.Count(w => w.Status == WorkOrderStatus.Completed && w.CompletionDate >= since),
            }).ToListAsync(ct);

        var technicianWorkload = technicians
            .Select(t =>
            {
                var w = workload.FirstOrDefault(x => x.TechId == t.Id);
                return new TechnicianWorkload(t,
                    w?.Assigned ?? 0, w?.InProgress ?? 0, w?.Completed ?? 0);
            })
            .OrderByDescending(t => t.Assigned + t.InProgress).ThenBy(t => t.Technician.FullName)
            .ToList();

        var history = db.MaintenanceHistory.AsNoTracking().AsQueryable();
        if (category is not null) history = history.Where(h => h.Asset.Category == category);
        if (location is not null) history = history.Where(h => h.Asset.Location == location);
        var recent = await history.OrderByDescending(h => h.Timestamp).ThenByDescending(h => h.HistoryId)
            .Take(12).Select(Mapping.HistoryToDto).ToListAsync(ct);

        return new DashboardSummaryDto(
            TotalAssets: assetStatus.Sum(x => x.Count),
            ActiveAssets: AssetCount(AssetStatus.Operational),
            AssetsUnderMaintenance: AssetCount(AssetStatus.UnderMaintenance),
            AssetsOutOfService: AssetCount(AssetStatus.OutOfService),
            OpenRequests: openRequestsByPriority.Sum(x => x.Count),
            CriticalOpenRequests: openRequestsByPriority.FirstOrDefault(x => x.Key == Priority.Critical)?.Count ?? 0,
            OpenWorkOrders: WoCount(WorkOrderStatus.Open) + WoCount(WorkOrderStatus.Assigned),
            InProgressWorkOrders: WoCount(WorkOrderStatus.InProgress),
            CompletedWorkOrders: WoCount(WorkOrderStatus.Completed),
            OverdueWorkOrders: overdue,
            AverageCompletionHours: avgHours,
            WorkOrdersByStatus: Enum.GetValues<WorkOrderStatus>().Select(s => new CountByKey(s.ToString(), WoCount(s))).ToList(),
            RequestsByPriority: Enum.GetValues<Priority>()
                .Select(p => new CountByKey(p.ToString(), openRequestsByPriority.FirstOrDefault(x => x.Key == p)?.Count ?? 0)).ToList(),
            AssetsByCategory: byCategory,
            TechnicianWorkload: technicianWorkload,
            RecentActivity: recent);
    }
}
