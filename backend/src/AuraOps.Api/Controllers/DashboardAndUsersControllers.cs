using AuraOps.Api.Auth;
using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuraOps.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize(Policy = Policies.CanViewDashboard)]
public sealed class DashboardController(DashboardService dashboard) : ControllerBase
{
    /// <summary>Dashboard counts and metrics (Manager/Viewer, Admin). Optional category/location filters.</summary>
    [HttpGet("summary")]
    public Task<DashboardSummaryDto> Summary([FromQuery] DashboardQuery query, CancellationToken ct) =>
        dashboard.GetSummaryAsync(query, ct);
}

[ApiController]
[Route("api/users")]
[Authorize(Policy = Policies.AdminOnly)]
public sealed class UsersController(IUserAdminService users, IUserRoleLookup lookup) : ControllerBase
{
    /// <summary>List users (Admin). Optional search and role filter.</summary>
    [HttpGet]
    public Task<IReadOnlyList<UserDto>> List([FromQuery] string? search, [FromQuery] string? role, CancellationToken ct) =>
        users.ListAsync(search, role, ct);

    /// <summary>Active technicians, for the assignment picker (Admin).</summary>
    [HttpGet("technicians")]
    public Task<IReadOnlyList<UserSummaryDto>> Technicians(CancellationToken ct) => lookup.GetActiveTechniciansAsync(ct);

    [HttpGet("{id}")]
    public async Task<UserDto> Get(string id, CancellationToken ct) =>
        await users.FindAsync(id, ct) ?? throw new NotFoundException("User", id);

    /// <summary>Create a user with a role (Admin).</summary>
    [HttpPost]
    [ProducesResponseType<UserDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest input, CancellationToken ct)
    {
        var user = await users.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, user);
    }

    /// <summary>Update name, role or active flag (Admin). Role changes and deactivation revoke the user's tokens.</summary>
    [HttpPut("{id}")]
    public Task<UserDto> Update(string id, UpdateUserRequest input, CancellationToken ct) => users.UpdateAsync(id, input, ct);

    /// <summary>Set a new password for a user (Admin).</summary>
    [HttpPost("{id}/reset-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResetPassword(string id, ResetPasswordRequest input, CancellationToken ct)
    {
        await users.ResetPasswordAsync(id, input.NewPassword, ct);
        return NoContent();
    }
}
