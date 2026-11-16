using AuraOps.Api.Auth;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuraOps.Api.Controllers;

[ApiController]
[Route("api/assets")]
[Authorize]
public sealed class AssetsController(AssetService assets) : ControllerBase
{
    /// <summary>List assets with paging, search and filters.</summary>
    /// <remarks>sortBy: code | name | category | location | status | createdAt (default). Archived assets are excluded unless includeArchived=true.</remarks>
    [HttpGet]
    public Task<PagedResult<AssetDto>> List([FromQuery] AssetQuery query, CancellationToken ct) =>
        assets.ListAsync(query, ct);

    /// <summary>Distinct categories and locations, for filter drop-downs.</summary>
    [HttpGet("facets")]
    public Task<AssetFacetsDto> Facets(CancellationToken ct) => assets.GetFacetsAsync(ct);

    /// <summary>Get asset details.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<AssetDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<AssetDto> Get(int id, CancellationToken ct) => assets.GetAsync(id, ct);

    /// <summary>Create an asset (Admin).</summary>
    [HttpPost]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType<AssetDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AssetDto>> Create(AssetUpsertRequest input, CancellationToken ct)
    {
        var created = await assets.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.AssetId }, created);
    }

    /// <summary>Update an asset (Admin).</summary>
    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOnly)]
    public Task<AssetDto> Update(int id, AssetUpsertRequest input, CancellationToken ct) =>
        assets.UpdateAsync(id, input, ct);

    /// <summary>Archive an asset (Admin). Assets are soft-deleted so their history is retained.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOnly)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Archive(int id, CancellationToken ct)
    {
        await assets.ArchiveAsync(id, ct);
        return NoContent();
    }

    /// <summary>Asset maintenance history, newest first.</summary>
    [HttpGet("{id:int}/history")]
    public Task<PagedResult<HistoryEntryDto>> History(int id, [FromQuery] PageQuery paging, CancellationToken ct) =>
        assets.GetHistoryAsync(id, paging, ct);
}
