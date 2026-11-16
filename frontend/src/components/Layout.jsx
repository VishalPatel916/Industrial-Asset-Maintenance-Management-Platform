import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLES } from '../utils/constants';
import { RoleBadge } from './Badges';
import { ErrorBoundary } from './ErrorBoundary';

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  mywork: 'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11z',
  assets: 'M20 6h-4V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM10 4h4v2h-4V4z',
  requests: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  workorders: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
};

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: [ROLES.Admin, ROLES.Viewer] },
  { to: '/my-work', label: 'My work', icon: 'mywork', roles: [ROLES.Technician] },
  { to: '/assets', label: 'Assets', icon: 'assets', roles: [ROLES.Admin, ROLES.Technician, ROLES.Viewer] },
  { to: '/requests', label: 'Maintenance requests', icon: 'requests', roles: [ROLES.Admin, ROLES.Technician, ROLES.Viewer] },
  { to: '/work-orders', label: 'Work orders', icon: 'workorders', roles: [ROLES.Admin, ROLES.Technician, ROLES.Viewer] },
  { to: '/users', label: 'Users', icon: 'users', roles: [ROLES.Admin] },
];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="nav-icon">
      <path d={ICONS[name]} fill="currentColor" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#f59e0b" />
        <path d="M9 23 16 8l7 15h-4l-3-7-3 7z" fill="#1f2a37" />
      </svg>
      <span className="logo-text">
        Aura<strong>Ops</strong>
      </span>
    </span>
  );
}

export function Layout() {
  const { user, roles, hasRole, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const items = NAV_ITEMS.filter((item) => hasRole(...item.roles));

  const onLogout = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate('/login', { replace: true });
  };

  const initials = (user?.fullName || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <Link to="/" className="brand-link">
            <Logo />
          </Link>
        </div>
        <nav>
          <ul className="nav-list">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-cta">
          <Link to="/requests/new" className="btn btn-accent btn-block">
            + Report issue
          </Link>
        </div>
        <div className="sidebar-footer">AuraOps · Asset &amp; Maintenance</div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            ☰
          </button>
          <div className="topbar-brand-mobile">
            <Logo />
          </div>
          <div className="topbar-spacer" />
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="user-meta">
              <span className="user-name">{user?.fullName}</span>
              <span className="user-roles">
                {roles.map((r) => (
                  <RoleBadge key={r} role={r} />
                ))}
              </span>
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <div className="page-header">
      <div>
        {breadcrumbs && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((b, i) => (
              <span key={i}>
                {b.to ? <Link to={b.to}>{b.label}</Link> : <span>{b.label}</span>}
                {i < breadcrumbs.length - 1 && <span className="crumb-sep"> / </span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
