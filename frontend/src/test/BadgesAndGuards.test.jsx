import { render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { RequireRole, ShowFor } from '../components/RequireRole';
import { buildRoleHelpers } from '../context/AuthContext';
import { parseDate } from '../utils/format';
import { renderWithProviders, sessionFor } from './utils';

describe('StatusBadge', () => {
  it.each([
    ['InProgress', 'In Progress', 'amber'],
    ['Completed', 'Completed', 'green'],
    ['OutOfService', 'Out Of Service', 'red'],
    ['InReview', 'In Review', 'purple'],
    ['Cancelled', 'Cancelled', 'gray'],
    ['Open', 'Open', 'blue'],
  ])('renders %s as "%s" with the %s tone', (status, label, tone) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass(`badge-${tone}`);
    expect(badge).toHaveAttribute('data-tone', tone);
  });

  it('renders nothing without a status', () => {
    const { container } = render(<StatusBadge status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('PriorityBadge uses a distinct style for Critical', () => {
    render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText('Critical')).toHaveClass('p-critical');
  });
});

function guardedApp() {
  return (
    <Routes>
      <Route path="/login" element={<p>Login page</p>} />
      <Route element={<RequireRole roles={['Admin']} />}>
        <Route path="/users" element={<p>User management</p>} />
      </Route>
      <Route element={<RequireRole roles={['Admin', 'Viewer']} />}>
        <Route path="/dashboard" element={<p>Dashboard content</p>} />
      </Route>
    </Routes>
  );
}

describe('RequireRole guard', () => {
  it('lets an Admin into admin-only pages', () => {
    renderWithProviders(guardedApp(), { route: '/users', session: sessionFor('Admin') });
    expect(screen.getByText('User management')).toBeInTheDocument();
  });

  it('blocks a Technician from admin-only pages', () => {
    renderWithProviders(guardedApp(), { route: '/users', session: sessionFor('Technician') });
    expect(screen.queryByText('User management')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('blocks a Technician from the dashboard but allows a Viewer', () => {
    const { unmount } = renderWithProviders(guardedApp(), { route: '/dashboard', session: sessionFor('Technician') });
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    unmount();
    renderWithProviders(guardedApp(), { route: '/dashboard', session: sessionFor('Viewer') });
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('redirects anonymous users to the login page', () => {
    renderWithProviders(guardedApp(), { route: '/users', session: null });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('ShowFor hides admin-only controls from other roles', () => {
    const ui = (
      <ShowFor roles={['Admin']}>
        <button type="button">New asset</button>
      </ShowFor>
    );
    const { unmount } = renderWithProviders(ui, { session: sessionFor('Viewer') });
    expect(screen.queryByRole('button', { name: 'New asset' })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(ui, { session: sessionFor('Admin') });
    expect(screen.getByRole('button', { name: 'New asset' })).toBeInTheDocument();
  });

  it('role helpers reflect the user roles', () => {
    expect(buildRoleHelpers({ roles: ['Viewer'] })).toMatchObject({ isViewer: true, isAdmin: false, canViewDashboard: true });
    expect(buildRoleHelpers({ roles: ['Technician'] })).toMatchObject({ isTechnician: true, canViewDashboard: false });
    expect(buildRoleHelpers(null)).toMatchObject({ isAdmin: false, roles: [] });
  });
});

describe('parseDate', () => {
  it('treats zone-less API timestamps as UTC', () => {
    expect(parseDate('2026-11-14T20:29:06.4861233').toISOString()).toBe('2026-11-14T20:29:06.486Z');
    expect(parseDate('2026-11-14T20:29:06Z').toISOString()).toBe('2026-11-14T20:29:06.000Z');
    expect(parseDate(null)).toBeNull();
  });
});
