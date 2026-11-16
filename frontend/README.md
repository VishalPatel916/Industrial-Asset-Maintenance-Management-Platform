# AuraOps — Frontend

React 18 + Vite single-page app for the AuraOps industrial asset & maintenance platform.

## Prerequisites
- Node.js 20+ and npm
- The AuraOps API running (default `http://localhost:5080`, see `../backend`)

## Install & run
```bash
npm install
npm run dev          # http://localhost:5173 — /api and /health are proxied to http://localhost:5080
```
Demo accounts (seeded by the API in Development): `admin@auraops.local / Admin123!`,
`tech1@auraops.local / Demo123!`, `tech2@auraops.local / Demo123!`, `manager@auraops.local / Demo123!` (Viewer).

## Test, lint, build
```bash
npm test             # Vitest + Testing Library (jsdom), single run
npm run lint         # ESLint
npm run build        # production bundle in dist/
npm run preview      # serve dist/ locally
```

## Environment
Copy `.env.example` to `.env.local` if needed.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | empty | API origin. Empty = same-origin `/api` (Vite dev proxy or nginx). Set e.g. `https://api.example.com` to call the API directly (it must allow the origin via CORS). |
| `VITE_PROXY_TARGET` | `http://localhost:5080` | Dev server only: where `/api` is proxied. |

## Docker
```bash
docker build -t auraops-frontend .
```
Multi-stage build (Node → `nginx:alpine`). nginx serves `dist/` with SPA fallback and proxies `/api/` and `/health`
to `http://api:8080` (the `api` service in docker-compose).

## Structure
```
src/
  api/          fetch client (auth header, RFC 7807 errors → ApiError) + endpoint functions
  components/   DataTable, StatusBadge/PriorityBadge, Modal/ConfirmDialog, FormField, Layout/nav,
                Loading/Empty/Error states, AssetPicker, Timeline, charts, role guards
  context/      AuthContext (session in localStorage, role helpers), ToastContext
  hooks/        useAsync, useDebounce, useQueryParams (URL-synced filters/sort/paging)
  pages/        Login, Dashboard, My work, Assets (list/detail/form), Requests (list/detail/new),
                Work orders (list + kanban, detail), Users
  utils/        enums/constants, date formatting, client-side validation
  test/         Vitest specs
```

## Notes
- Roles: **Admin** (everything), **Technician** (own work orders; start/complete/notes; report issues),
  **Viewer** (read-only manager; dashboard; report issues). Nav and actions are hidden per role and routes are
  guarded client-side; the API enforces the same rules.
- A 401 from the API clears the session and returns to the login page.
- Timestamps are shown in the browser's local time zone (API values without a zone suffix are treated as UTC).
