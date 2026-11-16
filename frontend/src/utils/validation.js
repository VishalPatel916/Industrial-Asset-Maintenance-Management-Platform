// Client-side validation mirroring the server's DataAnnotations rules (Dtos.cs).
// Each validator returns an object of { field: message } — empty when valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ASSET_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/;

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

export function validateLogin({ email, password }) {
  const e = {};
  if (blank(email)) e.email = 'Email is required.';
  else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address.';
  else if (email.length > 256) e.email = 'Email must be at most 256 characters.';
  if (blank(password)) e.password = 'Password is required.';
  else if (password.length > 128) e.password = 'Password must be at most 128 characters.';
  return e;
}

export function validateAsset(v) {
  const e = {};
  if (blank(v.assetCode)) e.assetCode = 'Asset code is required.';
  else if (v.assetCode.trim().length > 50) e.assetCode = 'Asset code must be at most 50 characters.';
  else if (!ASSET_CODE_RE.test(v.assetCode.trim()))
    e.assetCode = "Asset code may contain letters, digits, '-', '_' and '.', and must start with a letter or digit.";

  if (blank(v.name)) e.name = 'Name is required.';
  else if (v.name.trim().length > 150) e.name = 'Name must be at most 150 characters.';

  if (blank(v.category)) e.category = 'Category is required.';
  else if (v.category.trim().length > 80) e.category = 'Category must be at most 80 characters.';

  if (blank(v.location)) e.location = 'Location is required.';
  else if (v.location.trim().length > 120) e.location = 'Location must be at most 120 characters.';

  if (v.description && v.description.length > 2000) e.description = 'Description must be at most 2000 characters.';

  if (v.purchaseDate) {
    const d = new Date(v.purchaseDate);
    if (Number.isNaN(d.getTime())) e.purchaseDate = 'Enter a valid date.';
    else if (d.getTime() > Date.now() + 86400000) e.purchaseDate = 'Purchase date cannot be in the future.';
  }
  return e;
}

export function validateRequest(v) {
  const e = {};
  if (!v.assetId || Number(v.assetId) < 1) e.assetId = 'Choose an asset.';
  const title = (v.title || '').trim();
  if (!title) e.title = 'Title is required.';
  else if (title.length < 3) e.title = 'Title must be at least 3 characters.';
  else if (title.length > 150) e.title = 'Title must be at most 150 characters.';
  const desc = (v.description || '').trim();
  if (!desc) e.description = 'Description is required.';
  else if (desc.length < 10) e.description = 'Description must be at least 10 characters.';
  else if (desc.length > 4000) e.description = 'Description must be at most 4000 characters.';
  if (!v.priority) e.priority = 'Choose a priority.';
  return e;
}

export function validateUser(v, { isNew }) {
  const e = {};
  if (blank(v.fullName)) e.fullName = 'Full name is required.';
  else if (v.fullName.trim().length > 100) e.fullName = 'Full name must be at most 100 characters.';
  if (isNew) {
    if (blank(v.email)) e.email = 'Email is required.';
    else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.';
    const pw = validatePassword(v.password);
    if (pw) e.password = pw;
  }
  if (blank(v.role)) e.role = 'Choose a role.';
  return e;
}

export function validatePassword(pw) {
  if (blank(pw)) return 'Password is required.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password must be at most 128 characters.';
  return null;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
