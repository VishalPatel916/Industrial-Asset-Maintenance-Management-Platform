using System.ComponentModel.DataAnnotations;
using AuraOps.Application.Common;
using AuraOps.Domain.Enums;

namespace AuraOps.Application.Dtos;

// DTOs are the only shapes that cross the API boundary. Entities are never serialised
// directly, and input DTOs only contain fields a client may set (prevents over-posting).

#region Users / auth

public sealed record UserSummaryDto(string Id, string FullName, string Email);

public sealed record UserDto(string Id, string FullName, string Email, bool IsActive, IReadOnlyList<string> Roles, DateTime CreatedAt);

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(256)] public string Email { get; init; } = string.Empty;
    [Required, MaxLength(128)] public string Password { get; init; } = string.Empty;
}

public sealed record LoginResponse(string AccessToken, DateTime ExpiresAt, UserDto User);

public sealed class CreateUserRequest
{
    [Required, MaxLength(100)] public string FullName { get; init; } = string.Empty;
    [Required, EmailAddress, MaxLength(256)] public string Email { get; init; } = string.Empty;
    [Required, MinLength(8), MaxLength(128)] public string Password { get; init; } = string.Empty;
    [Required] public string Role { get; init; } = string.Empty;
}

public sealed class UpdateUserRequest
{
    [Required, MaxLength(100)] public string FullName { get; init; } = string.Empty;
    [Required] public string Role { get; init; } = string.Empty;
    public bool IsActive { get; init; } = true;
}

public sealed class ResetPasswordRequest
{
    [Required, MinLength(8), MaxLength(128)] public string NewPassword { get; init; } = string.Empty;
}

#endregion

#region Assets

public sealed record AssetDto(
    int AssetId, string AssetCode, string Name, string Category, string Location,
    AssetStatus Status, DateOnly? PurchaseDate, string? Description,
    DateTime CreatedAt, DateTime? UpdatedAt, bool IsArchived, int OpenRequestCount);

public sealed class AssetUpsertRequest
{
    [Required, MaxLength(50), RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-_.]*$",
        ErrorMessage = "Asset code may contain letters, digits, '-', '_' and '.'.")]
    public string AssetCode { get; init; } = string.Empty;

    [Required, MaxLength(150)] public string Name { get; init; } = string.Empty;
    [Required, MaxLength(80)] public string Category { get; init; } = string.Empty;
    [Required, MaxLength(120)] public string Location { get; init; } = string.Empty;
    [EnumDataType(typeof(AssetStatus))] public AssetStatus Status { get; init; } = AssetStatus.Operational;
    public DateOnly? PurchaseDate { get; init; }
    [MaxLength(2000)] public string? Description { get; init; }
}

public sealed class AssetQuery : PageQuery
{
    /// <summary>Matches code, name or description.</summary>
    public string? Search { get; set; }
    public string? Category { get; set; }
    public string? Location { get; set; }
    public AssetStatus? Status { get; set; }
    public bool IncludeArchived { get; set; }
}

public sealed record AssetFacetsDto(IReadOnlyList<string> Categories, IReadOnlyList<string> Locations);

public sealed record HistoryEntryDto(
    long HistoryId, int AssetId, string AssetCode, int? RequestId, int? WorkOrderId,
    HistoryAction Action, string Notes, UserSummaryDto PerformedBy, DateTime Timestamp);

#endregion

#region Maintenance requests

public sealed record MaintenanceRequestDto(
    int RequestId, int AssetId, string AssetCode, string AssetName, string Title, string Description,
    Priority Priority, RequestStatus Status, UserSummaryDto CreatedBy,
    DateTime CreatedAt, DateTime? UpdatedAt, int? ActiveWorkOrderId, int WorkOrderCount);

public sealed class CreateMaintenanceRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Choose an asset.")] public int AssetId { get; init; }
    [Required, MinLength(3), MaxLength(150)] public string Title { get; init; } = string.Empty;
    [Required, MinLength(10), MaxLength(4000)] public string Description { get; init; } = string.Empty;
    [EnumDataType(typeof(Priority))] public Priority Priority { get; init; } = Priority.Medium;
}

public sealed class UpdateRequestStatus
{
    [EnumDataType(typeof(RequestStatus))] public RequestStatus Status { get; init; }
    [EnumDataType(typeof(Priority))] public Priority? Priority { get; init; }
    [MaxLength(1000)] public string? Comment { get; init; }
}

public sealed class RequestQuery : PageQuery
{
    public string? Search { get; set; }
    public RequestStatus? Status { get; set; }
    public Priority? Priority { get; set; }
    public int? AssetId { get; set; }
    public string? Category { get; set; }
    public string? Location { get; set; }
}

#endregion

#region Work orders

public sealed record WorkOrderNoteDto(int NoteId, string Text, UserSummaryDto Author, DateTime CreatedAt);

public sealed record WorkOrderDto(
    int WorkOrderId, int RequestId, string RequestTitle, int AssetId, string AssetCode, string AssetName,
    Priority Priority, WorkOrderStatus Status, UserSummaryDto? AssignedTechnician,
    DateTime CreatedAt, DateTime? AssignedAt, DateTime? StartDate, DateTime? CompletionDate,
    DateTime? DueDate, string? Remarks, int NoteCount);

public sealed record WorkOrderDetailDto(
    WorkOrderDto WorkOrder, string RequestDescription, IReadOnlyList<WorkOrderNoteDto> Notes,
    IReadOnlyList<WorkOrderStatus> AllowedTransitions, IReadOnlyList<HistoryEntryDto> History);

public sealed class CreateWorkOrderRequest
{
    [Range(1, int.MaxValue)] public int RequestId { get; init; }
    /// <summary>Optional: assign immediately.</summary>
    public string? AssignedTechnicianId { get; init; }
    public DateTime? DueDate { get; init; }
}

public sealed class AssignWorkOrderRequest
{
    [Required] public string TechnicianId { get; init; } = string.Empty;
}

public sealed class UpdateWorkOrderStatusRequest
{
    [EnumDataType(typeof(WorkOrderStatus))] public WorkOrderStatus Status { get; init; }
    [MaxLength(2000)] public string? Remarks { get; init; }
}

public sealed class AddWorkOrderNoteRequest
{
    [Required, MinLength(2), MaxLength(4000)] public string Text { get; init; } = string.Empty;
}

public sealed class WorkOrderQuery : PageQuery
{
    public string? Search { get; set; }
    public WorkOrderStatus? Status { get; set; }
    public Priority? Priority { get; set; }
    public string? TechnicianId { get; set; }
    public int? AssetId { get; set; }
    public int? RequestId { get; set; }
    public string? Category { get; set; }
    public string? Location { get; set; }
    /// <summary>When true, only active (not completed/cancelled) work orders.</summary>
    public bool ActiveOnly { get; set; }
}

#endregion

#region Dashboard

public sealed record CountByKey(string Key, int Count);

public sealed record TechnicianWorkload(UserSummaryDto Technician, int Assigned, int InProgress, int CompletedLast30Days);

public sealed record DashboardSummaryDto(
    int TotalAssets, int ActiveAssets, int AssetsUnderMaintenance, int AssetsOutOfService,
    int OpenRequests, int CriticalOpenRequests,
    int OpenWorkOrders, int InProgressWorkOrders, int CompletedWorkOrders, int OverdueWorkOrders,
    double? AverageCompletionHours,
    IReadOnlyList<CountByKey> WorkOrdersByStatus,
    IReadOnlyList<CountByKey> RequestsByPriority,
    IReadOnlyList<CountByKey> AssetsByCategory,
    IReadOnlyList<TechnicianWorkload> TechnicianWorkload,
    IReadOnlyList<HistoryEntryDto> RecentActivity);

public sealed class DashboardQuery
{
    public string? Category { get; set; }
    public string? Location { get; set; }
}

#endregion
