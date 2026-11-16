using AuraOps.Application.Dtos;

namespace AuraOps.Application.Abstractions;

public enum LoginOutcome { Success, InvalidCredentials, LockedOut, Inactive }

public sealed record CredentialCheckResult(LoginOutcome Outcome, UserDto? User, string? SecurityStamp);

/// <summary>Authentication and administrator user management (implemented over ASP.NET Core Identity).</summary>
public interface IUserAdminService
{
    Task<CredentialCheckResult> CheckCredentialsAsync(string email, string password, CancellationToken ct);
    Task<UserDto?> FindAsync(string id, CancellationToken ct);
    Task<IReadOnlyList<UserDto>> ListAsync(string? search, string? role, CancellationToken ct);
    Task<UserDto> CreateAsync(CreateUserRequest input, CancellationToken ct);
    Task<UserDto> UpdateAsync(string id, UpdateUserRequest input, CancellationToken ct);
    Task ResetPasswordAsync(string id, string newPassword, CancellationToken ct);
    /// <summary>Used on every authenticated request to reject tokens of deactivated or changed users.</summary>
    Task<bool> IsSessionValidAsync(string userId, string? securityStamp, CancellationToken ct);
}
