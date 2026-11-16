using AuraOps.Application.Abstractions;
using AuraOps.Application.Common;
using AuraOps.Application.Dtos;
using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AuraOps.Infrastructure.Identity;

internal sealed class UserRoleLookup(AppDbContext db) : IUserRoleLookup
{
    public Task<bool> IsActiveTechnicianAsync(string userId, CancellationToken ct) =>
        TechniciansQuery().AnyAsync(u => u.Id == userId, ct);

    public async Task<IReadOnlyList<UserSummaryDto>> GetActiveTechniciansAsync(CancellationToken ct) =>
        await TechniciansQuery().OrderBy(u => u.FullName)
            .Select(u => new UserSummaryDto(u.Id, u.FullName, u.Email!)).ToListAsync(ct);

    private IQueryable<ApplicationUser> TechniciansQuery() =>
        from u in db.Users.AsNoTracking()
        join ur in db.UserRoles on u.Id equals ur.UserId
        join r in db.Roles on ur.RoleId equals r.Id
        where r.Name == Roles.Technician && u.IsActive
        select u;
}

internal sealed class UserAdminService(
    UserManager<ApplicationUser> userManager, AppDbContext db, ILogger<UserAdminService> logger) : IUserAdminService
{
    public async Task<CredentialCheckResult> CheckCredentialsAsync(string email, string password, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(email.Trim());
        if (user is null)
        {
            // Hash anyway so response timing does not reveal whether the account exists.
            userManager.PasswordHasher.HashPassword(new ApplicationUser(), password);
            return new(LoginOutcome.InvalidCredentials, null, null);
        }
        if (await userManager.IsLockedOutAsync(user)) return new(LoginOutcome.LockedOut, null, null);
        if (!await userManager.CheckPasswordAsync(user, password))
        {
            await userManager.AccessFailedAsync(user);
            // Log the user id only — never the password or the attempted e-mail.
            logger.LogWarning("Failed sign-in for user {UserId}", user.Id);
            return new(LoginOutcome.InvalidCredentials, null, null);
        }
        if (!user.IsActive) return new(LoginOutcome.Inactive, null, null);

        await userManager.ResetAccessFailedCountAsync(user);
        return new(LoginOutcome.Success, await ToDtoAsync(user), await userManager.GetSecurityStampAsync(user));
    }

    public async Task<UserDto?> FindAsync(string id, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(id);
        return user is null ? null : await ToDtoAsync(user);
    }

    public async Task<IReadOnlyList<UserDto>> ListAsync(string? search, string? role, CancellationToken ct)
    {
        var users = db.Users.AsNoTracking().AsQueryable();
        if (search.Clean() is { } s)
        {
            var p = Mapping.ContainsPattern(s);
            users = users.Where(u => EF.Functions.Like(u.FullName, p, "\\") || EF.Functions.Like(u.Email, p, "\\"));
        }

        var rows = await (
            from u in users
            select new
            {
                u.Id, u.FullName, u.Email, u.IsActive, u.CreatedAt,
                Roles = (from ur in db.UserRoles join r in db.Roles on ur.RoleId equals r.Id
                         where ur.UserId == u.Id select r.Name).ToList()
            }).OrderBy(u => u.FullName).ToListAsync(ct);

        return rows
            .Where(u => role.Clean() is not { } rf || u.Roles.Contains(rf))
            .Select(u => new UserDto(u.Id, u.FullName, u.Email!, u.IsActive, u.Roles!, u.CreatedAt))
            .ToList();
    }

    public async Task<UserDto> CreateAsync(CreateUserRequest input, CancellationToken ct)
    {
        EnsureValidRole(input.Role);
        var email = input.Email.Trim().ToLowerInvariant();
        if (await userManager.FindByEmailAsync(email) is not null)
            throw new ConflictException($"A user with e-mail '{email}' already exists.");

        var user = new ApplicationUser
        {
            UserName = email, Email = email, EmailConfirmed = true,
            FullName = input.FullName.Trim(), IsActive = true,
        };
        ThrowIfFailed(await userManager.CreateAsync(user, input.Password), "Password");
        ThrowIfFailed(await userManager.AddToRoleAsync(user, input.Role), "Role");
        logger.LogInformation("User {UserId} created with role {Role}", user.Id, input.Role);
        return await ToDtoAsync(user);
    }

    public async Task<UserDto> UpdateAsync(string id, UpdateUserRequest input, CancellationToken ct)
    {
        EnsureValidRole(input.Role);
        var user = await userManager.FindByIdAsync(id) ?? throw new NotFoundException("User", id);
        var currentRoles = await userManager.GetRolesAsync(user);

        if (currentRoles.Contains(Roles.Admin) && (input.Role != Roles.Admin || !input.IsActive))
        {
            var activeAdmins = (await userManager.GetUsersInRoleAsync(Roles.Admin)).Count(u => u.IsActive);
            if (activeAdmins <= 1)
                throw new ConflictException("At least one active administrator is required.");
        }

        if (input.Role != Roles.Technician && currentRoles.Contains(Roles.Technician))
        {
            var hasActiveWork = await db.WorkOrders.AnyAsync(w => w.AssignedTechnicianId == id
                && w.Status != Domain.Enums.WorkOrderStatus.Completed && w.Status != Domain.Enums.WorkOrderStatus.Cancelled, ct);
            if (hasActiveWork)
                throw new ConflictException("Re-assign this technician's active work orders before changing their role.");
        }

        var roleChanged = !currentRoles.SequenceEqual([input.Role]);
        var deactivated = user.IsActive && !input.IsActive;

        user.FullName = input.FullName.Trim();
        user.IsActive = input.IsActive;
        ThrowIfFailed(await userManager.UpdateAsync(user), "User");

        if (roleChanged)
        {
            ThrowIfFailed(await userManager.RemoveFromRolesAsync(user, currentRoles), "Role");
            ThrowIfFailed(await userManager.AddToRoleAsync(user, input.Role), "Role");
        }
        // Rotating the security stamp invalidates existing access tokens for this user.
        if (roleChanged || deactivated) await userManager.UpdateSecurityStampAsync(user);

        logger.LogInformation("User {UserId} updated (role {Role}, active {IsActive})", id, input.Role, input.IsActive);
        return await ToDtoAsync(user);
    }

    public async Task ResetPasswordAsync(string id, string newPassword, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(id) ?? throw new NotFoundException("User", id);
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        ThrowIfFailed(await userManager.ResetPasswordAsync(user, token, newPassword), "NewPassword");
        await userManager.SetLockoutEndDateAsync(user, null);
        logger.LogInformation("Password reset for user {UserId}", id);
    }

    public async Task<bool> IsSessionValidAsync(string userId, string? securityStamp, CancellationToken ct) =>
        await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsActive && u.SecurityStamp == securityStamp, ct);

    private async Task<UserDto> ToDtoAsync(ApplicationUser u) =>
        new(u.Id, u.FullName, u.Email!, u.IsActive, (await userManager.GetRolesAsync(u)).ToList(), u.CreatedAt);

    private static void EnsureValidRole(string role)
    {
        if (!Roles.All.Contains(role))
            throw new ValidationException("Role", $"Role must be one of: {string.Join(", ", Roles.All)}.");
    }

    private static void ThrowIfFailed(IdentityResult result, string field)
    {
        if (!result.Succeeded)
            throw new ValidationException(field, string.Join(" ", result.Errors.Select(e => e.Description)));
    }
}
