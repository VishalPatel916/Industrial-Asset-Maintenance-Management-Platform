import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-synced list state (filters, sort, page) so views are bookmarkable and survive refresh.
 * `defaults` define the keys and their types (number / boolean / string).
 * setParams(patch) merges; any change other than `page` resets page to 1.
 */
export function useQueryParams(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const out = {};
    Object.entries(defaults).forEach(([key, def]) => {
      const raw = searchParams.get(key);
      if (raw === null) out[key] = def;
      else if (typeof def === 'number') out[key] = Number.isFinite(Number(raw)) ? Number(raw) : def;
      else if (typeof def === 'boolean') out[key] = raw === 'true';
      else out[key] = raw;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const resetPage = Object.keys(patch).some((k) => k !== 'page') && !('page' in patch);
          Object.entries(patch).forEach(([key, value]) => {
            const def = defaults[key];
            if (value === undefined || value === null || value === '' || value === def) next.delete(key);
            else next.set(key, String(value));
          });
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams],
  );

  return [params, setParams];
}
