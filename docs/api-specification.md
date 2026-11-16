# AuraOps — REST API specification

Interactive documentation: run the API and open **`/swagger`** (OpenAPI 3 document at
`/swagger/v1/swagger.json`). A Postman collection is in [`postman/`](../postman).

## Conventions

* Base path `/api`; JSON bodies; property names camelCase; enums as strings (`"InProgress"`).
* Auth: `Authorization: Bearer <accessToken>` from `POST /api/auth/login`.
* Lists are paged server-side: `?page=1&pageSize=20&sortBy=…&desc=true` (max page size 100) and
  return `{ items, page, pageSize, totalCount, totalPages }`.
* Errors are RFC 7807 problem details (`application/problem+json`):

```json
{ "type": "...", "title": "Validation failed", "status": 400, "detail": "...",
  "instance": "/api/assets", "traceId": "0HN...", "errors": { "AssetCode": ["..."] } }
```

| Status | When |
|---|---|
| 200 / 201 / 204 | OK / created (with `Location`) / no content |
| 400 | DTO validation failed, or referenced entity (asset, request, technician) invalid |
| 401 | No/invalid/revoked token, bad credentials |
| 403 | Authenticated but role/ownership check failed |
| 404 | Resource not found |
| 409 | Duplicate asset code, invalid status transition, active work blocks the action |
| 429 | Login rate limit exceeded |
| 500 | Unexpected error (logged; no internals in the response) |

## Roles

| Role | Can |
|---|---|
| **Admin** | Everything: users, assets, request triage, work-order creation/assignment/cancel |
| **Technician** | See only work orders assigned to them; start, complete and add notes to them; report issues; read assets & requests |
| **Viewer** (manager) | Read assets, requests, work orders, history; dashboard; report issues |

## Endpoints

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/api/auth/login` | Sign in, get access token | Anonymous (rate limited) |
| GET | `/api/auth/me` | Current user profile | Authenticated |
| POST | `/api/auth/logout` | Revoke all of the caller's tokens | Authenticated |
| GET | `/api/assets` | List — `search, category, location, status, includeArchived`; sort `code,name,category,location,status,createdAt` | Authenticated |
| GET | `/api/assets/facets` | Distinct categories & locations | Authenticated |
| GET | `/api/assets/{id}` | Asset details | Authenticated |
| POST | `/api/assets` | Create asset | Admin |
| PUT | `/api/assets/{id}` | Update asset | Admin |
| DELETE | `/api/assets/{id}` | Archive (soft delete); 409 while work is active | Admin |
| GET | `/api/assets/{id}/history` | Maintenance timeline (paged, newest first) | Authenticated |
| GET | `/api/maintenance-requests` | List — `search, status, priority, assetId, category, location`; sort `priority,status,createdAt` | Authenticated |
| POST | `/api/maintenance-requests` | Report an issue | Authenticated |
| GET | `/api/maintenance-requests/{id}` | Request details | Authenticated |
| PATCH | `/api/maintenance-requests/{id}/status` | Change status and/or priority, optional comment | Admin |
| GET | `/api/work-orders` | List — `search, status, priority, technicianId (id or "unassigned"), assetId, category, location, activeOnly`; sort `priority,status,dueDate,createdAt` | Authenticated (technicians: own only) |
| POST | `/api/work-orders` | Create from request (optional `assignedTechnicianId`, `dueDate`) | Admin |
| GET | `/api/work-orders/{id}` | Details + notes + timeline + `allowedTransitions` for the caller | Authenticated (technicians: own only) |
| PATCH | `/api/work-orders/{id}/assign` | Assign / re-assign technician | Admin |
| PATCH | `/api/work-orders/{id}/status` | `InProgress`, `Completed`, `Cancelled` (+`remarks`) | Assigned technician / Admin (cancel: Admin) |
| POST | `/api/work-orders/{id}/notes` | Add work note | Assigned technician / Admin |
| GET | `/api/dashboard/summary` | Counts, breakdowns, workload, recent activity — `category, location` | Viewer / Admin |
| GET | `/api/users` | List users — `search, role` | Admin |
| GET | `/api/users/technicians` | Active technicians (assignment picker) | Admin |
| GET | `/api/users/{id}` | User details | Admin |
| POST | `/api/users` | Create user with role | Admin |
| PUT | `/api/users/{id}` | Update name/role/active (revokes tokens on role change/deactivation) | Admin |
| POST | `/api/users/{id}/reset-password` | Set new password | Admin |
| GET | `/health` | Liveness + database check | Anonymous |

## Main request bodies

```jsonc
// POST /api/auth/login
{ "email": "admin@auraops.local", "password": "Admin123!" }
// → { "accessToken": "eyJ...", "expiresAt": "2026-...", "user": { "id", "fullName", "email", "isActive", "roles": ["Admin"] } }

// POST/PUT /api/assets
{ "assetCode": "PMP-003", "name": "Pump P-103", "category": "Pump", "location": "Plant A / Line 3",
  "status": "Operational", "purchaseDate": "2024-05-01", "description": "optional" }
// assetCode: required, ≤50, ^[A-Za-z0-9][A-Za-z0-9\-_.]*$, stored upper-case, unique

// POST /api/maintenance-requests
{ "assetId": 1, "title": "Bearing noise", "description": "At least 10 characters…", "priority": "High" }

// PATCH /api/maintenance-requests/{id}/status
{ "status": "Approved", "priority": "Critical", "comment": "optional" }

// POST /api/work-orders
{ "requestId": 7, "assignedTechnicianId": "optional-user-id", "dueDate": "2026-12-01T12:00:00Z" }

// PATCH /api/work-orders/{id}/assign
{ "technicianId": "user-id" }

// PATCH /api/work-orders/{id}/status
{ "status": "Completed", "remarks": "Bearing replaced" }

// POST /api/work-orders/{id}/notes
{ "text": "Found worn seal, ordering part." }
```
