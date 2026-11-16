import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '../pages/LoginPage';
import { renderWithProviders } from './utils';

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<p>Dashboard page</p>} />
      <Route path="/my-work" element={<p>My work page</p>} />
    </Routes>,
    { route: '/login' },
  );
}

describe('LoginPage', () => {
  it('shows required-field messages and does not call the API when submitted empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('validates the email format', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderLogin();
    await userEvent.type(screen.getByLabelText(/Email/), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/Password/), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.queryByText('Password is required.')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message for invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ title: 'Sign-in failed', status: 401, detail: 'Invalid e-mail or password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/Email/), 'admin@auraops.local');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid e-mail or password.')).toBeInTheDocument();
  });

  it('signs in and routes technicians to My work', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'abc',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          user: { id: '1', fullName: 'Priya Sharma', email: 'tech1@auraops.local', isActive: true, roles: ['Technician'] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/Email/), 'tech1@auraops.local');
    await userEvent.type(screen.getByLabelText(/Password/), 'Demo123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('My work page')).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('auraops.session')).accessToken).toBe('abc'));
  });
});
