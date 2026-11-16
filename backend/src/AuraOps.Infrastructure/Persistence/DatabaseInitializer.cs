using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AuraOps.Infrastructure.Persistence;

/// <summary>
/// Creates/migrates the schema and seeds roles, the bootstrap administrator and (optionally) demo data.
/// Seed settings:
///   Seed:AdminEmail / Seed:AdminPassword — bootstrap admin (only created if no admin exists)
///   Seed:DemoData = true                 — demo technicians, viewer, assets, requests and work orders
///   Seed:DemoPassword                    — password for the demo accounts
/// </summary>
public sealed class DatabaseInitializer(
    AppDbContext db, UserManager<ApplicationUser> userManager, RoleManager<IdentityRole> roleManager,
    IConfiguration config, ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken ct = default)
    {
        if (db.Database.IsSqlite())
            await db.Database.EnsureCreatedAsync(ct);   // SQLite: dev/test convenience
        else if (db.Database.IsRelational())
            await db.Database.MigrateAsync(ct);         // SQL Server: versioned EF Core migrations

        foreach (var role in Roles.All)
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));

        var admin = await EnsureAdminAsync();
        if (config.GetValue<bool>("Seed:DemoData") && admin is not null && !await db.Assets.AnyAsync(ct))
            await SeedDemoDataAsync(admin, ct);
    }

    private async Task<ApplicationUser?> EnsureAdminAsync()
    {
        var existing = (await userManager.GetUsersInRoleAsync(Roles.Admin)).FirstOrDefault();
        if (existing is not null) return existing;

        var email = config["Seed:AdminEmail"];
        var password = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("No administrator exists and Seed:AdminEmail/Seed:AdminPassword are not configured.");
            return null;
        }
        var admin = await CreateUserAsync(email, "System Administrator", password, Roles.Admin);
        logger.LogInformation("Bootstrap administrator {UserId} created", admin.Id);
        return admin;
    }

    private async Task<ApplicationUser> CreateUserAsync(string email, string name, string password, string role)
    {
        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FullName = name };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException("Seeding user failed: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        await userManager.AddToRoleAsync(user, role);
        return user;
    }

    private async Task SeedDemoDataAsync(ApplicationUser admin, CancellationToken ct)
    {
        var password = config["Seed:DemoPassword"] ?? throw new InvalidOperationException("Seed:DemoPassword is required for demo data.");
        var tech1 = await CreateUserAsync("tech1@auraops.local", "Priya Sharma", password, Roles.Technician);
        var tech2 = await CreateUserAsync("tech2@auraops.local", "Marcus Lee", password, Roles.Technician);
        var viewer = await CreateUserAsync("manager@auraops.local", "Elena Novak", password, Roles.Viewer);

        var now = DateTime.UtcNow;
        Asset A(string code, string name, string cat, string loc, int ageDays, string desc) => new()
        {
            AssetCode = code, Name = name, Category = cat, Location = loc, Description = desc,
            PurchaseDate = DateOnly.FromDateTime(now.AddDays(-ageDays - 400)), CreatedAt = now.AddDays(-ageDays),
        };
        var assets = new[]
        {
            A("PMP-001", "Centrifugal Pump P-101", "Pump", "Plant A / Line 1", 60, "Main cooling water feed pump."),
            A("PMP-002", "Centrifugal Pump P-102", "Pump", "Plant A / Line 2", 58, "Standby cooling water pump."),
            A("CMP-001", "Air Compressor C-201", "Compressor", "Plant A / Utilities", 55, "Rotary screw compressor, 75 kW."),
            A("CNV-001", "Conveyor Belt CV-12", "Conveyor", "Plant B / Packaging", 50, "Outbound packaging conveyor."),
            A("CNV-002", "Conveyor Belt CV-14", "Conveyor", "Plant B / Packaging", 50, "Inbound sorting conveyor."),
            A("GEN-001", "Diesel Generator G-1", "Generator", "Plant A / Utilities", 45, "Emergency backup generator, 500 kVA."),
            A("HVX-001", "Heat Exchanger HX-3", "Heat Exchanger", "Plant B / Process", 40, "Shell-and-tube exchanger."),
            A("ROB-001", "Welding Robot R-7", "Robot", "Plant B / Assembly", 35, "Six-axis welding cell."),
            A("BLR-001", "Steam Boiler B-2", "Boiler", "Plant A / Utilities", 30, "Fire-tube boiler, 10 bar."),
            A("MTR-001", "Drive Motor M-55", "Motor", "Plant B / Assembly", 20, "Induction motor driving press line."),
        };
        db.Assets.AddRange(assets);
        foreach (var a in assets)
            db.MaintenanceHistory.Add(H(a, HistoryAction.AssetCreated, $"Asset {a.AssetCode} ({a.Name}) registered.", admin, a.CreatedAt));

        MaintenanceRequest R(Asset asset, string title, string desc, Priority p, ApplicationUser by, int daysAgo)
        {
            var r = new MaintenanceRequest
            {
                Asset = asset, CreatedByUserId = by.Id, Title = title, Description = desc, Priority = p,
                CreatedAt = now.AddDays(-daysAgo),
            };
            db.MaintenanceRequests.Add(r);
            db.MaintenanceHistory.Add(H(asset, HistoryAction.RequestCreated, $"Issue reported ({p}): {title}", by, r.CreatedAt, r));
            return r;
        }

        // 1. Completed end-to-end
        var r1 = R(assets[0], "Abnormal vibration on pump bearing", "Vibration readings above 7 mm/s on the drive-end bearing during the night shift.", Priority.High, tech1, 14);
        var w1 = new WorkOrder { Request = r1, CreatedAt = now.AddDays(-13), DueDate = now.AddDays(-10) };
        r1.MarkInProgress(now.AddDays(-13));
        w1.AssignTo(tech1.Id, now.AddDays(-13));
        w1.ChangeStatus(WorkOrderStatus.InProgress, now.AddDays(-12));
        w1.Notes.Add(new WorkOrderNote { AuthorUserId = tech1.Id, Text = "Bearing inspected; outer race shows pitting. Replacing bearing.", CreatedAt = now.AddDays(-12).AddHours(2) });
        w1.ChangeStatus(WorkOrderStatus.Completed, now.AddDays(-12).AddHours(6), "Bearing replaced and pump realigned. Vibration now 2.1 mm/s.");
        r1.MarkResolved(now.AddDays(-12).AddHours(6));
        db.WorkOrders.Add(w1);
        db.MaintenanceHistory.AddRange(
            H(assets[0], HistoryAction.WorkOrderCreated, "Work order created for request.", admin, now.AddDays(-13), r1, w1),
            H(assets[0], HistoryAction.WorkOrderAssigned, $"Assigned to {tech1.FullName}.", admin, now.AddDays(-13), r1, w1),
            H(assets[0], HistoryAction.WorkOrderStatusChanged, "Status Assigned → InProgress.", tech1, now.AddDays(-12), r1, w1),
            H(assets[0], HistoryAction.WorkOrderNoteAdded, "Note: Bearing inspected; outer race shows pitting.", tech1, now.AddDays(-12).AddHours(2), r1, w1),
            H(assets[0], HistoryAction.WorkOrderStatusChanged, "Status InProgress → Completed. Bearing replaced and pump realigned.", tech1, now.AddDays(-12).AddHours(6), r1, w1));

        // 2. In progress
        var r2 = R(assets[2], "Compressor overheating alarm", "High discharge temperature alarm tripped twice this week.", Priority.Critical, viewer, 3);
        var w2 = new WorkOrder { Request = r2, CreatedAt = now.AddDays(-2), DueDate = now.AddDays(1) };
        r2.MarkInProgress(now.AddDays(-2));
        w2.AssignTo(tech2.Id, now.AddDays(-2));
        w2.ChangeStatus(WorkOrderStatus.InProgress, now.AddDays(-1));
        w2.Notes.Add(new WorkOrderNote { AuthorUserId = tech2.Id, Text = "Oil cooler fins clogged. Cleaning scheduled; ordering replacement thermostat valve.", CreatedAt = now.AddDays(-1).AddHours(3) });
        assets[2].Status = AssetStatus.UnderMaintenance;
        db.WorkOrders.Add(w2);
        db.MaintenanceHistory.AddRange(
            H(assets[2], HistoryAction.WorkOrderCreated, "Work order created for request.", admin, now.AddDays(-2), r2, w2),
            H(assets[2], HistoryAction.WorkOrderAssigned, $"Assigned to {tech2.FullName}.", admin, now.AddDays(-2), r2, w2),
            H(assets[2], HistoryAction.WorkOrderStatusChanged, "Status Assigned → InProgress.", tech2, now.AddDays(-1), r2, w2),
            H(assets[2], HistoryAction.AssetUpdated, "Status Operational → UnderMaintenance.", tech2, now.AddDays(-1), r2, w2));

        // 3. Assigned, overdue
        var r3 = R(assets[3], "Belt tracking off-centre", "Belt drifting to the left side near the tail pulley.", Priority.Medium, tech2, 6);
        var w3 = new WorkOrder { Request = r3, CreatedAt = now.AddDays(-5), DueDate = now.AddDays(-1) };
        r3.MarkInProgress(now.AddDays(-5));
        w3.AssignTo(tech1.Id, now.AddDays(-5));
        db.WorkOrders.Add(w3);
        db.MaintenanceHistory.AddRange(
            H(assets[3], HistoryAction.WorkOrderCreated, "Work order created for request.", admin, now.AddDays(-5), r3, w3),
            H(assets[3], HistoryAction.WorkOrderAssigned, $"Assigned to {tech1.FullName}.", admin, now.AddDays(-5), r3, w3));

        // 4. Open requests waiting for triage
        R(assets[5], "Generator failed weekly test start", "Generator cranked but did not start during the weekly test run.", Priority.High, viewer, 1);
        R(assets[7], "Weld seam porosity on robot cell", "QA reports porosity on seams from cell R-7 since Monday.", Priority.Medium, tech1, 2);
        var r6 = R(assets[8], "Boiler pressure gauge sticking", "Local pressure gauge needle sticks around 6 bar.", Priority.Low, tech2, 4);
        r6.ChangeStatus(RequestStatus.Approved, now.AddDays(-3));
        db.MaintenanceHistory.Add(H(assets[8], HistoryAction.RequestStatusChanged, "Request status Open → Approved.", admin, now.AddDays(-3), r6));

        assets[4].Status = AssetStatus.OutOfService;

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Demo data seeded: {AssetCount} assets", assets.Length);
    }

    private static MaintenanceHistory H(Asset asset, HistoryAction action, string notes, ApplicationUser by, DateTime at,
        MaintenanceRequest? request = null, WorkOrder? workOrder = null) => new()
    {
        Asset = asset, Action = action, Notes = notes, PerformedByUserId = by.Id, Timestamp = at,
        Request = request, WorkOrder = workOrder,
    };
}
