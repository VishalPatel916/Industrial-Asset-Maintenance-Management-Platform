import { useEffect, useId, useRef, useState } from 'react';
import { assetsApi } from '../api/endpoints';
import { useDebounce } from '../hooks/useDebounce';

/**
 * Searchable asset combobox backed by GET /api/assets?search=.
 * value: selected asset (AssetDto | null); onChange(asset | null).
 * Extra props (id, aria-*, className) are forwarded to the text input so FormField can wire it.
 */
export function AssetPicker({ value, onChange, placeholder = 'Search by code or name…', disabled, className, ...inputProps }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(query, 300);
  const listId = useId();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    assetsApi
      .list({ search: debounced, pageSize: 15, sortBy: 'code', desc: false }, { signal: controller.signal })
      .then((res) => {
        setResults(res?.items || []);
        setActive(-1);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const select = (asset) => {
    onChange(asset);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && results[active]) {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (value && !open) {
    return (
      <div className="asset-picker selected" ref={wrapRef}>
        <div className={`input asset-selected ${className?.includes('has-error') ? 'has-error' : ''}`}>
          <span className="mono">{value.assetCode}</span>
          <span className="asset-selected-name">{value.name}</span>
          <span className="muted small">{value.location}</span>
        </div>
        {!disabled && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onChange(null);
              setOpen(true);
            }}
          >
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="asset-picker" ref={wrapRef}>
      <input
        {...inputProps}
        className={className || 'input'}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="combo-list" id={listId} role="listbox">
          {loading && <li className="combo-info">Searching…</li>}
          {!loading && error && <li className="combo-info error">{error.message}</li>}
          {!loading && !error && results.length === 0 && <li className="combo-info">No matching assets</li>}
          {!loading &&
            results.map((a, i) => (
              <li
                key={a.assetId}
                role="option"
                aria-selected={i === active}
                className={`combo-option ${i === active ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(a);
                }}
              >
                <span className="mono">{a.assetCode}</span>
                <span>{a.name}</span>
                <span className="muted small">{a.location}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
