using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AuraOps.IntegrationTests;

/// <summary>
/// Boots the real API (middleware, auth, validation, EF Core) against a throw-away SQLite file database
/// seeded with the demo users and data.
/// </summary>
public sealed class AuraOpsFactory : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@auraops.local";
    public const string AdminPassword = "Admin123!";
    public const string DemoPassword = "Demo123!";
    public const string Tech1 = "tech1@auraops.local";
    public const string Tech2 = "tech2@auraops.local";
    public const string Viewer = "manager@auraops.local";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"auraops-it-{Guid.NewGuid():N}.db");

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
        builder.UseSetting("Database:Provider", "Sqlite");
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-0123456789abcdef");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:DemoData", "true");
        builder.UseSetting("Seed:DemoPassword", DemoPassword);
        builder.UseSetting("Https:Redirect", "false");
        builder.UseSetting("Swagger:Enabled", "true");
        builder.UseSetting("RateLimiting:LoginPermitPerMinute", "1000");
    }

    public async Task<HttpClient> ClientForAsync(string email, string password)
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        return client;
    }

    public Task<HttpClient> AdminAsync() => ClientForAsync(AdminEmail, AdminPassword);
    public Task<HttpClient> TechAsync(string email = Tech1) => ClientForAsync(email, DemoPassword);
    public Task<HttpClient> ViewerAsync() => ClientForAsync(Viewer, DemoPassword);

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm" })
            try { File.Delete(f); } catch { /* best effort */ }
    }
}

public static class HttpExtensions
{
    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(AuraOpsFactory.Json);

    public static Task<HttpResponseMessage> PatchJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PatchAsync(url, JsonContent.Create(body, options: AuraOpsFactory.Json));
}
