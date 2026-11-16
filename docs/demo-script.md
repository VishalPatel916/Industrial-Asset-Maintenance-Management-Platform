# Demo script (≈10 minutes)

Setup: `docker compose up --build` (or the local quick start in the README). Demo data is seeded.

| # | Who | Steps | What to point out |
|---|---|---|---|
| 1 | — | Explain the problem: equipment data scattered in spreadsheets/e-mail; untracked repairs. Three roles: Admin, Technician, Viewer/Manager. | |
| 2 | Viewer `manager@auraops.local` | Open the dashboard; filter by location. | Summary cards, work-order status breakdown, technician workload, recent activity — all from one `GET /api/dashboard/summary`. |
| 3 | Admin `admin@auraops.local` | Assets → **New asset** (`VLV-200`). Try a duplicate code. | Client + server validation; 409 problem-details for the duplicate. |
| 4 | Admin | On the asset page → **Report issue** (priority High). | Request appears in the list; history row `RequestCreated`. |
| 5 | Admin | Requests → approve → **Create work order** → assign *Priya Sharma*. | Work order `Assigned`; request `InProgress`. Only one active work order per request (DB filtered unique index). |
| 6 | Technician `tech1@auraops.local` | Work orders shows **only her** work. Open it → **Start** → add a note → **Complete** with remarks. | Asset flips to `UnderMaintenance` while in progress, back to `Operational` on completion. Completion timestamp set automatically. |
| 7 | Technician | Try to open the dashboard / a colleague's work order. | 403 — enforced server-side, not just hidden in the UI. |
| 8 | Viewer | Asset details → timeline. Dashboard counts updated. | Append-only `MaintenanceHistory` with who/when for every step. |
| 9 | — | Swagger (`/swagger`): `PATCH /api/work-orders/{id}/status`. | DTO (`UpdateWorkOrderStatusRequest`), validation attributes, `CanWorkOnOrders` policy + ownership check in `WorkOrderService`, transition table in `WorkOrder`. |
| 10 | — | Database: Assets 1─* Requests 1─* WorkOrders 1─* Notes; History references all. | **Trade-off:** request→work orders is 1-to-many (keeps the record of failed/cancelled attempts) with a DB rule of one *active* order, instead of a simpler 1-to-1. |

Postman alternative: import `postman/AuraOps.postman_collection.json` and run the *Auth* and
*Workflow* folders with the Collection Runner.

## Accurate claims for this repository

Implemented and covered by automated tests: ASP.NET Core Web API, EF Core with SQL Server
migrations (verified against SQL Server 2022 in Docker), ASP.NET Core Identity + JWT with role
policies, validation and problem-details errors, maintenance-history tracking, server-side paging
and filtering, React front end, xUnit unit + integration tests, Vitest component tests, Docker
Compose, GitHub Actions CI workflow.

Not done yet — don't claim it: Azure deployment (plan and workflow are prepared, see
`docs/azure-deployment.md`), CI runs on GitHub (the workflow has not run until the repo is pushed),
production use.
