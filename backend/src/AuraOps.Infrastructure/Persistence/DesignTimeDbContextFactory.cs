using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AuraOps.Infrastructure.Persistence;

/// <summary>
/// Used only by `dotnet ef` tooling. Migrations target SQL Server / Azure SQL.
/// Override the connection with the AURAOPS_MIGRATIONS_CONNECTION environment variable
/// when running `dotnet ef database update` or generating an idempotent script.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("AURAOPS_MIGRATIONS_CONNECTION")
            ?? "Server=localhost,1433;Database=AuraOps;User Id=sa;Password=AuraOps_Dev_Passw0rd;TrustServerCertificate=True";
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection, sql => sql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName))
            .Options;
        return new AppDbContext(options);
    }
}
