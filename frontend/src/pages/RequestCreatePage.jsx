import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mapFieldErrors } from '../api/client';
import { assetsApi, requestsApi } from '../api/endpoints';
import { AssetPicker } from '../components/AssetPicker';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/Layout';
import { InlineAlert } from '../components/States';
import { useToast } from '../context/ToastContext';
import { PRIORITIES } from '../utils/constants';
import { hasErrors, validateRequest } from '../utils/validation';

const FIELDS = ['assetId', 'title', 'description', 'priority'];

/** Report-an-issue form. `onCreated(request)` is called after a successful POST. */
export function RequestForm({ initialAsset = null, onCreated, onCancel }) {
  const toast = useToast();
  const [asset, setAsset] = useState(initialAsset);
  const [values, setValues] = useState({ title: '', description: '', priority: 'Medium' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialAsset) setAsset(initialAsset);
  }, [initialAsset]);

  const current = (patch = {}) => ({ assetId: asset?.assetId, ...values, ...patch });

  const set = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    if (submitted) setErrors(validateRequest({ assetId: asset?.assetId, ...next }));
  };

  const pickAsset = (a) => {
    setAsset(a);
    if (submitted) setErrors(validateRequest(current({ assetId: a?.assetId })));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const v = validateRequest(current());
    setErrors(v);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      const created = await requestsApi.create({
        assetId: asset.assetId,
        title: values.title.trim(),
        description: values.description.trim(),
        priority: values.priority,
      });
      toast.success(`Issue reported as REQ-${created.requestId}.`);
      onCreated?.(created);
    } catch (err) {
      if (err.status === 400 && err.errors) {
        const { _form, ...fieldErrors } = mapFieldErrors(err.errors, FIELDS);
        setErrors(fieldErrors);
        setFormError(_form || 'Please correct the highlighted fields.');
      } else {
        setFormError(err.message);
      }
      setBusy(false);
    }
  };

  const titleLen = values.title.trim().length;
  const descLen = values.description.trim().length;

  return (
    <form className="card form-card" onSubmit={submit} noValidate aria-label="Report issue form">
      <InlineAlert>{formError}</InlineAlert>
      <FormField label="Asset" required error={errors.assetId} hint="Search by asset code or name.">
        <AssetPicker value={asset} onChange={pickAsset} />
      </FormField>
      <FormField label="Title" required error={errors.title} counter={`${titleLen}/150`} hint="3–150 characters">
        <input name="title" value={values.title} onChange={set('title')} maxLength={170} placeholder="e.g. Pump vibrating above threshold" />
      </FormField>
      <FormField label="Description" required error={errors.description} counter={`${descLen}/4000`} hint="10–4000 characters. What happened, when, and any readings.">
        <textarea name="description" rows={6} value={values.description} onChange={set('description')} />
      </FormField>
      <fieldset className="form-field priority-picker">
        <legend className="form-label">Priority</legend>
        <div className="segmented" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <label key={p} className={`segment seg-${p.toLowerCase()} ${values.priority === p ? 'checked' : ''}`}>
              <input type="radio" name="priority" value={p} checked={values.priority === p} onChange={set('priority')} />
              {p}
            </label>
          ))}
        </div>
        {errors.priority && <span className="field-error">{errors.priority}</span>}
      </fieldset>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}

export default function RequestCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get('assetId');
  const [initialAsset, setInitialAsset] = useState(null);
  const [assetError, setAssetError] = useState(null);

  useEffect(() => {
    if (!assetId) return undefined;
    const controller = new AbortController();
    assetsApi
      .get(assetId, { signal: controller.signal })
      .then(setInitialAsset)
      .catch((err) => err?.name !== 'AbortError' && setAssetError(`Could not load asset #${assetId}: ${err.message}`));
    return () => controller.abort();
  }, [assetId]);

  return (
    <div className="page narrow">
      <PageHeader
        title="Report an issue"
        subtitle="Describe the problem so the maintenance team can triage it."
        breadcrumbs={[{ label: 'Maintenance requests', to: '/requests' }, { label: 'New' }]}
      />
      {assetError && <InlineAlert type="info">{assetError}</InlineAlert>}
      <RequestForm initialAsset={initialAsset} onCreated={(r) => navigate(`/requests/${r.requestId}`)} onCancel={() => navigate(-1)} />
    </div>
  );
}
