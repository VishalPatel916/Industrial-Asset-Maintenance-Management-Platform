# Azure deployment plan

## Target topology

| Azure service | Use |
|---|---|
| Azure App Service (Linux, .NET 10) | ASP.NET Core API |
| Azure SQL Database | Relational data (EF Core migrations) |
| Azure Static Web Apps | React build (`frontend/dist`) |
| Application Insights (optional) | Telemetry, traces, performance |
| Azure Key Vault (optional) | JWT signing key and connection string via Key Vault references |

## One-time setup (Azure CLI)

```bash
RG=auraops-rg; LOC=westeurope; SQL=auraops-sql-$RANDOM; APP=auraops-api-$RANDOM
az group create -n $RG -l $LOC

# Azure SQL
az sql server create -g $RG -n $SQL -l $LOC -u sqladmin -p '<strong-admin-password>'
az sql db create -g $RG -s $SQL -n AuraOps --service-objective Basic
az sql server firewall-rule create -g $RG -s $SQL -n AllowAzure --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# API
az appservice plan create -g $RG -n auraops-plan --is-linux --sku B1
az webapp create -g $RG -p auraops-plan -n $APP --runtime "DOTNETCORE:10.0"
az webapp update -g $RG -n $APP --https-only true

# Front end
az staticwebapp create -g $RG -n auraops-web -l $LOC
```

Create a **least-privilege application login** for runtime (see [`sql/create-app-user.sql`](sql/create-app-user.sql)).
The admin login is used only by the migration step.

## App Service configuration (no secrets in source control)

| Setting | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `Database__Provider` | `SqlServer` |
| `Database__InitializeOnStartup` | `false` (migrations run in the pipeline; set `true` only to seed the first admin once) |
| `ConnectionStrings__Default` | app-user connection string (or Key Vault reference) |
| `Jwt__SigningKey` | random ≥32 chars (Key Vault reference recommended) |
| `Cors__AllowedOrigins__0` | `https://<your-static-web-app>.azurestaticapps.net` |
| `Seed__AdminEmail` / `Seed__AdminPassword` | first run only, then remove |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | optional |

## Pipeline

[`.github/workflows/deploy-azure.yml`](../.github/workflows/deploy-azure.yml) (manual
`workflow_dispatch`): test → publish → **`dotnet ef database update`** against Azure SQL (controlled
migration step) → deploy to App Service → `/health` smoke test → build React with
`VITE_API_BASE_URL` → deploy to Static Web Apps. CI (`ci.yml`) also produces an idempotent
`migrate.sql` artifact for DBA-reviewed deployments.

