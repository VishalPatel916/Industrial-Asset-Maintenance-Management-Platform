import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mapFieldErrors } from '../api/client';
import { assetsApi } from '../api/endpoints';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/Layout';
import { ErrorState, InlineAlert, Loading } from '../components/States';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { ASSET_STATUSES } from '../utils/constants';
import { humanize } from '../utils/format';
import { hasErrors, validateAsset } from '../utils/validation';

const FIELDS = ['assetCode', 'name', 'category', 'location', 'status', 'purchaseDate', 'description'];
const EMPTY = { assetCode: '', name: '', category: '', location: '', status: 'Operational', purchaseDate: '', description: '' };

export function toFormValues(asset) {
  if (!asset) return { ...EMPTY };
  return {
    assetCode: asset.assetCode || '',
    name: asset.name || '',
    category: asset.category || '',
    location: asset.location || '',
    status: asset.status || 'Operational',
    purchaseDate: asset.purchaseDate || '',
    description: asset.description || '',
  };
}

export function toPayload(values) {
  return {
    assetCode: values.assetCode.trim(),
    name: values.name.trim(),
    category: values.category.trim(),
    location: values.location.trim(),
    status: values.status,
    purchaseDate: values.purchaseDate || null,
    description: values.description.trim() || null,
  };
}

/**
 * Asset create/edit form. `onSubmit(payload)` performs the API call; thrown ApiErrors are
 * mapped onto fields (400 validation, 409 duplicate code) or shown as a form-level alert.
 */
export function AssetForm({ initial, onSubmit, onCancel, submitLabel = 'Save', facets }) {
  const [values, setValues] = useState(() => toFormValues(initial));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    // Re-validate only the edited field; other (possibly server-side) errors stay visible.
    setErrors((prev) => {
      const { [field]: _removed, ...rest } = prev;
      const fieldError = submitted ? validateAsset(next)[field] : undefined;
      return fieldError ? { ...rest, [field]: fieldError } : rest;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const v = validateAsset(values);
    setErrors(v);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      await onSubmit(toPayload(values));
    } catch (err) {
      if (err?.status === 400 && err.errors) {
        const mapped = mapFieldErrors(err.errors, FIELDS);
        const { _form, ...fieldErrors } = mapped;
        setErrors(fieldErrors);
        setFormError(_form || 'Please correct the highlighted fields.');
      } else if (err?.status === 409) {
        const msg = err.detail || 'An asset with this code already exists.';
        if (/code/i.test(msg)) setErrors({ assetCode: msg });
        setFormError(msg);
      } else {
        setFormError(err?.message || 'Could not save the asset.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-card" onSubmit={submit} noValidate aria-label="Asset form">
      <InlineAlert>{formError}</InlineAlert>
      <div className="form-grid two">
        <FormField label="Asset code" required error={errors.assetCode} hint="Letters, digits, '-', '_' and '.' (max 50)">
          <input name="assetCode" value={values.assetCode} onChange={set('assetCode')} maxLength={60} className="input mono" autoFocus />
        </FormField>
        <FormField label="Name" required error={errors.name}>
          <input name="name" value={values.name} onChange={set('name')} maxLength={170} />
        </FormField>
        <FormField label="Category" required error={errors.category}>
          <input name="category" value={values.category} onChange={set('category')} list="asset-categories" maxLength={100} />
        </FormField>
        <FormField label="Location" required error={errors.location}>
          <input name="location" value={values.location} onChange={set('location')} list="asset-locations" maxLength={140} />
        </FormField>
        <FormField label="Status" error={errors.status}>
          <select name="status" value={values.status} onChange={set('status')}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Purchase date" error={errors.purchaseDate}>
          <input name="purchaseDate" type="date" value={values.purchaseDate} onChange={set('purchaseDate')} />
        </FormField>
      </div>
      <FormField label="Description" error={errors.description} counter={`${values.description.length}/2000`}>
        <textarea name="description" rows={4} value={values.description} onChange={set('description')} />
      </FormField>
      <datalist id="asset-categories">
        {facets?.categories?.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="asset-locations">
        {facets?.locations?.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function AssetFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const facets = useAsync((signal) => assetsApi.facets({ signal }), []);
  const existing = useAsync((signal) => assetsApi.get(id, { signal }), [id], { enabled: isEdit });
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (existing.data) setFormKey((k) => k + 1);
  }, [existing.data]);

  const handleSubmit = async (payload) => {
    if (isEdit) {
      const saved = await assetsApi.update(id, payload);
      toast.success(`Asset ${saved.assetCode} updated.`);
      navigate(`/assets/${saved.assetId}`);
    } else {
      const saved = await assetsApi.create(payload);
      toast.success(`Asset ${saved.assetCode} created.`);
      navigate(`/assets/${saved.assetId}`);
    }
  };

  const title = isEdit ? 'Edit asset' : 'New asset';
  const crumbs = isEdit
    ? [{ label: 'Assets', to: '/assets' }, { label: existing.data?.assetCode || `#${id}`, to: `/assets/${id}` }, { label: 'Edit' }]
    : [{ label: 'Assets', to: '/assets' }, { label: 'New' }];

  return (
    <div className="page narrow">
      <PageHeader title={title} breadcrumbs={crumbs} />
      {isEdit && existing.error ? (
        <ErrorState error={existing.error} onRetry={existing.reload} />
      ) : isEdit && !existing.data ? (
        <Loading />
      ) : isEdit && existing.data.isArchived ? (
        <div className="alert alert-info">
          Archived assets cannot be edited. <Link to={`/assets/${id}`}>Back to asset</Link>
        </div>
      ) : (
        <AssetForm
          key={formKey}
          initial={existing.data}
          facets={facets.data}
          submitLabel={isEdit ? 'Save changes' : 'Create asset'}
          onSubmit={handleSubmit}
          onCancel={() => navigate(isEdit ? `/assets/${id}` : '/assets')}
        />
      )}
    </div>
  );
}
