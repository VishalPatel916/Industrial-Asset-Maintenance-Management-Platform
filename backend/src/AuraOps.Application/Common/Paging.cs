using Microsoft.EntityFrameworkCore;

namespace AuraOps.Application.Common;

public class PageQuery
{
    public const int MaxPageSize = 100;
    private int _page = 1;
    private int _pageSize = 20;

    public int Page { get => _page; set => _page = value < 1 ? 1 : value; }
    public int PageSize { get => _pageSize; set => _pageSize = value < 1 ? 20 : Math.Min(value, MaxPageSize); }
    /// <summary>Sort field name; each list endpoint documents the fields it accepts.</summary>
    public string? SortBy { get; set; }
    public bool Desc { get; set; } = true;
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public static class PagingExtensions
{
    /// <summary>Server-side pagination: count + Skip/Take executed in SQL.</summary>
    public static async Task<PagedResult<T>> ToPagedAsync<T>(
        this IQueryable<T> query, PageQuery page, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip((page.Page - 1) * page.PageSize).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }

    /// <summary>Normalises a free-text filter: trims and treats blank as "no filter".</summary>
    public static string? Clean(this string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
