import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, mapFieldErrors } from '../api/client';
import { AssetForm } from '../pages/AssetFormPage';
import { renderWithProviders, sessionFor } from './utils';

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/Asset code/), 'PMP-100');
  await userEvent.type(screen.getByLabelText(/^Name/), 'Feed Pump');
  await userEvent.type(screen.getByLabelText(/Category/), 'Pump');
  await userEvent.type(screen.getByLabelText(/Location/), 'Plant A / Line 1');
}

describe('AssetForm', () => {
  it('validates required fields and the asset-code pattern on the client', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<AssetForm onSubmit={onSubmit} />, { session: sessionFor('Admin') });
    await userEvent.type(screen.getByLabelText(/Asset code/), '-bad code');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText(/Asset code may contain letters, digits/)).toBeInTheDocument();
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Category is required.')).toBeInTheDocument();
    expect(screen.getByText('Location is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('maps server 400 field errors (PascalCase keys) onto the matching fields', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        status: 400,
        title: 'One or more validation errors occurred.',
        errors: {
          AssetCode: ['Asset code is reserved.'],
          Location: ['The field Location must be a string with a maximum length of 120.'],
          SomethingElse: ['General problem.'],
        },
      }),
    );
    renderWithProviders(<AssetForm onSubmit={onSubmit} />, { session: sessionFor('Admin') });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const code = screen.getByLabelText(/Asset code/);
    expect(await screen.findByText('Asset code is reserved.')).toBeInTheDocument();
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAccessibleDescription('Asset code is reserved.');
    expect(screen.getByLabelText(/Location/)).toHaveAccessibleDescription(
      'The field Location must be a string with a maximum length of 120.',
    );
    // Unknown keys are surfaced as a form-level alert.
    expect(screen.getByRole('alert')).toHaveTextContent('General problem.');
  });

  it('shows a 409 duplicate-code conflict on the asset code field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({ status: 409, title: 'Conflict', detail: "Asset code 'PMP-100' already exists." }),
    );
    renderWithProviders(<AssetForm onSubmit={onSubmit} />, { session: sessionFor('Admin') });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByLabelText(/Asset code/)).toHaveAccessibleDescription("Asset code 'PMP-100' already exists.");
  });
});

describe('mapFieldErrors', () => {
  it('matches keys case-insensitively and strips JSON path prefixes', () => {
    expect(mapFieldErrors({ AssetCode: ['a'], '$.name': ['b'], Other: ['c'] }, ['assetCode', 'name'])).toEqual({
      assetCode: 'a',
      name: 'b',
      _form: 'c',
    });
  });
});
