using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace AuraOps.IntegrationTests;

public class ApiTests(AuraOpsFactory factory) : IClassFixture<AuraOpsFactory>
{
    private static readonly object NewAsset = new
    {
        assetCode = $"IT-{Guid.NewGuid():N}"[..20], name = "Integration Pump", category = "Pump",
        location = "Plant Z", status = "Operational",
    };

    [Fact]
    public async Task Health_is_anonymous_and_healthy()
    {
        var response = await factory.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Swagger_document_lists_endpoints()
    {
        var doc = await factory.CreateClient().GetStringAsync("/swagger/v1/swagger.json");
        Assert.Contains("/api/work-orders/{id}/assign", doc);
        Assert.Contains("bearer", doc, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("/api/assets")]
    [InlineData("/api/maintenance-requests")]
    [InlineData("/api/work-orders")]
    [InlineData("/api/dashboard/summary")]
    [InlineData("/api/users")]
    public async Task Private_endpoints_return_401_without_token(string url)
    {
        var response = await factory.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401_problem()
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { email = AuraOpsFactory.AdminEmail, password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.False((await response.JsonAsync()).TryGetProperty("accessToken", out _));
    }

    [Fact]
    public async Task Viewer_cannot_create_asset()
    {
        var viewer = await factory.ViewerAsync();
        var response = await viewer.PostAsJsonAsync("/api/assets", NewAsset);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Technician_cannot_create_asset_or_view_dashboard_or_users()
    {
        var tech = await factory.TechAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await tech.PostAsJsonAsync("/api/assets", NewAsset)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tech.GetAsync("/api/dashboard/summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tech.GetAsync("/api/users")).StatusCode);
    }

    [Fact]
    public async Task Invalid_asset_returns_consistent_validation_problem()
    {
        var admin = await factory.AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/assets",
            new { assetCode = "bad code!", name = "", category = "c", location = "l" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal(400, problem.GetProperty("status").GetInt32());
        var errors = problem.GetProperty("errors");
        Assert.True(errors.TryGetProperty("AssetCode", out _));
        Assert.True(errors.TryGetProperty("Name", out _));
        Assert.True(problem.TryGetProperty("traceId", out _));
    }

    [Fact]
    public async Task Admin_creates_asset_and_gets_201_with_location()
    {
        var admin = await factory.AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/assets", new
        {
            assetCode = "it-created-1", name = "Created", category = "Pump", location = "Plant Z",
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        var body = await response.JsonAsync();
        Assert.Equal("IT-CREATED-1", body.GetProperty("assetCode").GetString()); // normalised

        var duplicate = await admin.PostAsJsonAsync("/api/assets", new
        {
            assetCode = "IT-CREATED-1", name = "Dup", category = "Pump", location = "Plant Z",
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Unknown_resource_returns_404_problem()
    {
        var admin = await factory.AdminAsync();
        var response = await admin.GetAsync("/api/work-orders/987654");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("987654", (await response.JsonAsync()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Request_for_missing_asset_is_rejected()
    {
        var viewer = await factory.ViewerAsync();
        var response = await viewer.PostAsJsonAsync("/api/maintenance-requests",
            new { assetId = 999999, title = "Broken", description = "It is broken somewhere.", priority = "High" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Paging_and_filters_are_applied_server_side()
    {
        var admin = await factory.AdminAsync();
        var page = await (await admin.GetAsync("/api/assets?pageSize=3&page=1&sortBy=code&desc=false")).JsonAsync();
        Assert.Equal(3, page.GetProperty("items").GetArrayLength());
        Assert.True(page.GetProperty("totalCount").GetInt32() >= 10);

        var pumps = await (await admin.GetAsync("/api/assets?category=Pump&pageSize=100")).JsonAsync();
        Assert.All(pumps.GetProperty("items").EnumerateArray(),
            a => Assert.Equal("Pump", a.GetProperty("category").GetString()));
    }

    /// <summary>The "definition of done" workflow from the project blueprint, end to end over HTTP.</summary>
    [Fact]
    public async Task Core_workflow_end_to_end()
    {
        var admin = await factory.AdminAsync();
        var tech = await factory.TechAsync(AuraOpsFactory.Tech1);
        var otherTech = await factory.TechAsync(AuraOpsFactory.Tech2);
        var viewer = await factory.ViewerAsync();

        // 1. Admin creates an asset
        var asset = await (await admin.PostAsJsonAsync("/api/assets", new
        {
            assetCode = "E2E-001", name = "E2E Compressor", category = "Compressor", location = "Plant E2E",
        })).JsonAsync();
        var assetId = asset.GetProperty("assetId").GetInt32();

        // 2. An authenticated user reports an issue
        var reqResponse = await viewer.PostAsJsonAsync("/api/maintenance-requests",
            new { assetId, title = "Pressure drop", description = "Output pressure falls under load.", priority = "Critical" });
        Assert.Equal(HttpStatusCode.Created, reqResponse.StatusCode);
        var requestId = (await reqResponse.JsonAsync()).GetProperty("requestId").GetInt32();

        // 3. Admin creates a work order and assigns a technician
        var techId = (await (await tech.GetAsync("/api/auth/me")).JsonAsync()).GetProperty("id").GetString();
        var woResponse = await admin.PostAsJsonAsync("/api/work-orders", new { requestId });
        Assert.Equal(HttpStatusCode.Created, woResponse.StatusCode);
        var woId = (await woResponse.JsonAsync()).GetProperty("workOrder").GetProperty("workOrderId").GetInt32();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await tech.PatchJsonAsync($"/api/work-orders/{woId}/assign", new { technicianId = techId })).StatusCode);
        var assigned = await admin.PatchJsonAsync($"/api/work-orders/{woId}/assign", new { technicianId = techId });
        Assert.Equal(HttpStatusCode.OK, assigned.StatusCode);

        // Other technician can neither see nor change it
        Assert.Equal(HttpStatusCode.Forbidden, (await otherTech.GetAsync($"/api/work-orders/{woId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await otherTech.PatchJsonAsync($"/api/work-orders/{woId}/status", new { status = "InProgress" })).StatusCode);
        var otherList = await (await otherTech.GetAsync("/api/work-orders?pageSize=100")).JsonAsync();
        Assert.DoesNotContain(otherList.GetProperty("items").EnumerateArray(),
            w => w.GetProperty("workOrderId").GetInt32() == woId);

        // Viewer (read-only) cannot progress work
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.PatchJsonAsync($"/api/work-orders/{woId}/status", new { status = "InProgress" })).StatusCode);

        // 4. Technician sees the assigned work and starts it
        var myList = await (await tech.GetAsync("/api/work-orders?pageSize=100")).JsonAsync();
        Assert.Contains(myList.GetProperty("items").EnumerateArray(), w => w.GetProperty("workOrderId").GetInt32() == woId);
        var started = await tech.PatchJsonAsync($"/api/work-orders/{woId}/status", new { status = "InProgress" });
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);

        // 5. Technician adds notes and completes
        var note = await tech.PostAsJsonAsync($"/api/work-orders/{woId}/notes", new { text = "Replaced inlet valve." });
        Assert.Equal(HttpStatusCode.Created, note.StatusCode);
        var completed = await (await tech.PatchJsonAsync($"/api/work-orders/{woId}/status",
            new { status = "Completed", remarks = "Pressure restored." })).JsonAsync();
        Assert.Equal("Completed", completed.GetProperty("workOrder").GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, completed.GetProperty("workOrder").GetProperty("completionDate").ValueKind);

        // Terminal state: further transitions are a 409
        Assert.Equal(HttpStatusCode.Conflict,
            (await tech.PatchJsonAsync($"/api/work-orders/{woId}/status", new { status = "InProgress" })).StatusCode);

        // 6. History and dashboard reflect the completed work
        var request = await (await viewer.GetAsync($"/api/maintenance-requests/{requestId}")).JsonAsync();
        Assert.Equal("Resolved", request.GetProperty("status").GetString());

        var history = await (await viewer.GetAsync($"/api/assets/{assetId}/history?pageSize=50")).JsonAsync();
        var actions = history.GetProperty("items").EnumerateArray().Select(h => h.GetProperty("action").GetString()).ToList();
        Assert.Contains("RequestCreated", actions);
        Assert.Contains("WorkOrderAssigned", actions);
        Assert.Contains("WorkOrderNoteAdded", actions);
        Assert.Contains("WorkOrderStatusChanged", actions);

        var dashboard = await (await viewer.GetAsync("/api/dashboard/summary?location=Plant%20E2E")).JsonAsync();
        Assert.Equal(1, dashboard.GetProperty("completedWorkOrders").GetInt32());
        Assert.Equal(1, dashboard.GetProperty("totalAssets").GetInt32());
    }

    [Fact]
    public async Task Deactivated_user_token_is_rejected_immediately()
    {
        var admin = await factory.AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/users", new
        {
            fullName = "Temp Viewer", email = "temp.viewer@auraops.local", password = "Passw0rd!x", role = "Viewer",
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var userId = (await created.JsonAsync()).GetProperty("id").GetString();

        var temp = await factory.ClientForAsync("temp.viewer@auraops.local", "Passw0rd!x");
        Assert.Equal(HttpStatusCode.OK, (await temp.GetAsync("/api/assets")).StatusCode);

        var update = await admin.PutAsJsonAsync($"/api/users/{userId}", new { fullName = "Temp Viewer", role = "Viewer", isActive = false });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await temp.GetAsync("/api/assets")).StatusCode);

        var relogin = await factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { email = "temp.viewer@auraops.local", password = "Passw0rd!x" });
        Assert.Equal(HttpStatusCode.Unauthorized, relogin.StatusCode);
    }

    [Fact]
    public async Task Weak_password_is_rejected_on_user_creation()
    {
        var admin = await factory.AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/users", new
        {
            fullName = "Weak", email = "weak@auraops.local", password = "alllowercase", role = "Viewer",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Cannot_remove_last_admin()
    {
        var admin = await factory.AdminAsync();
        var me = await (await admin.GetAsync("/api/auth/me")).JsonAsync();
        var response = await admin.PutAsJsonAsync($"/api/users/{me.GetProperty("id").GetString()}",
            new { fullName = "System Administrator", role = "Viewer", isActive = true });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Asset_history_honours_paging_and_returns_utc_timestamps()
    {
        var admin = await factory.AdminAsync();
        var assets = await (await admin.GetAsync("/api/assets?search=PMP-001")).JsonAsync();
        var id = assets.GetProperty("items")[0].GetProperty("assetId").GetInt32();

        var page = await (await admin.GetAsync($"/api/assets/{id}/history?page=2&pageSize=2")).JsonAsync();
        Assert.Equal(2, page.GetProperty("page").GetInt32());
        Assert.Equal(2, page.GetProperty("pageSize").GetInt32());
        Assert.True(page.GetProperty("items").GetArrayLength() <= 2);
        var timestamp = page.GetProperty("items")[0].GetProperty("timestamp").GetString();
        Assert.EndsWith("Z", timestamp);
    }

    [Fact]
    public async Task Work_orders_can_be_filtered_by_request()
    {
        var admin = await factory.AdminAsync();
        var all = await (await admin.GetAsync("/api/work-orders?pageSize=100")).JsonAsync();
        var first = all.GetProperty("items")[0];
        var requestId = first.GetProperty("requestId").GetInt32();
        var filtered = await (await admin.GetAsync($"/api/work-orders?requestId={requestId}")).JsonAsync();
        Assert.All(filtered.GetProperty("items").EnumerateArray(),
            w => Assert.Equal(requestId, w.GetProperty("requestId").GetInt32()));
    }

    [Fact]
    public async Task Logout_revokes_existing_token()
    {
        var tech2 = await factory.TechAsync(AuraOpsFactory.Tech2);
        Assert.Equal(HttpStatusCode.NoContent, (await tech2.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await tech2.GetAsync("/api/work-orders")).StatusCode);
    }
}
