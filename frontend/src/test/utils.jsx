import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';

export function sessionFor(role, overrides = {}) {
  return {
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: `u-${role}`, fullName: `Test ${role}`, email: `${role.toLowerCase()}@test.local`, isActive: true, roles: [role], ...overrides },
  };
}

/** Renders `ui` inside router + toast + auth providers. session: null = anonymous. */
export function renderWithProviders(ui, { route = '/', session = null } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider initialSession={session}>{ui}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
