namespace AuraOps.Domain;

/// <summary>Role names used by authorization policies and seeded at startup.</summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string Technician = "Technician";
    /// <summary>Read-only "Viewer / Manager" role.</summary>
    public const string Viewer = "Viewer";

    public static readonly string[] All = [Admin, Technician, Viewer];
}
