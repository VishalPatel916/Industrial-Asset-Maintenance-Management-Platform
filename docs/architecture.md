# AuraOps — Architecture

## Overview

```
React SPA (Vite)  ──HTTPS/JSON──▶  ASP.NET Core Web API  ──EF Core──▶  SQL Server / Azure SQL
  pages, forms,                    controllers → services             tables, FKs, indexes,
  API service layer                (auth, validation, rules)          check constraints
```

Request flow: React form → `fetch` (bearer token) → controller (`[Authorize]` policy, DataAnnotations
validation) → application service (business rules, role checks) → EF Core (`SaveChanges` = one
transaction) → SQL Server → DTO → JSON → React re-renders.

## Backend layers (Clean Architecture)

| Project | Responsibility | Depends on |
|---|---|---|
| `AuraOps.Domain` | Entities, enums, status-transition rules, domain exceptions, role names | Identity model types only |
| `AuraOps.Application` | Use-case services, DTOs, paging, mapping projections, ports (`IApplicationDbContext`, `ICurrentUser`, `IClock`, `IUserAdminService`) | Domain, EF Core abstractions |
| `AuraOps.Infrastructure` | `AppDbContext` (Identity + domain tables), entity configurations, migrations, Identity-backed user services, seeding | Application, Domain |
| `AuraOps.Api` | Controllers, JWT auth, authorization policies, exception → problem-details mapping, CORS, rate limiting, Swagger, health checks | Application, Infrastructure |

### Key design decisions

* **Business rules live in entities.** `WorkOrder.ChangeStatus`, `WorkOrder.AssignTo`,
  `MaintenanceRequest.ChangeStatus` own their transition tables. Services orchestrate; they never
  set a status directly. Statuses have private setters so rules can't be bypassed.
* **Rules are also enforced by the database** where it is cheap to do so:
  * filtered unique index `UX_WorkOrders_OneActivePerRequest` — one active work order per request;
  * check constraint — a `Completed` work order must have a `CompletionDate`;
  * check constraint — `Assigned`/`InProgress`/`Completed` require an assigned technician;
  * unique `AssetCode`, FKs with `Restrict` delete behaviour.
* **One request → many work orders, one active at a time.** Repeat work (a failed repair, a
  cancelled job) is a new work order on the same request; history is preserved. *Trade-off:* a
  1-to-1 model is simpler to query, but loses the record of the earlier attempt.
* **Assets are archived, not deleted** (`DELETE /api/assets/{id}` is a soft delete) so the
  maintenance timeline stays intact. Archiving is blocked while work is active.
* **Append-only history.** `MaintenanceHistory` rows are written in the same `SaveChanges` as the
  change they describe; `AppDbContext` throws if any history row is modified or deleted.
* **Asset status follows the work.** Starting a work order moves an `Operational` asset to
  `UnderMaintenance`; completing/cancelling moves it back when no other work is in progress.
* **DTOs only at the boundary.** Input DTOs contain only client-settable fields (no over-posting);
  output DTOs are produced by expression-tree projections that EF Core translates to SQL.
* **Enums stored as integers** so `ORDER BY Priority` follows business order; serialized as
  strings in JSON.
* **Provider switch.** `Database:Provider` = `SqlServer` (default; migrations) or `Sqlite`
  (zero-setup local dev and tests; schema via `EnsureCreated`). Raw SQL in filters/constraints uses
  `[brackets]`, which both engines accept.

## Security

* ASP.NET Core Identity stores users and PBKDF2 password hashes; lockout after 5 failures.
* Login issues a short-lived HS256 JWT (`sub`, `name`, `email`, `role`, `sstamp`).
* On every request `OnTokenValidated` checks the user is still active and the security stamp still
  matches — deactivation, role change and logout revoke tokens immediately.
* A fallback authorization policy requires authentication everywhere; endpoints opt out explicitly
  (`/api/auth/login`, `/health`).
* Policies: `AdminOnly`, `CanViewDashboard` (Admin, Viewer), `CanWorkOnOrders` (Admin, Technician).
  Services additionally check ownership (a technician may only touch work assigned to them).
* Login endpoint is rate limited per IP (fixed window, default 10/min).
* Errors never leak stack traces; logs never include passwords or tokens.
* CORS is restricted to configured origins; HSTS + HTTPS redirection outside development;
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` headers.
* Search uses parameterised `LIKE` with escaped wildcards — no string-concatenated SQL.

## Data model

```
Users (Identity) ─1─┐
                    ├─* MaintenanceRequests *─1─ Assets ─1─* MaintenanceHistory
                    │         │1                                 *│  *│
                    │         *                                   │   │
                    ├─* WorkOrders (AssignedTechnicianId) ─1──────┘   │
                    │         │1                                      │
                    │         *                                       │
                    └─* WorkOrderNotes                Users ─1────────┘ (PerformedBy)
```

| Table | Notes |
|---|---|
| `AspNetUsers` (+ roles tables) | `FullName`, `IsActive`, `CreatedAt` added to Identity user |
| `Assets` | unique `AssetCode`; indexes on Status, Category, Location, CreatedAt, IsArchived |
| `MaintenanceRequests` | FK Asset, FK CreatedBy; indexes on Status, Priority, CreatedAt, (AssetId, Status) |
| `WorkOrders` | FK Request, FK AssignedTechnician; filtered unique index; 2 check constraints |
| `WorkOrderNotes` | FK WorkOrder (cascade), FK Author |
| `MaintenanceHistory` | FK Asset, Request?, WorkOrder?, PerformedBy; index (AssetId, Timestamp) |

## Status machines

Work order: `Open → Assigned → InProgress → Completed`; `Open/Assigned/InProgress → Cancelled`
(admin, remarks required). Assignment is a separate operation and may be repeated while active.

Maintenance request: `Open ⇄ InReview → Approved`, any of those `→ Rejected`;
`Resolved/Rejected → Open` (re-open). `InProgress` (work order created) and `Resolved`
(work order completed) are set by the work-order workflow; cancelling the work order returns the
request to `Approved`.

## Frontend

Vite + React 18 + React Router. `src/api` holds a small fetch client (bearer token, problem-details
parsing, 401 → sign-out) and per-resource endpoint functions; `src/context/AuthContext` keeps the
session; `src/components` holds reusable table, badge, dialog and form components; `src/pages`
has one module per screen. Route guards hide screens by role, but the API remains the authority.
