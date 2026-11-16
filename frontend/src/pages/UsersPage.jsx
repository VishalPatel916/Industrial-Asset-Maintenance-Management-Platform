import { useMemo, useState } from 'react';
import { mapFieldErrors } from '../api/client';
import { usersApi } from '../api/endpoints';
import { RoleBadge, StatusBadge } from '../components/Badges';
import { DataTable } from '../components/DataTable';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/Layout';
import { Modal } from '../components/Modal';
import { EmptyState, InlineAlert } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useQueryParams } from '../hooks/useQueryParams';
import { ROLE_LIST } from '../utils/constants';
import { formatDate } from '../utils/format';
import { hasErrors, validatePassword, validateUser } from '../utils/validation';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useQueryParams({ role: '', sortBy: 'fullName', desc: false, page: 1 });
  const [searchText, setSearchText] = useState('');
  const debounced = useDebounce(searchText.trim(), 350);
  const [editing, setEditing] = useState(null); // user | 'new'
  const [resetting, setResetting] = useState(null);

  const list = useAsync((signal) => usersApi.list({ search: debounced, role: params.role }, { signal }), [debounced, params.role]);

  // The users endpoint returns a plain array; sort + paginate client-side.
  const sorted = useMemo(() => {
    const rows = [...(list.data || [])];
    const key = params.sortBy;
    rows.sort((a, b) => {
      const av = key === 'role' ? a.roles.join(',') : key === 'isActive' ? String(a.isActive) : String(a[key] ?? '');
      const bv = key === 'role' ? b.roles.join(',') : key === 'isActive' ? String(b.isActive) : String(b[key] ?? '');
      return av.localeCompare(bv) * (params.desc ? -1 : 1);
    });
    return rows;
  }, [list.data, params.sortBy, params.desc]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      key: 'fullName',
      header: 'Name',
      sortKey: 'fullName',
      render: (u) => (
        <span className="cell-strong">
          {u.fullName}
          {u.id === me?.id && <span className="muted small"> (you)</span>}
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortKey: 'email', render: (u) => <span className="mono small">{u.email}</span> },
    { key: 'role', header: 'Role', sortKey: 'role', render: (u) => u.roles.map((r) => <RoleBadge key={r} role={r} />) },
    { key: 'isActive', header: 'Status', sortKey: 'isActive', render: (u) => <StatusBadge status={u.isActive ? 'Active' : 'Inactive'} /> },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (u) => (
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>
            Reset password
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Users"
        subtitle="Manage who can access AuraOps and what they can do."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + New user
          </button>
        }
      />
      <div className="card filters-card">
        <div className="filters">
          <div className="filter-search">
            <input
              type="search"
              className="input"
              placeholder="Search name or email…"
              aria-label="Search users"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select className="input" aria-label="Role" value={params.role} onChange={(e) => setParams({ role: e.target.value })}>
            <option value="">All roles</option>
            {ROLE_LIST.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="card table-card">
        <DataTable
          caption="Users"
          columns={columns}
          rows={list.data ? pageRows : undefined}
          rowKey={(u) => u.id}
          sortBy={params.sortBy}
          desc={params.desc}
          onSort={(sortBy, desc) => setParams({ sortBy, desc })}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={sorted.length}
          totalPages={totalPages}
          onPageChange={(p) => setParams({ page: p })}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={<EmptyState title="No users found" message="Try a different search or role." />}
        />
      </div>

      <UserDialog
        open={!!editing}
        user={editing === 'new' ? null : editing}
        isSelf={editing && editing !== 'new' && editing.id === me?.id}
        onClose={() => setEditing(null)}
        onSaved={list.reload}
      />
      <ResetPasswordDialog open={!!resetting} user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

function UserDialog({ open, user, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !user;
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  if (open && !lastOpen) {
    setLastOpen(true);
    setValues({
      fullName: user?.fullName || '',
      email: user?.email || '',
      password: '',
      role: user?.roles?.[0] || 'Technician',
      isActive: user ? user.isActive : true,
    });
    setErrors({});
    setFormError(null);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const v = validateUser(values, { isNew });
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      if (isNew) {
        await usersApi.create({ fullName: values.fullName.trim(), email: values.email.trim(), password: values.password, role: values.role });
        toast.success(`User ${values.email.trim()} created.`);
      } else {
        await usersApi.update(user.id, { fullName: values.fullName.trim(), role: values.role, isActive: values.isActive });
        toast.success(`User ${user.email} updated.`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      if (err.status === 400 && err.errors) {
        const { _form, ...fieldErrors } = mapFieldErrors(err.errors, ['fullName', 'email', 'password', 'role', 'isActive']);
        setErrors(fieldErrors);
        setFormError(_form || 'Please correct the highlighted fields.');
      } else if (err.status === 409) {
        setErrors({ email: err.detail || 'A user with this email already exists.' });
      } else {
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={isNew ? 'New user' : `Edit ${user?.fullName}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <InlineAlert>{formError}</InlineAlert>
        <FormField label="Full name" required error={errors.fullName}>
          <input value={values.fullName || ''} onChange={set('fullName')} maxLength={120} />
        </FormField>
        <FormField label="Email" required={isNew} error={errors.email} hint={isNew ? undefined : 'Email cannot be changed.'}>
          <input type="email" value={values.email || ''} onChange={set('email')} disabled={!isNew} autoComplete="off" />
        </FormField>
        {isNew && (
          <FormField label="Initial password" required error={errors.password} hint="At least 8 characters.">
            <input type="password" value={values.password || ''} onChange={set('password')} autoComplete="new-password" />
          </FormField>
        )}
        <FormField label="Role" required error={errors.role} hint={isSelf ? 'You cannot change your own role here.' : 'Changing the role signs the user out.'}>
          <select value={values.role || ''} onChange={set('role')} disabled={isSelf}>
            {ROLE_LIST.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </FormField>
        {!isNew && (
          <label className="checkbox">
            <input type="checkbox" checked={!!values.isActive} onChange={set('isActive')} disabled={isSelf} />
            Active (inactive users cannot sign in)
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ open, user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword('');
    setConfirm('');
    setErrors({});
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    const pw = validatePassword(password);
    if (pw) err.password = pw;
    if (!err.password && password !== confirm) err.confirm = 'Passwords do not match.';
    setErrors(err);
    if (hasErrors(err)) return;
    setBusy(true);
    try {
      await usersApi.resetPassword(user.id, password);
      toast.success(`Password reset for ${user.email}.`);
      close();
    } catch (ex) {
      setErrors({ password: ex.errors ? Object.values(ex.errors).flat().join(' ') : ex.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`Reset password — ${user?.fullName || ''}`} onClose={close} busy={busy} size="sm">
      <form onSubmit={submit} noValidate>
        <FormField label="New password" required error={errors.password} hint="At least 8 characters.">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm password" required error={errors.confirm}>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </FormField>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
