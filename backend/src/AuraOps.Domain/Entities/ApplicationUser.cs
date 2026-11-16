using Microsoft.AspNetCore.Identity;

namespace AuraOps.Domain.Entities;

/// <summary>
/// Application user. Password hashing, lockout and security stamps are handled by
/// ASP.NET Core Identity — plaintext passwords are never stored.
/// </summary>
public class ApplicationUser : IdentityUser
{
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
