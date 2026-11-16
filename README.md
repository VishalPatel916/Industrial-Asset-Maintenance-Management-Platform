# AuraOps — Industrial Asset & Maintenance Management Platform

Full-stack web application for managing industrial equipment and its maintenance lifecycle:
register assets, report problems, turn them into work orders, assign technicians, track repairs,
and review each asset's maintenance history.

**Stack:** C# · ASP.NET Core 10 Web API · Entity Framework Core 10 · SQL Server / Azure SQL ·
ASP.NET Core Identity + JWT · React 18 (Vite) · xUnit · Vitest · Swagger/OpenAPI · Docker · GitHub Actions

> Independent portfolio project inspired by industrial asset-management workflows. It is not a
> Hexagon product and is not affiliated with Hexagon.

## Features

| Area | What it does |
|---|---|
| Auth & roles | Sign in/out, JWT bearer tokens, Admin / Technician / Viewer (manager) roles, policy + ownership checks, account lockout, login rate limiting, token revocation on logout/deactivation/role change |
| Assets | Create, view, edit, search, filter, sort, archive (soft delete); code, name, category, location, status, purchase date, description |
| Maintenance requests | Report an issue against an asset with priority; admin review (InReview / Approved / Rejected / re-open) and re-prioritisation |
| Work orders | Create from a request, assign/re-assign technician, `Open → Assigned → InProgress → Completed` (+ `Cancelled`), notes, due dates, start/completion timestamps |
| Workflow automation | Request goes `InProgress` / `Resolved` with its work order; asset goes `UnderMaintenance` / `Operational` with the work |
| Dashboard | Asset totals, open/critical requests, open/in-progress/completed/overdue work orders, average repair time, breakdowns, technician workload, recent activity; category/location filters |
| Audit trail | Append-only maintenance history: who did what, when, on which asset/request/work order |
| Users | Admin user management: create, change role, deactivate, reset password |

## Quick start (local, no database server needed)

Prerequisites: .NET SDK 10, Node.js 20+.

```bash
# 1. API — uses SQLite in Development and seeds demo data
cd backend/src/AuraOps.Api
dotnet run                      # http://localhost:5080  (Swagger: http://localhost:5080/swagger)

# 2. Front end (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173  (proxies /api to :5080)
```

### Demo accounts (development seed only)

| Role | E-mail | Password |
|---|---|---|
| Admin | `admin@auraops.local` | `Admin123!` |
| Technician | `tech1@auraops.local` / `tech2@auraops.local` | `Demo123!` |
| Viewer / Manager | `manager@auraops.local` | `Demo123!` |

## Full stack with SQL Server (Docker)

```bash
cp .env.example .env            # set strong passwords and a JWT signing key
docker compose up --build
```

* App: http://localhost:8080 · API/Swagger: http://localhost:5080/swagger · SQL Server: `localhost,1433`
* The API applies EF Core migrations and seeds on startup (`Database:InitializeOnStartup`).

To run the API from source against SQL Server instead of SQLite use the `sqlserver` launch profile,
or set `Database__Provider=SqlServer` and `ConnectionStrings__Default`.

## Tests

```bash
cd backend && dotnet test       # xUnit: domain rules, services on real SQLite, HTTP integration tests
cd frontend && npm test         # Vitest + Testing Library: form validation and components
```

| Level | Examples |
|---|---|
| Unit (domain) | Completed work order always has a completion timestamp; illegal transitions throw; cancel needs remarks |
| Service + database | Request can't reference a missing asset (service *and* FK); only one active work order per request (filtered unique index); history is append-only; LIKE wildcards in search are escaped |
| API integration | 401 without token; Viewer gets 403 creating an asset; validation problem-details shape; full create → report → assign → start → note → complete → history → dashboard workflow; deactivated user's token rejected immediately |
| Front end | Login/request/asset form validation, server field-error mapping, role guards |
| API collection | `postman/AuraOps.postman_collection.json` — workflow + negative cases (also runs under `newman`) |

## Database migrations

Migrations target SQL Server and live in `backend/src/AuraOps.Infrastructure/Persistence/Migrations`.

```bash
cd backend
dotnet tool restore
dotnet ef migrations add <Name> -p src/AuraOps.Infrastructure -s src/AuraOps.Api -o Persistence/Migrations
AURAOPS_MIGRATIONS_CONNECTION="Server=...;Database=AuraOps;..." \
  dotnet ef database update -p src/AuraOps.Infrastructure -s src/AuraOps.Api
dotnet ef migrations script --idempotent -p src/AuraOps.Infrastructure -s src/AuraOps.Api -o migrate.sql
```

## Configuration

| Key | Purpose |
|---|---|
| `Database:Provider` | `SqlServer` (default) or `Sqlite` |
| `ConnectionStrings:Default` | Database connection |
| `Jwt:SigningKey` | ≥ 32 characters; supply via environment / Key Vault, never commit |
| `Jwt:AccessTokenMinutes` | Token lifetime (default 480) |
| `Cors:AllowedOrigins` | Front-end origin(s) allowed to call the API |
| `Seed:AdminEmail`, `Seed:AdminPassword` | Bootstrap admin, created only if no admin exists |
| `Seed:DemoData`, `Seed:DemoPassword` | Demo users and data |
| `Database:InitializeOnStartup` | Migrate + seed at startup (default `true`) |
| `Swagger:Enabled` | Expose Swagger outside Development |

## Repository layout

```
backend/
  AuraOps.slnx
  src/AuraOps.Api/             controllers, auth/JWT, error handling, Program.cs
  src/AuraOps.Application/     services (use cases), DTOs, paging, mapping, ports
  src/AuraOps.Domain/          entities, enums, status-transition rules
  src/AuraOps.Infrastructure/  EF Core DbContext, configurations, migrations, Identity, seeding
  tests/AuraOps.UnitTests/     domain + service tests
  tests/AuraOps.IntegrationTests/  HTTP tests with WebApplicationFactory
frontend/src/                  api/, components/, pages/, hooks/, context/, App.jsx
docs/                          architecture, API spec, Azure plan, demo script, SQL
postman/                       Postman collection
.github/workflows/             ci.yml, deploy-azure.yml (manual)
docker-compose.yml
```

## Documentation

* [Architecture & design decisions](docs/architecture.md)
* [REST API specification](docs/api-specification.md) (and Swagger at `/swagger`)
* [Azure deployment plan](docs/azure-deployment.md)
* [Demo script](docs/demo-script.md)

## Status

| Phase | State |
|---|---|
| 0–5: backend, workflow, security, front end, tests, docs | Implemented and tested locally |
| SQL Server | Migrations and the full workflow checked against SQL Server 2022 in Docker |
| CI (GitHub Actions) | Workflow written; runs once the repository is pushed to GitHub |
| 6: Azure (App Service, Azure SQL, Static Web Apps) | **Planned.** Workflow and runbook prepared; not deployed |
