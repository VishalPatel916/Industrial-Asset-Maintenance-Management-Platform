using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using AuraOps.Api.Auth;
using AuraOps.Api.Middleware;
using AuraOps.Application.Abstractions;
using AuraOps.Domain;
using AuraOps.Infrastructure;
using AuraOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------- Core services ----------
builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
{
    ctx.ProblemDetails.Instance ??= ctx.HttpContext.Request.Path;
    ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
});
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddInfrastructure(config);
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();

// ---------- Authentication (JWT bearer over ASP.NET Core Identity users) ----------
builder.Services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
builder.Services.AddSingleton<JwtTokenService>();
var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = jwt.Issuer,
            ValidateAudience = true, ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true, IssuerSigningKey = jwt.GetKey(),
            ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = JwtRegisteredClaimNames.Name, RoleClaimType = "role",
        };
        o.Events = new JwtBearerEvents
        {
            // Reject tokens for users that were deactivated, had their role changed, or signed out.
            OnTokenValidated = async ctx =>
            {
                var sub = ctx.Principal?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
                var stamp = ctx.Principal?.FindFirst(AuraClaims.SecurityStamp)?.Value;
                var users = ctx.HttpContext.RequestServices.GetRequiredService<IUserAdminService>();
                if (sub is null || !await users.IsSessionValidAsync(sub, stamp, ctx.HttpContext.RequestAborted))
                    ctx.Fail("Session is no longer valid.");
            },
        };
    });

builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(Policies.AdminOnly, p => p.RequireRole(Roles.Admin))
    .AddPolicy(Policies.CanViewDashboard, p => p.RequireRole(Roles.Admin, Roles.Viewer))
    .AddPolicy(Policies.CanWorkOnOrders, p => p.RequireRole(Roles.Admin, Roles.Technician));

// ---------- Rate limiting for the sign-in endpoint ----------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = config.GetValue("RateLimiting:LoginPermitPerMinute", 10),
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
    o.OnRejected = async (ctx, ct) =>
    {
        var problems = ctx.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx.HttpContext,
            ProblemDetails = new ProblemDetails { Status = 429, Title = "Too many requests", Detail = "Too many sign-in attempts. Wait a minute and try again." },
        });
    };
});

// ---------- CORS: only the configured front-end origin(s) ----------
var allowedOrigins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(allowedOrigins).AllowAnyHeader().WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")));

// ---------- Health checks ----------
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database");

// ---------- Swagger / OpenAPI ----------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "AuraOps API",
        Version = "v1",
        Description = "Industrial asset & maintenance management. Sign in with POST /api/auth/login, then click Authorize and paste the access token.",
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT",
        Description = "JWT access token from /api/auth/login",
    });
    c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", doc)] = [] });
    var xml = Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
    if (File.Exists(xml)) c.IncludeXmlComments(xml);
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear(); // behind Azure App Service / container ingress
    o.KnownProxies.Clear();
});

var app = builder.Build();

// ---------- Pipeline ----------
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages(); // problem-details bodies for bare 401/403/404
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    ctx.Response.Headers.XFrameOptions = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

if (app.Environment.IsDevelopment() || config.GetValue<bool>("Swagger:Enabled"))
{
    app.UseSwagger();
    app.UseSwaggerUI(o => o.DocumentTitle = "AuraOps API");
}
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}
if (config.GetValue("Https:Redirect", !app.Environment.IsDevelopment()))
    app.UseHttpsRedirection();

app.UseCors("frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();
app.MapGet("/", () => Results.Redirect("/swagger")).AllowAnonymous().ExcludeFromDescription();

if (config.GetValue("Database:InitializeOnStartup", true))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
}

app.Run();

public partial class Program;
