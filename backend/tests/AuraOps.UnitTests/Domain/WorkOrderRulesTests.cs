using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using AuraOps.Domain.Exceptions;

namespace AuraOps.UnitTests.Domain;

public class WorkOrderRulesTests
{
    private static readonly DateTime T0 = new(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc);

    private static WorkOrder Assigned()
    {
        var wo = new WorkOrder();
        wo.AssignTo("tech-1", T0);
        return wo;
    }

    [Fact]
    public void New_work_order_is_open_and_unassigned()
    {
        var wo = new WorkOrder();
        Assert.Equal(WorkOrderStatus.Open, wo.Status);
        Assert.Null(wo.AssignedTechnicianId);
        Assert.True(wo.IsActive);
    }

    [Fact]
    public void Assigning_an_open_work_order_moves_it_to_assigned()
    {
        var wo = Assigned();
        Assert.Equal(WorkOrderStatus.Assigned, wo.Status);
        Assert.Equal("tech-1", wo.AssignedTechnicianId);
        Assert.Equal(T0, wo.AssignedAt);
    }

    [Fact]
    public void Reassigning_in_progress_work_keeps_status()
    {
        var wo = Assigned();
        wo.ChangeStatus(WorkOrderStatus.InProgress, T0.AddHours(1));
        wo.AssignTo("tech-2", T0.AddHours(2));
        Assert.Equal(WorkOrderStatus.InProgress, wo.Status);
        Assert.Equal("tech-2", wo.AssignedTechnicianId);
    }

    [Fact]
    public void Starting_work_records_start_date()
    {
        var wo = Assigned();
        wo.ChangeStatus(WorkOrderStatus.InProgress, T0.AddHours(1));
        Assert.Equal(WorkOrderStatus.InProgress, wo.Status);
        Assert.Equal(T0.AddHours(1), wo.StartDate);
    }

    [Fact]
    public void Completed_work_order_must_have_completion_timestamp()
    {
        var wo = Assigned();
        wo.ChangeStatus(WorkOrderStatus.InProgress, T0.AddHours(1));
        wo.ChangeStatus(WorkOrderStatus.Completed, T0.AddHours(3), "Done");

        Assert.Equal(WorkOrderStatus.Completed, wo.Status);
        Assert.Equal(T0.AddHours(3), wo.CompletionDate);
        Assert.Equal("Done", wo.Remarks);
        Assert.False(wo.IsActive);
    }

    [Fact]
    public void Cannot_complete_without_starting()
    {
        var wo = Assigned();
        var ex = Assert.Throws<InvalidStatusTransitionException>(() => wo.ChangeStatus(WorkOrderStatus.Completed, T0));
        Assert.Equal(WorkOrderStatus.Assigned, ex.From);
        Assert.Null(wo.CompletionDate);
    }

    [Fact]
    public void Cannot_start_unassigned_work()
    {
        var wo = new WorkOrder();
        Assert.Throws<InvalidStatusTransitionException>(() => wo.ChangeStatus(WorkOrderStatus.InProgress, T0));
    }

    [Fact]
    public void Assigned_status_can_only_be_reached_through_assignment()
    {
        var wo = new WorkOrder();
        Assert.Throws<DomainException>(() => wo.ChangeStatus(WorkOrderStatus.Assigned, T0));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    public void Cancelling_requires_remarks(string? remarks)
    {
        var wo = Assigned();
        Assert.Throws<DomainException>(() => wo.ChangeStatus(WorkOrderStatus.Cancelled, T0, remarks));
        Assert.Equal(WorkOrderStatus.Assigned, wo.Status);
    }

    [Fact]
    public void Completed_and_cancelled_are_terminal()
    {
        var done = Assigned();
        done.ChangeStatus(WorkOrderStatus.InProgress, T0);
        done.ChangeStatus(WorkOrderStatus.Completed, T0);
        Assert.Throws<InvalidStatusTransitionException>(() => done.ChangeStatus(WorkOrderStatus.InProgress, T0));
        Assert.Throws<DomainException>(() => done.AssignTo("tech-2", T0));

        var cancelled = new WorkOrder();
        cancelled.ChangeStatus(WorkOrderStatus.Cancelled, T0, "Duplicate");
        Assert.Throws<InvalidStatusTransitionException>(() => cancelled.ChangeStatus(WorkOrderStatus.Completed, T0));
    }

    [Theory]
    [InlineData(WorkOrderStatus.Open, WorkOrderStatus.Assigned, true)]
    [InlineData(WorkOrderStatus.Open, WorkOrderStatus.InProgress, false)]
    [InlineData(WorkOrderStatus.Assigned, WorkOrderStatus.InProgress, true)]
    [InlineData(WorkOrderStatus.InProgress, WorkOrderStatus.Completed, true)]
    [InlineData(WorkOrderStatus.InProgress, WorkOrderStatus.Assigned, false)]
    [InlineData(WorkOrderStatus.Completed, WorkOrderStatus.Cancelled, false)]
    [InlineData(WorkOrderStatus.Open, WorkOrderStatus.Cancelled, true)]
    public void Transition_table(WorkOrderStatus from, WorkOrderStatus to, bool allowed) =>
        Assert.Equal(allowed, WorkOrder.CanTransition(from, to));
}

public class MaintenanceRequestRulesTests
{
    private static readonly DateTime T0 = new(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void New_request_is_open_and_can_get_a_work_order()
    {
        var r = new MaintenanceRequest();
        Assert.Equal(RequestStatus.Open, r.Status);
        Assert.True(r.CanCreateWorkOrder);
    }

    [Fact]
    public void Creating_a_work_order_moves_request_in_progress_and_blocks_another()
    {
        var r = new MaintenanceRequest();
        r.MarkInProgress(T0);
        Assert.Equal(RequestStatus.InProgress, r.Status);
        Assert.False(r.CanCreateWorkOrder);
        Assert.Throws<DomainException>(() => r.MarkInProgress(T0));
    }

    [Fact]
    public void In_progress_status_cannot_be_changed_manually()
    {
        var r = new MaintenanceRequest();
        r.MarkInProgress(T0);
        Assert.Throws<InvalidStatusTransitionException>(() => r.ChangeStatus(RequestStatus.Rejected, T0));
    }

    [Fact]
    public void Rejected_request_cannot_get_a_work_order_until_reopened()
    {
        var r = new MaintenanceRequest();
        r.ChangeStatus(RequestStatus.Rejected, T0);
        Assert.False(r.CanCreateWorkOrder);
        r.ChangeStatus(RequestStatus.Open, T0.AddDays(1));
        Assert.True(r.CanCreateWorkOrder);
        Assert.Equal(T0.AddDays(1), r.UpdatedAt);
    }

    [Fact]
    public void Cancelled_work_returns_request_to_approved_queue()
    {
        var r = new MaintenanceRequest();
        r.MarkInProgress(T0);
        r.ReturnToQueue(T0);
        Assert.Equal(RequestStatus.Approved, r.Status);
    }

    [Fact]
    public void Archived_asset_rejects_changes()
    {
        var a = new Asset { AssetCode = "X" };
        a.Archive(T0);
        Assert.True(a.IsArchived);
        Assert.Equal(AssetStatus.Decommissioned, a.Status);
        Assert.Throws<DomainException>(a.EnsureNotArchived);
        Assert.Throws<DomainException>(() => a.Archive(T0));
    }
}
