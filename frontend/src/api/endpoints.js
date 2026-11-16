import { apiFetch } from './client';

export const authApi = {
  login: (email, password) =>
    apiFetch('/api/auth/login', { method: 'POST', body: { email, password }, skipAuthRedirect: true }),
  me: () => apiFetch('/api/auth/me'),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST', skipAuthRedirect: true }),
};

export const assetsApi = {
  list: (query, opts) => apiFetch('/api/assets', { query, ...opts }),
  facets: (opts) => apiFetch('/api/assets/facets', opts),
  get: (id, opts) => apiFetch(`/api/assets/${id}`, opts),
  create: (body) => apiFetch('/api/assets', { method: 'POST', body }),
  update: (id, body) => apiFetch(`/api/assets/${id}`, { method: 'PUT', body }),
  archive: (id) => apiFetch(`/api/assets/${id}`, { method: 'DELETE' }),
  /**
   * The API binds this endpoint's paging object from a parameter named `page`, so once a plain
   * `page` key is present ASP.NET expects `page.Page`/`page.PageSize` and silently ignores the rest.
   * Sending both forms works with the current API and with a fixed one.
   */
  history: (id, { page = 1, pageSize = 20 } = {}, opts) =>
    apiFetch(`/api/assets/${id}/history`, {
      query: { page, pageSize, 'page.page': page, 'page.pageSize': pageSize },
      ...opts,
    }),
};

export const requestsApi = {
  list: (query, opts) => apiFetch('/api/maintenance-requests', { query, ...opts }),
  get: (id, opts) => apiFetch(`/api/maintenance-requests/${id}`, opts),
  create: (body) => apiFetch('/api/maintenance-requests', { method: 'POST', body }),
  /** body: { status, priority?, comment? } — status is required by the API. */
  updateStatus: (id, body) => apiFetch(`/api/maintenance-requests/${id}/status`, { method: 'PATCH', body }),
};

export const workOrdersApi = {
  list: (query, opts) => apiFetch('/api/work-orders', { query, ...opts }),
  get: (id, opts) => apiFetch(`/api/work-orders/${id}`, opts),
  create: (body) => apiFetch('/api/work-orders', { method: 'POST', body }),
  assign: (id, technicianId) => apiFetch(`/api/work-orders/${id}/assign`, { method: 'PATCH', body: { technicianId } }),
  updateStatus: (id, status, remarks) =>
    apiFetch(`/api/work-orders/${id}/status`, { method: 'PATCH', body: { status, remarks: remarks || null } }),
  addNote: (id, text) => apiFetch(`/api/work-orders/${id}/notes`, { method: 'POST', body: { text } }),
};

export const dashboardApi = {
  summary: (query, opts) => apiFetch('/api/dashboard/summary', { query, ...opts }),
};

export const usersApi = {
  list: (query, opts) => apiFetch('/api/users', { query, ...opts }),
  technicians: (opts) => apiFetch('/api/users/technicians', opts),
  get: (id, opts) => apiFetch(`/api/users/${id}`, opts),
  create: (body) => apiFetch('/api/users', { method: 'POST', body }),
  update: (id, body) => apiFetch(`/api/users/${id}`, { method: 'PUT', body }),
  resetPassword: (id, newPassword) =>
    apiFetch(`/api/users/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
};
