using AuraOps.Api.Auth;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuraOps.Api.Controllers;

[ApiController]
[Route("api/work-orders")]
[Authorize]
public sealed class WorkOrdersController(WorkOrderService workOrders) : ControllerBase
{
    /// <summary>List work orders. Technicians only see work assigned to them.</summary>
    /// <remarks>technicianId may be a user id or "unassigned". sortBy: priority | status | dueDate | createdAt (default).</remarks>
    [HttpGet]
    public Task<PagedResult<WorkOrderDto>> List([FromQuery] WorkOrderQuery query, CancellationToken ct) =>
        workOrders.ListAsync(query, ct);

    /// <summary>Work-order details including notes, timeline and the transitions the caller may perform.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<WorkOrderDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<WorkOrderDetailDto> Get(int id, CancellationToken ct) => workOrders.GetAsync(id, ct);

    /// <summary>Create a work order from a maintenance request (Admin). Optionally assign immediately.</summary>
    [HttpPost]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<WorkOrderDetailDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<WorkOrderDetailDto>> Create(CreateWorkOrderRequest input, CancellationToken ct)
    {
        var created = await workOrders.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.WorkOrder.WorkOrderId }, created);
    }

    /// <summary>Assign or re-assign a technician (Admin).</summary>
    [HttpPatch("{id:int}/assign")]
    [Authorize(Policy = Policies.AdminOnly)]
    public Task<WorkOrderDetailDto> Assign(int id, AssignWorkOrderRequest input, CancellationToken ct) =>
        workOrders.AssignAsync(id, input, ct);

    /// <summary>Update progress (assigned technician or Admin). Cancelling requires Admin and remarks.</summary>
    /// <remarks>Assigned → InProgress → Completed; Open/Assigned/InProgress → Cancelled (Admin).</remarks>
    [HttpPatch("{id:int}/status")]
    [Authorize(Policy = Policies.CanWorkOnOrders)]
    public Task<WorkOrderDetailDto> UpdateStatus(int id, UpdateWorkOrderStatusRequest input, CancellationToken ct) =>
        workOrders.UpdateStatusAsync(id, input, ct);

    /// <summary>Add a work note (assigned technician or Admin).</summary>
    [HttpPost("{id:int}/notes")]
    [Authorize(Policy = Policies.CanWorkOnOrders)]
    [ProducesResponseType<WorkOrderNoteDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<WorkOrderNoteDto>> AddNote(int id, AddWorkOrderNoteRequest input, CancellationToken ct)
    {
        var note = await workOrders.AddNoteAsync(id, input, ct);
        return CreatedAtAction(nameof(Get), new { id }, note);
    }
}
