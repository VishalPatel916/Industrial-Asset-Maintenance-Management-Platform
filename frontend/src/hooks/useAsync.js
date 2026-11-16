import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader whenever `deps` change. The loader receives an AbortSignal;
 * stale responses are ignored. Returns { data, error, loading, reload, setData }.
 * Pass `enabled: false` to skip loading.
 */
export function useAsync(loader, deps = [], { enabled = true, keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ data: keepPrevious ? s.data : undefined, error: null, loading: true }));
    Promise.resolve()
      .then(() => loaderRef.current(controller.signal))
      .then(
        (data) => {
          if (!controller.signal.aborted) setState({ data, error: null, loading: false });
        },
        (error) => {
          if (controller.signal.aborted || error?.name === 'AbortError') return;
          setState((s) => ({ data: s.data, error, loading: false }));
        },
      );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload, setData };
}
