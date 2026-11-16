using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using AuraOps.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace AuraOps.UnitTests.Services;

public class WorkflowServiceTests : IDisposable
{
    private readonly TestDb _t = new();
    private static readonly CancellationToken Ct = CancellationToken.None;
    public void Dispose() => _t.Dispose();

    [Fact]
    public async Task Full_workflow_updates_request_asset_and_history()
    {
        var asset = await _t.CreateAssetAsync();
        _t.Act(TestDb.ViewerId, Roles.Viewer);
        var request = await _t.CreateRequestAsync(asset.AssetId);

        _t.Act(TestDb.AdminId, Roles.Admin);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct)).WorkOrder;
        await _t.WorkOrders.AssignAsync(wo.WorkOrderId, new AssignWorkOrderRequest { TechnicianId = TestDb.TechId }, Ct);

        _t.Act(TestDb.TechId, Roles.Technician);
        _t.Clock.Advance(TimeSpan.FromHours(1));
        var started = await _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.InProgress }, Ct);
        Assert.Equal([WorkOrderStatus.Completed], started.AllowedTransitions);
        Assert.Equal(AssetStatus.UnderMaintenance, (await _t.Assets.GetAsync(asset.AssetId, Ct)).Status);

        await _t.WorkOrders.AddNoteAsync(wo.WorkOrderId, new AddWorkOrderNoteRequest { Text = "Replaced seal." }, Ct);
        _t.Clock.Advance(TimeSpan.FromHours(2));
        var done = await _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId,
            new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.Completed, Remarks = "Fixed" }, Ct);

        Assert.Equal(WorkOrderStatus.Completed, done.WorkOrder.Status);
        Assert.Equal(_t.Clock.UtcNow, done.WorkOrder.CompletionDate);
        Assert.Single(done.Notes);
        Assert.Equal(RequestStatus.Resolved, (await _t.Requests.GetAsync(request.RequestId, Ct)).Status);
        Assert.Equal(AssetStatus.Operational, (await _t.Assets.GetAsync(asset.AssetId, Ct)).Status);

        var history = await _t.Assets.GetHistoryAsync(asset.AssetId, new PageQuery { PageSize = 50 }, Ct);
        var actions = history.Items.Select(h => h.Action).ToList();
        Assert.Contains(HistoryAction.AssetCreated, actions);
        Assert.Contains(HistoryAction.RequestCreated, actions);
        Assert.Contains(HistoryAction.WorkOrderCreated, actions);
        Assert.Contains(HistoryAction.WorkOrderAssigned, actions);
        Assert.Contains(HistoryAction.WorkOrderNoteAdded, actions);
        Assert.Equal(2, actions.Count(a => a == HistoryAction.WorkOrderStatusChanged));
        Assert.Contains(history.Items, h => h.Action == HistoryAction.WorkOrderStatusChanged && h.PerformedBy.Id == TestDb.TechId);
    }

    [Fact]
    public async Task Request_for_nonexistent_asset_is_a_validation_error()
    {
        var ex = await Assert.ThrowsAsync<ValidationException>(() => _t.CreateRequestAsync(4242));
        Assert.True(ex.Errors.ContainsKey("AssetId"));
    }

    [Fact]
    public async Task Database_rejects_request_referencing_missing_asset()
    {
        _t.Db.MaintenanceRequests.Add(new MaintenanceRequest
        {
            AssetId = 999, CreatedByUserId = TestDb.AdminId, Title = "x", Description = "y",
        });
        _t.Db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON;");
        await Assert.ThrowsAsync<DbUpdateException>(() => _t.Db.SaveChangesAsync());
    }

    [Fact]
    public async Task Database_allows_only_one_active_work_order_per_request()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct);

        // Bypass the service rule to prove the filtered unique index also enforces it.
        _t.Db.ChangeTracker.Clear();
        _t.Db.WorkOrders.Add(new WorkOrder { RequestId = request.RequestId });
        await Assert.ThrowsAsync<DbUpdateException>(() => _t.Db.SaveChangesAsync());
    }

    [Fact]
    public async Task Second_active_work_order_is_rejected_by_service()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct);
        await Assert.ThrowsAsync<ConflictException>(() =>
            _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct));
    }

    [Fact]
    public async Task Cancelled_work_order_allows_a_new_one_and_requeues_request()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct)).WorkOrder;
        await _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.Cancelled, Remarks = "Wrong asset" }, Ct);

        Assert.Equal(RequestStatus.Approved, (await _t.Requests.GetAsync(request.RequestId, Ct)).Status);
        var second = await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId, AssignedTechnicianId = TestDb.TechId }, Ct);
        Assert.Equal(WorkOrderStatus.Assigned, second.WorkOrder.Status);
    }

    [Fact]
    public async Task Technician_cannot_update_work_assigned_to_someone_else()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId, AssignedTechnicianId = TestDb.TechId }, Ct)).WorkOrder;

        _t.Act(TestDb.OtherTechId, Roles.Technician);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.InProgress }, Ct));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _t.WorkOrders.AddNoteAsync(wo.WorkOrderId, new AddWorkOrderNoteRequest { Text = "hi there" }, Ct));
        await Assert.ThrowsAsync<ForbiddenException>(() => _t.WorkOrders.GetAsync(wo.WorkOrderId, Ct));
        Assert.Equal(0, (await _t.WorkOrders.ListAsync(new WorkOrderQuery(), Ct)).TotalCount);
    }

    [Fact]
    public async Task Technician_cannot_cancel_own_work()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId, AssignedTechnicianId = TestDb.TechId }, Ct)).WorkOrder;
        _t.Act(TestDb.TechId, Roles.Technician);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.Cancelled, Remarks = "nope" }, Ct));
    }

    [Fact]
    public async Task Assigning_a_non_technician_is_rejected()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct)).WorkOrder;
        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            _t.WorkOrders.AssignAsync(wo.WorkOrderId, new AssignWorkOrderRequest { TechnicianId = TestDb.ViewerId }, Ct));
        Assert.True(ex.Errors.ContainsKey("TechnicianId"));
    }

    [Fact]
    public async Task Invalid_transition_surfaces_as_domain_exception()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId, AssignedTechnicianId = TestDb.TechId }, Ct)).WorkOrder;
        await Assert.ThrowsAsync<InvalidStatusTransitionException>(() =>
            _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.Completed }, Ct));
    }

    [Fact]
    public async Task Only_admin_can_change_request_status()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        _t.Act(TestDb.TechId, Roles.Technician);
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _t.Requests.UpdateStatusAsync(request.RequestId, new UpdateRequestStatus { Status = RequestStatus.Approved }, Ct));
    }

    [Fact]
    public async Task Duplicate_asset_code_is_a_conflict_case_insensitively()
    {
        await _t.CreateAssetAsync("pmp-9");
        await Assert.ThrowsAsync<ConflictException>(() => _t.CreateAssetAsync("PMP-9"));
    }

    [Fact]
    public async Task Archive_is_blocked_while_work_is_active_and_hides_asset_from_list()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest { RequestId = request.RequestId }, Ct)).WorkOrder;
        await Assert.ThrowsAsync<ConflictException>(() => _t.Assets.ArchiveAsync(asset.AssetId, Ct));

        await _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.Cancelled, Remarks = "n/a" }, Ct);
        await _t.Assets.ArchiveAsync(asset.AssetId, Ct);

        Assert.Equal(0, (await _t.Assets.ListAsync(new AssetQuery(), Ct)).TotalCount);
        Assert.Equal(1, (await _t.Assets.ListAsync(new AssetQuery { IncludeArchived = true }, Ct)).TotalCount);
        await Assert.ThrowsAsync<ValidationException>(() => _t.CreateRequestAsync(asset.AssetId));
    }

    [Fact]
    public async Task History_is_append_only()
    {
        var asset = await _t.CreateAssetAsync();
        var entry = await _t.Db.MaintenanceHistory.FirstAsync(h => h.AssetId == asset.AssetId);
        entry.Notes = "tampered";
        await Assert.ThrowsAsync<InvalidOperationException>(() => _t.Db.SaveChangesAsync());

        _t.Db.ChangeTracker.Clear();
        _t.Db.MaintenanceHistory.Remove(await _t.Db.MaintenanceHistory.FirstAsync());
        await Assert.ThrowsAsync<InvalidOperationException>(() => _t.Db.SaveChangesAsync());
    }

    [Fact]
    public async Task Search_treats_wildcards_literally_and_paginates()
    {
        for (var i = 0; i < 25; i++) await _t.CreateAssetAsync($"A-{i:00}");
        await _t.Assets.CreateAsync(new AssetUpsertRequest { AssetCode = "PCT", Name = "100% duty fan", Category = "Fan", Location = "Roof" }, Ct);

        var page2 = await _t.Assets.ListAsync(new AssetQuery { Page = 2, PageSize = 10, SortBy = "code", Desc = false }, Ct);
        Assert.Equal(26, page2.TotalCount);
        Assert.Equal(3, page2.TotalPages);
        Assert.Equal("A-10", page2.Items[0].AssetCode);

        var pct = await _t.Assets.ListAsync(new AssetQuery { Search = "%" }, Ct);
        Assert.Equal("PCT", Assert.Single(pct.Items).AssetCode);
        var underscore = await _t.Assets.ListAsync(new AssetQuery { Search = "_" }, Ct);
        Assert.Empty(underscore.Items);
    }

    [Fact]
    public async Task Dashboard_counts_reflect_workflow()
    {
        var asset = await _t.CreateAssetAsync();
        var request = await _t.CreateRequestAsync(asset.AssetId);
        await _t.CreateRequestAsync(asset.AssetId);
        var wo = (await _t.WorkOrders.CreateAsync(new CreateWorkOrderRequest
        {
            RequestId = request.RequestId, AssignedTechnicianId = TestDb.TechId, DueDate = _t.Clock.UtcNow.AddHours(-1),
        }, Ct)).WorkOrder;
        _t.Act(TestDb.TechId, Roles.Technician);
        await _t.WorkOrders.UpdateStatusAsync(wo.WorkOrderId, new UpdateWorkOrderStatusRequest { Status = WorkOrderStatus.InProgress }, Ct);

        var d = await _t.Dashboard.GetSummaryAsync(new DashboardQuery(), Ct);
        Assert.Equal(1, d.TotalAssets);
        Assert.Equal(1, d.AssetsUnderMaintenance);
        Assert.Equal(2, d.OpenRequests);
        Assert.Equal(1, d.InProgressWorkOrders);
        Assert.Equal(1, d.OverdueWorkOrders);
        Assert.Equal(1, d.TechnicianWorkload.Single(t => t.Technician.Id == TestDb.TechId).InProgress);
        Assert.NotEmpty(d.RecentActivity);
    }
}
