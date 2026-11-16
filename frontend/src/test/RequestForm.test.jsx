import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestsApi } from '../api/endpoints';
import { RequestForm } from '../pages/RequestCreatePage';
import { renderWithProviders, sessionFor } from './utils';

vi.mock('../api/endpoints', () => ({
  assetsApi: { list: vi.fn(), get: vi.fn() },
  requestsApi: { create: vi.fn() },
}));

const asset = { assetId: 3, assetCode: 'CMP-001', name: 'Air Compressor C-201', location: 'Plant A / Utilities' };

describe('Create maintenance request form', () => {
  beforeEach(() => {
    vi.mocked(requestsApi.create).mockReset();
  });

  it('shows validation messages for empty input and does not call the API', async () => {
    renderWithProviders(<RequestForm />, { session: sessionFor('Viewer') });
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(screen.getByText('Choose an asset.')).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
    expect(requestsApi.create).not.toHaveBeenCalled();
  });

  it('enforces minimum lengths for title and description', async () => {
    renderWithProviders(<RequestForm initialAsset={asset} />, { session: sessionFor('Technician') });
    await userEvent.type(screen.getByLabelText(/Title/), 'ab');
    await userEvent.type(screen.getByLabelText(/Description/), 'too short');
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(screen.getByText('Title must be at least 3 characters.')).toBeInTheDocument();
    expect(screen.getByText('Description must be at least 10 characters.')).toBeInTheDocument();
    expect(screen.queryByText('Choose an asset.')).not.toBeInTheDocument();
    expect(requestsApi.create).not.toHaveBeenCalled();
  });

  it('submits a valid request with the chosen priority', async () => {
    vi.mocked(requestsApi.create).mockResolvedValue({ requestId: 42 });
    const onCreated = vi.fn();
    renderWithProviders(<RequestForm initialAsset={asset} onCreated={onCreated} />, { session: sessionFor('Viewer') });
    await userEvent.type(screen.getByLabelText(/Title/), 'Compressor overheating');
    await userEvent.type(screen.getByLabelText(/Description/), 'Temperature alarm tripped twice this shift.');
    await userEvent.click(screen.getByLabelText('High'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(requestsApi.create).toHaveBeenCalledWith({
      assetId: 3,
      title: 'Compressor overheating',
      description: 'Temperature alarm tripped twice this shift.',
      priority: 'High',
    });
    expect(onCreated).toHaveBeenCalledWith({ requestId: 42 });
  });
});
