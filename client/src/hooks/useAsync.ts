import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errorMessage';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export interface AsyncResult<T> extends AsyncState<T> {
  reload: () => void;
  /** Replaces the loaded value without refetching, for optimistic updates. */
  setData: (next: T) => void;
}

/**
 * Loads data on mount and whenever `deps` change.
 *
 * Every page here does the same three things -- fetch, show a spinner, show an error --
 * and doing that inline gets the stale-response case wrong sooner or later. The guard is
 * a request sequence number rather than an AbortController: the pages that change
 * arguments quickly (the search box) would otherwise be able to render the response to a
 * superseded query.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  fallback = 'Could not load this content.',
): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  const latest = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const request = latest.current + 1;
    latest.current = request;

    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    load()
      .then((data) => {
        if (latest.current === request) setState({ data, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (latest.current === request) {
          setState({ data: null, isLoading: false, error: errorMessage(error, fallback) });
        }
      });
    // `load` is a fresh closure on every render, so it cannot be a dependency; the caller
    // declares what the fetch actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const setData = useCallback(
    (next: T) => setState({ data: next, isLoading: false, error: null }),
    [],
  );

  return { ...state, reload, setData };
}
