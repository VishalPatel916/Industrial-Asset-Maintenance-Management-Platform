using AuraOps.Application.Abstractions;
using AuraOps.Application.Dtos;
using AuraOps.Application.Services;
using AuraOps.Domain;
using AuraOps.Domain.Entities;
using AuraOps.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace AuraOps.UnitTests.Services;

/// <summary>A real relational database (SQLite in-memory) so constraints and FKs are exercised.</summary>
public sealed class TestDb : IDisposable
{
    private readonly SqliteConnection _connection;
    public AppDbContext Db { get; }
    public FakeUser User { get; } = new();
    public FixedClock Clock { get; } = new();
    public FakeRoleLookup Lookup { get; } = new();

    public const string AdminId = "admin-1";
    public const string TechId = "tech-1";
    public const string OtherTechId = "tech-2";
    public const string ViewerId = "viewer-1";

    public TestDb()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        Db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        Db.Database.EnsureCreated();

        foreach (var (id, name) in new[] { (AdminId, "Admin"), (TechId, "Tech One"), (OtherTechId, "Tech Two"), (ViewerId, "Viewer") })
            Db.Users.Add(new ApplicationUser { Id = id, UserName = id, Email = $"{id}@test", FullName = name });
        Db.SaveChanges();
        Lookup.Technicians.UnionWith([TechId, OtherTechId]);
        Act(AdminId, Roles.Admin);
    }

    public void Act(string userId, string role)
    {
        User.UserId = userId;
        User.Roles = [role];
        Db.ChangeTracker.Clear();
    }

    private HistoryRecorder History => new(Db, User, Clock);
    public AssetService Assets => new(Db, History, Clock, NullLogger<AssetService>.Instance);
    public MaintenanceRequestService Requests => new(Db, User, History, Clock, NullLogger<MaintenanceRequestService>.Instance);
    public WorkOrderService WorkOrders => new(Db, User, Lookup, History, Clock, NullLogger<WorkOrderService>.Instance);
    public DashboardService Dashboard => new(Db, Lookup, Clock);

    public async Task<AssetDto> CreateAssetAsync(string code = "PMP-1") =>
        await Assets.CreateAsync(new AssetUpsertRequest
        {
            AssetCode = code, Name = "Pump", Category = "Pump", Location = "Plant A",
        }, CancellationToken.None);

    public async Task<MaintenanceRequestDto> CreateRequestAsync(int assetId) =>
        await Requests.CreateAsync(new CreateMaintenanceRequest
        {
            AssetId = assetId, Title = "Leak", Description = "Seal leaking at the drive end.",
        }, CancellationToken.None);

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}

public sealed class FakeUser : ICurrentUser
{
    public string UserId { get; set; } = "";
    public string[] Roles { get; set; } = [];
    public bool IsInRole(string role) => Roles.Contains(role);
}

public sealed class FixedClock : IClock
{
    public DateTime UtcNow { get; set; } = new(2026, 3, 1, 9, 0, 0, DateTimeKind.Utc);
    public void Advance(TimeSpan by) => UtcNow = UtcNow.Add(by);
}

public sealed class FakeRoleLookup : IUserRoleLookup
{
    public HashSet<string> Technicians { get; } = [];
    public Task<bool> IsActiveTechnicianAsync(string userId, CancellationToken ct) => Task.FromResult(Technicians.Contains(userId));
    public Task<IReadOnlyList<UserSummaryDto>> GetActiveTechniciansAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<UserSummaryDto>>(Technicians.Select(t => new UserSummaryDto(t, t, t)).ToList());
}
