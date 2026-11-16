using AuraOps.Api.Auth;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuraOps.Api.Controllers;

[ApiController]
[Route("api/maintenance-requests")]
[Authorize]
public sealed class MaintenanceRequestsController(MaintenanceRequestService requests) : ControllerBase
{
    /// <summary>List maintenance requests with filters.</summary>
    /// <remarks>sortBy: priority | status | createdAt (default).</remarks>
    [HttpGet]
    public Task<PagedResult<MaintenanceRequestDto>> List([FromQuery] RequestQuery query, CancellationToken ct) =>
        requests.ListAsync(query, ct);

    /// <summary>Get request details.</summary>
    [HttpGet("{id:int}")]
    public Task<MaintenanceRequestDto> Get(int id, CancellationToken ct) => requests.GetAsync(id, ct);

    /// <summary>Report an issue against an asset. Any signed-in user may report a problem.</summary>
    [HttpPost]
    [ProducesResponseType<MaintenanceRequestDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MaintenanceRequestDto>> Create(CreateMaintenanceRequest input, CancellationToken ct)
    {
        var created = await requests.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.RequestId }, created);
    }

    /// <summary>Review / prioritise a request (Admin).</summary>
    /// <remarks>Allowed manual transitions: Open → InReview/Approved/Rejected; InReview → Approved/Rejected/Open;
    /// Approved → Rejected/InReview; Resolved/Rejected → Open. InProgress and Resolved are driven by work orders.</remarks>
    [HttpPatch("{id:int}/status")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<MaintenanceRequestDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<MaintenanceRequestDto> UpdateStatus(int id, UpdateRequestStatus input, CancellationToken ct) =>
        requests.UpdateStatusAsync(id, input, ct);
}
