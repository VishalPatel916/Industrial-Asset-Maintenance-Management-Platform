// Minimal fetch wrapper: JSON in/out, bearer token, RFC 7807 problem details → ApiError.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

let tokenProvider = () => null;
let unauthorizedHandler = () => {};

/** AuthContext registers how to read the current token. */
export function setTokenProvider(fn) {
  tokenProvider = fn;
}

/** AuthContext registers what to do when the API answers 401 (session expired/revoked). */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  constructor({ status, title, detail, errors }) {
    super(detail || title || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    /** Field errors keyed by (PascalCase) property name: { AssetCode: ['...'] } */
    this.errors = errors || null;
  }

  get isValidation() {
    return this.status === 400 && !!this.errors;
  }
}

/** Builds a query string, skipping null/undefined/'' values. */
export function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function apiFetch(path, { method = 'GET', body, query, signal, skipAuthRedirect = false } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${toQueryString(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, title: 'Network error', detail: 'Unable to reach the AuraOps server. Check your connection and try again.' });
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json().catch(() => null) : await response.text().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRedirect) unauthorizedHandler();
    const problem = data && typeof data === 'object' ? data : {};
    throw new ApiError({
      status: response.status,
      title: problem.title || defaultTitle(response.status),
      detail: problem.detail || (problem.errors ? 'Please correct the highlighted fields.' : defaultDetail(response.status)),
      errors: problem.errors,
    });
  }
  return data;
}

function defaultTitle(status) {
  switch (status) {
    case 400: return 'Invalid request';
    case 401: return 'Not signed in';
    case 403: return 'Access denied';
    case 404: return 'Not found';
    case 409: return 'Conflict';
    case 429: return 'Too many requests';
    default: return status >= 500 ? 'Server error' : 'Request failed';
  }
}

function defaultDetail(status) {
  switch (status) {
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return 'The requested item could not be found.';
    case 429: return 'Too many attempts. Please wait a moment and try again.';
    default: return status >= 500 ? 'Something went wrong on the server. Please try again.' : undefined;
  }
}

/**
 * Maps server field errors (PascalCase keys, possibly nested like "Items[0].Name")
 * onto form field names case-insensitively. Unmatched messages are returned under "_form".
 */
export function mapFieldErrors(errors, fieldNames) {
  const result = {};
  if (!errors) return result;
  const lookup = new Map(fieldNames.map((f) => [f.toLowerCase(), f]));
  Object.entries(errors).forEach(([key, messages]) => {
    const text = Array.isArray(messages) ? messages.join(' ') : String(messages);
    const normalized = key.replace(/^\$\.?/, '').split('.').pop().toLowerCase();
    const field = lookup.get(normalized);
    if (field) result[field] = result[field] ? `${result[field]} ${text}` : text;
    else result._form = result._form ? `${result._form} ${text}` : text;
  });
  return result;
}
