import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Redirects anonymous users to /login, remembering where they were going. */
export function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children ?? <Outlet />;
}

/**
 * Client-side role guard (the API enforces the same rules).
 * Renders children/outlet when the user has any of `roles`; otherwise a 403 panel.
 */
export function RequireRole({ roles, children }) {
  const { isAuthenticated, hasRole } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!hasRole(...roles)) return <Forbidden />;
  return children ?? <Outlet />;
}

/** Renders children only for users with one of `roles` (for hiding buttons/nav). */
export function ShowFor({ roles, children, fallback = null }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? children : fallback;
}

export function Forbidden() {
  return (
    <div className="page">
      <div className="error-state forbidden" role="alert">
        <div className="error-icon" aria-hidden="true">⛔</div>
        <h3>Access denied</h3>
        <p>Your role does not have access to this page.</p>
        <Link className="btn btn-secondary" to="/">
          Go to home
        </Link>
      </div>
    </div>
  );
}
