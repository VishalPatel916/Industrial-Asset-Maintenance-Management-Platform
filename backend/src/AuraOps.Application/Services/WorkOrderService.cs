using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AuraOps.Application.Services;

/// <summary>
/// Work-order use cases. Every operation that touches several rows (work order, request,
/// asset, history) is committed with a single SaveChanges call, i.e. one database transaction.
/// </summary>
public sealed class WorkOrderService(
    IApplicationDbContext db, ICurrentUser currentUser, IUserRoleLookup users,
    HistoryRecorder history, IClock clock, ILogger<WorkOrderService> logger)
{
    private bool IsAdmin => currentUser.IsInRole(Roles.Admin);
    private bool IsTechnicianOnly => currentUser.IsInRole(Roles.Technician) && !IsAdmin;

    public async Task<PagedResult<WorkOrderDto>> ListAsync(WorkOrderQuery q, CancellationToken ct)
    {
        var query = db.WorkOrders.AsNoTracking().AsQueryable();

        // Technicians only ever see work assigned to them, regardless of the filter supplied.
        if (IsTechnicianOnly) query = query.Where(w => w.AssignedTechnicianId == currentUser.UserId);
        else if (q.TechnicianId.Clean() is { } techId)
            query = techId == "unassigned"
                ? query.Where(w => w.AssignedTechnicianId == null)
                : query.Where(w => w.AssignedTechnicianId == techId);

        if (q.Status is { } status) query = query.Where(w => w.Status == status);
        if (q.ActiveOnly) query = query.Where(w => w.Status != WorkOrderStatus.Completed && w.Status != WorkOrderStatus.Cancelled);
        if (q.Priority is { } priority) query = query.Where(w => w.Request.Priority == priority);
        if (q.AssetId is { } assetId) query = query.Where(w => w.Request.AssetId == assetId);
        if (q.RequestId is { } requestId) query = query.Where(w => w.RequestId == requestId);
        if (q.Category.Clean() is { } category) query = query.Where(w => w.Request.Asset.Category == category);
        if (q.Location.Clean() is { } location) query = query.Where(w => w.Request.Asset.Location == location);
        if (q.Search.Clean() is { } search)
        {
            var p = Mapping.ContainsPattern(search);
            query = query.Where(w => EF.Functions.Like(w.Request.Title, p, "\\")
                                  || EF.Functions.Like(w.Request.Asset.AssetCode, p, "\\")
                                  || EF.Functions.Like(w.Request.Asset.Name, p, "\\"));
        }

        query = (q.SortBy?.ToLowerInvariant(), q.Desc) switch
        {
            ("priority", true) => query.OrderByDescending(w => w.Request.Priority).ThenByDescending(w => w.CreatedAt),
            ("priority", false) => query.OrderBy(w => w.Request.Priority).ThenByDescending(w => w.CreatedAt),
            ("status", true) => query.OrderByDescending(w => w.Status).ThenByDescending(w => w.CreatedAt),
            ("status", false) => query.OrderBy(w => w.Status).ThenByDescending(w => w.CreatedAt),
            ("duedate", false) => query.OrderBy(w => w.DueDate == null).ThenBy(w => w.DueDate),
            ("duedate", true) => query.OrderByDescending(w => w.DueDate),
            (_, false) => query.OrderBy(w => w.CreatedAt).ThenBy(w => w.WorkOrderId),
            _ => query.OrderByDescending(w => w.CreatedAt).ThenByDescending(w => w.WorkOrderId),
        };

        return await query.Select(Mapping.WorkOrderToDto).ToPagedAsync(q, ct);
    }

    public async Task<WorkOrderDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var row = await db.WorkOrders.AsNoTracking().Where(w => w.WorkOrderId == id)
            .Select(w => new { w.AssignedTechnicianId, w.Request.Description })
            .FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Work order", id);

        if (IsTechnicianOnly && row.AssignedTechnicianId != currentUser.UserId)
            throw new ForbiddenException("Technicians can only view work orders assigned to them.");

        var dto = await db.WorkOrders.AsNoTracking().Where(w => w.WorkOrderId == id)
            .Select(Mapping.WorkOrderToDto).FirstAsync(ct);
        var notes = await db.WorkOrderNotes.AsNoTracking().Where(n => n.WorkOrderId == id)
            .OrderBy(n => n.CreatedAt).ThenBy(n => n.NoteId).Select(Mapping.NoteToDto).ToListAsync(ct);
        var timeline = await db.MaintenanceHistory.AsNoTracking()
            .Where(h => h.WorkOrderId == id || (h.RequestId == dto.RequestId && h.WorkOrderId == null))
            .OrderByDescending(h => h.Timestamp).ThenByDescending(h => h.HistoryId)
            .Select(Mapping.HistoryToDto).ToListAsync(ct);

        var allowed = WorkOrder.AllowedNext(dto.Status)
            .Where(s => s != WorkOrderStatus.Assigned)
            .Where(s => IsAdmin || s != WorkOrderStatus.Cancelled)
            .ToList();
        if (!IsAdmin && row.AssignedTechnicianId != currentUser.UserId) allowed.Clear();

        return new WorkOrderDetailDto(dto, row.Description, notes, allowed, timeline);
    }

    public async Task<WorkOrderDetailDto> CreateAsync(CreateWorkOrderRequest input, CancellationToken ct)
    {
        RequireAdmin();
        var request = await db.MaintenanceRequests.Include(r => r.Asset)
                          .FirstOrDefaultAsync(r => r.RequestId == input.RequestId, ct)
                      ?? throw new ValidationException(nameof(input.RequestId), $"Maintenance request {input.RequestId} does not exist.");
        if (request.Asset.IsArchived)
            throw new ConflictException("Work orders cannot be created for an archived asset.");
        if (!request.CanCreateWorkOrder)
            throw new ConflictException(request.Status == RequestStatus.InProgress
                ? "This request already has an active work order."
                : $"A work order cannot be created for a request in status '{request.Status}'.");

        var now = clock.UtcNow;
        var workOrder = new WorkOrder { Request = request, CreatedAt = now, DueDate = input.DueDate };
        request.MarkInProgress(now);
        db.WorkOrders.Add(workOrder);
        history.Record(request.Asset, HistoryAction.WorkOrderCreated,
            $"Work order created for request #{request.RequestId}.", request, workOrder);

        if (input.AssignedTechnicianId.Clean() is { } techId)
            await AssignInternalAsync(workOrder, request, techId, now, ct);

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Work order {WorkOrderId} created for request {RequestId}", workOrder.WorkOrderId, request.RequestId);
        return await GetAsync(workOrder.WorkOrderId, ct);
    }

    public async Task<WorkOrderDetailDto> AssignAsync(int id, AssignWorkOrderRequest input, CancellationToken ct)
    {
        RequireAdmin();
        var workOrder = await LoadAsync(id, ct);
        await AssignInternalAsync(workOrder, workOrder.Request, input.TechnicianId.Trim(), clock.UtcNow, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Work order {WorkOrderId} assigned to {TechnicianId}", id, workOrder.AssignedTechnicianId);
        return await GetAsync(id, ct);
    }

    public async Task<WorkOrderDetailDto> UpdateStatusAsync(int id, UpdateWorkOrderStatusRequest input, CancellationToken ct)
    {
        var workOrder = await LoadAsync(id, ct);
        EnsureCanWorkOn(workOrder);
        if (input.Status == WorkOrderStatus.Cancelled && !IsAdmin)
            throw new ForbiddenException("Only administrators can cancel work orders.");

        var now = clock.UtcNow;
        var from = workOrder.Status;
        workOrder.ChangeStatus(input.Status, now, input.Remarks);

        var request = workOrder.Request;
        var asset = request.Asset;
        var note = $"Work order #{id} status {from} → {input.Status}.";
        if (!string.IsNullOrWhiteSpace(input.Remarks)) note += " " + input.Remarks.Trim();
        history.Record(asset, HistoryAction.WorkOrderStatusChanged, note, request, workOrder);

        switch (input.Status)
        {
            case WorkOrderStatus.InProgress when asset.Status == AssetStatus.Operational:
                asset.Status = AssetStatus.UnderMaintenance;
                asset.UpdatedAt = now;
                history.Record(asset, HistoryAction.AssetUpdated,
                    $"Status Operational → UnderMaintenance (work order #{id} started).", request, workOrder);
                break;
            case WorkOrderStatus.Completed:
                request.MarkResolved(now);
                history.Record(asset, HistoryAction.RequestStatusChanged,
                    $"Request #{request.RequestId} resolved by work order #{id}.", request, workOrder);
                await RestoreAssetIfIdleAsync(asset, workOrder, request, now, ct);
                break;
            case WorkOrderStatus.Cancelled:
                request.ReturnToQueue(now);
                await RestoreAssetIfIdleAsync(asset, workOrder, request, now, ct);
                break;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Work order {WorkOrderId} moved {From} → {To}", id, from, input.Status);
        return await GetAsync(id, ct);
    }

    public async Task<WorkOrderNoteDto> AddNoteAsync(int id, AddWorkOrderNoteRequest input, CancellationToken ct)
    {
        var workOrder = await LoadAsync(id, ct);
        EnsureCanWorkOn(workOrder);
        if (workOrder.Status == WorkOrderStatus.Cancelled)
            throw new ConflictException("Notes cannot be added to a cancelled work order.");

        var note = new WorkOrderNote
        {
            WorkOrder = workOrder,
            AuthorUserId = currentUser.UserId,
            Text = input.Text.Trim(),
            CreatedAt = clock.UtcNow,
        };
        db.WorkOrderNotes.Add(note);
        var preview = note.Text.Length > 140 ? note.Text[..140] + "…" : note.Text;
        history.Record(workOrder.Request.Asset, HistoryAction.WorkOrderNoteAdded,
            $"Note on work order #{id}: {preview}", workOrder.Request, workOrder);
        await db.SaveChangesAsync(ct);

        return await db.WorkOrderNotes.AsNoTracking().Where(n => n.NoteId == note.NoteId)
            .Select(Mapping.NoteToDto).FirstAsync(ct);
    }

    private async Task AssignInternalAsync(WorkOrder workOrder, MaintenanceRequest request, string techId, DateTime now, CancellationToken ct)
    {
        if (!await users.IsActiveTechnicianAsync(techId, ct))
            throw new ValidationException("TechnicianId", "The selected user is not an active technician.");

        var previous = workOrder.AssignedTechnicianId;
        workOrder.AssignTo(techId, now);
        var name = await db.Users.Where(u => u.Id == techId).Select(u => u.FullName).FirstAsync(ct);
        history.Record(request.Asset, HistoryAction.WorkOrderAssigned,
            previous is null ? $"Assigned to {name}." : $"Re-assigned to {name}.", request, workOrder);
    }

    /// <summary>When no other work on the asset is in progress, an asset under maintenance returns to Operational.</summary>
    private async Task RestoreAssetIfIdleAsync(Asset asset, WorkOrder current, MaintenanceRequest request, DateTime now, CancellationToken ct)
    {
        if (asset.Status != AssetStatus.UnderMaintenance) return;
        var otherWorkInProgress = await db.WorkOrders.AnyAsync(w =>
            w.Request.AssetId == asset.AssetId && w.WorkOrderId != current.WorkOrderId
            && w.Status == WorkOrderStatus.InProgress, ct);
        if (otherWorkInProgress) return;

        asset.Status = AssetStatus.Operational;
        asset.UpdatedAt = now;
        history.Record(asset, HistoryAction.AssetUpdated,
            $"Status UnderMaintenance → Operational (work order #{current.WorkOrderId} {current.Status.ToString().ToLowerInvariant()}).",
            request, current);
    }

    private async Task<WorkOrder> LoadAsync(int id, CancellationToken ct) =>
        await db.WorkOrders.Include(w => w.Request).ThenInclude(r => r.Asset)
            .FirstOrDefaultAsync(w => w.WorkOrderId == id, ct)
        ?? throw new NotFoundException("Work order", id);

    private void EnsureCanWorkOn(WorkOrder workOrder)
    {
        if (IsAdmin) return;
        if (currentUser.IsInRole(Roles.Technician) && workOrder.IsAssignedTo(currentUser.UserId)) return;
        throw new ForbiddenException("Only the assigned technician or an administrator can update this work order.");
    }

    private void RequireAdmin()
    {
        if (!IsAdmin) throw new ForbiddenException();
    }
}
