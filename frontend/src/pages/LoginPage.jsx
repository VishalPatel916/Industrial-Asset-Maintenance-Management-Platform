import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Logo } from '../components/Layout';
import { InlineAlert } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { hasErrors, validateLogin } from '../utils/validation';
import { mapFieldErrors } from '../api/client';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@auraops.local', password: 'Admin123!' },
  { role: 'Technician', email: 'tech1@auraops.local', password: 'Demo123!' },
  { role: 'Technician', email: 'tech2@auraops.local', password: 'Demo123!' },
  { role: 'Viewer / Manager', email: 'manager@auraops.local', password: 'Demo123!' },
];

export function homePathFor(user) {
  const roles = user?.roles || [];
  return roles.includes('Admin') || roles.includes('Viewer') ? '/dashboard' : '/my-work';
}

export default function LoginPage() {
  const { login, isAuthenticated, user, expiredNotice } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated && !busy) return <Navigate to={homePathFor(user)} replace />;

  const set = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    if (touched[field]) setErrors(validateLogin(next));
  };

  const blur = (field) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validateLogin(values));
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = validateLogin(values);
    setErrors(v);
    setTouched({ email: true, password: true });
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      const loggedIn = await login(values.email, values.password);
      toast.success(`Welcome back, ${loggedIn.fullName}.`);
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : homePathFor(loggedIn), { replace: true });
    } catch (err) {
      if (err.isValidation) {
        const mapped = mapFieldErrors(err.errors, ['email', 'password']);
        setErrors(mapped);
        setFormError(mapped._form || null);
      } else {
        setFormError(err.status === 401 ? err.detail || 'Invalid e-mail or password.' : err.message);
      }
      setBusy(false);
    }
  };

  const fill = (acc) => {
    setValues({ email: acc.email, password: acc.password });
    setErrors({});
    setFormError(null);
  };

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <Logo />
          <p className="login-tagline">Industrial asset &amp; maintenance management</p>
        </div>
        <form className="login-form card" onSubmit={submit} noValidate aria-labelledby="login-title">
          <h1 id="login-title">Sign in</h1>
          {expiredNotice && !formError && <InlineAlert type="info">Your session has ended. Please sign in again.</InlineAlert>}
          <InlineAlert>{formError}</InlineAlert>
          <FormField label="Email" error={errors.email} required>
            <input type="email" name="email" autoComplete="username" value={values.email} onChange={set('email')} onBlur={blur('email')} data-autofocus autoFocus />
          </FormField>
          <FormField label="Password" error={errors.password} required>
            <input type="password" name="password" autoComplete="current-password" value={values.password} onChange={set('password')} onBlur={blur('password')} />
          </FormField>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="demo-hint card">
          <h2>Demo accounts</h2>
          <p className="muted small">Click an account to fill the form.</p>
          <ul>
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email}>
                <button type="button" className="demo-account" onClick={() => fill(acc)}>
                  <span className="demo-role">{acc.role}</span>
                  <span className="mono">{acc.email}</span>
                  <span className="mono muted">{acc.password}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
