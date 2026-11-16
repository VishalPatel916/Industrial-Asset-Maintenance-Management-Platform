using System.Linq.Expressions;
using AuraOps.Application.Dtos;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace AuraOps.Application.Common;

/// <summary>
/// Explicit entity → DTO projections. Written as expression trees so EF Core translates
/// them into SQL SELECTs (only the needed columns are read; no lazy loading).
/// </summary>
public static class Mapping
{
    public static readonly Expression<Func<Asset, AssetDto>> AssetToDto = a => new AssetDto(
        a.AssetId, a.AssetCode, a.Name, a.Category, a.Location, a.Status, a.PurchaseDate,
        a.Description, a.CreatedAt, a.UpdatedAt, a.IsArchived,
        a.MaintenanceRequests.Count(r => r.Status != RequestStatus.Resolved && r.Status != RequestStatus.Rejected));

    public static readonly Expression<Func<MaintenanceRequest, MaintenanceRequestDto>> RequestToDto = r =>
        new MaintenanceRequestDto(
            r.RequestId, r.AssetId, r.Asset.AssetCode, r.Asset.Name, r.Title, r.Description,
            r.Priority, r.Status,
            new UserSummaryDto(r.CreatedBy.Id, r.CreatedBy.FullName, r.CreatedBy.Email!),
            r.CreatedAt, r.UpdatedAt,
            r.WorkOrders
                .Where(w => w.Status != WorkOrderStatus.Completed && w.Status != WorkOrderStatus.Cancelled)
                .Select(w => (int?)w.WorkOrderId).FirstOrDefault(),
            r.WorkOrders.Count);

    public static readonly Expression<Func<WorkOrder, WorkOrderDto>> WorkOrderToDto = w => new WorkOrderDto(
        w.WorkOrderId, w.RequestId, w.Request.Title, w.Request.AssetId, w.Request.Asset.AssetCode,
        w.Request.Asset.Name, w.Request.Priority, w.Status,
        w.AssignedTechnician == null
            ? null
            : new UserSummaryDto(w.AssignedTechnician.Id, w.AssignedTechnician.FullName, w.AssignedTechnician.Email!),
        w.CreatedAt, w.AssignedAt, w.StartDate, w.CompletionDate, w.DueDate, w.Remarks, w.Notes.Count);

    public static readonly Expression<Func<MaintenanceHistory, HistoryEntryDto>> HistoryToDto = h =>
        new HistoryEntryDto(
            h.HistoryId, h.AssetId, h.Asset.AssetCode, h.RequestId, h.WorkOrderId, h.Action, h.Notes,
            new UserSummaryDto(h.PerformedBy.Id, h.PerformedBy.FullName, h.PerformedBy.Email!),
            h.Timestamp);

    public static readonly Expression<Func<WorkOrderNote, WorkOrderNoteDto>> NoteToDto = n =>
        new WorkOrderNoteDto(n.NoteId, n.Text,
            new UserSummaryDto(n.Author.Id, n.Author.FullName, n.Author.Email!), n.CreatedAt);

    /// <summary>
    /// Builds a parameterised, case-insensitive LIKE pattern with wildcard characters escaped,
    /// so user input is never interpreted as SQL or as a LIKE wildcard.
    /// </summary>
    public static string ContainsPattern(string term) =>
        "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[") + "%";
}
