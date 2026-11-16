import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setTokenProvider, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { ROLES } from '../utils/constants';
import { parseDate } from '../utils/format';

const STORAGE_KEY = 'auraops.session';
const AuthContext = createContext(null);

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.accessToken || !session?.user) return null;
    const exp = parseDate(session.expiresAt);
    if (exp && exp.getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — session lives in memory only */
  }
}

/** Pure role helpers, usable outside React too. */
export function buildRoleHelpers(user) {
  const roles = user?.roles || [];
  const hasRole = (...wanted) => wanted.some((r) => roles.includes(r));
  return {
    roles,
    hasRole,
    isAdmin: hasRole(ROLES.Admin),
    isTechnician: hasRole(ROLES.Technician),
    isViewer: hasRole(ROLES.Viewer),
    canViewDashboard: hasRole(ROLES.Admin, ROLES.Viewer),
    canManage: hasRole(ROLES.Admin),
  };
}

export function AuthProvider({ children, initialSession }) {
  const [session, setSession] = useState(() => (initialSession !== undefined ? initialSession : loadSession()));
  const [expiredNotice, setExpiredNotice] = useState(false);

  // Keep the API client in sync with the current token.
  useEffect(() => {
    setTokenProvider(() => session?.accessToken || null);
  }, [session]);
  // Set synchronously too, so the very first child effects already have a token.
  setTokenProvider(() => session?.accessToken || null);

  const clearSession = useCallback((expired = false) => {
    saveSession(null);
    setSession(null);
    setExpiredNotice(expired);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession(true));
    return () => setUnauthorizedHandler(() => {});
  }, [clearSession]);

  // Auto sign-out when the token's lifetime ends.
  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const exp = parseDate(session.expiresAt);
    if (!exp) return undefined;
    const ms = exp.getTime() - Date.now();
    if (ms <= 0) {
      clearSession(true);
      return undefined;
    }
    const t = setTimeout(() => clearSession(true), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [session, clearSession]);

  // Sync logouts across browser tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setSession(loadSession());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(email.trim(), password);
    const next = { accessToken: result.accessToken, expiresAt: result.expiresAt, user: result.user };
    saveSession(next);
    setTokenProvider(() => next.accessToken);
    setExpiredNotice(false);
    setSession(next);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* token may already be invalid — sign out locally regardless */
    }
    clearSession(false);
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user: session?.user || null,
      token: session?.accessToken || null,
      isAuthenticated: !!session,
      expiredNotice,
      login,
      logout,
      ...buildRoleHelpers(session?.user),
    }),
    [session, expiredNotice, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
