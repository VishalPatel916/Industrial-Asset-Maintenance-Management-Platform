using AuraOps.Application.Abstractions;
using AuraOps.Application.Services;
using AuraOps.Domain.Entities;
using AuraOps.Infrastructure.Identity;
using AuraOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AuraOps.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, identity and application services.
    /// Database:Provider = "SqlServer" (default; SQL Server / Azure SQL) or "Sqlite" (zero-setup local dev).
    /// </summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var provider = config["Database:Provider"] ?? "SqlServer";
        var connectionString = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

        services.AddDbContext<AppDbContext>(options =>
        {
            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
                options.UseSqlite(connectionString);
            else
                options.UseSqlServer(connectionString, sql =>
                {
                    sql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName);
                    sql.EnableRetryOnFailure(maxRetryCount: 5); // transient faults are common on Azure SQL
                });
        });
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddIdentityCore<ApplicationUser>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = 8;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = true;
                o.Password.RequireUppercase = true;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

        services.AddScoped<IUserRoleLookup, UserRoleLookup>();
        services.AddScoped<IUserAdminService, UserAdminService>();
        services.AddScoped<DatabaseInitializer>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<HistoryRecorder>();
        services.AddScoped<AssetService>();
        services.AddScoped<MaintenanceRequestService>();
        services.AddScoped<WorkOrderService>();
        services.AddScoped<DashboardService>();
        return services;
    }
}
