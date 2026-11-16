using System.IdentityModel.Tokens.Jwt;
using AuraOps.Application.Abstractions;

namespace AuraOps.Api.Auth;

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public string UserId =>
        accessor.HttpContext?.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
        ?? throw new InvalidOperationException("No authenticated user on the current request.");

    public bool IsInRole(string role) => accessor.HttpContext?.User.IsInRole(role) ?? false;
}

public static class Policies
{
    public const string AdminOnly = nameof(AdminOnly);
    public const string CanViewDashboard = nameof(CanViewDashboard);
    public const string CanWorkOnOrders = nameof(CanWorkOnOrders);
}
