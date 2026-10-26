'use client';
// Loads one page of a stored search (GET /api/search/{id}?page=N). Paging is
// a cheap read: no model call, no quota. Only the newest request may update
// the screen, so fast clicks through pages never show a stale page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import type { SearchPage } from '@/lib/api-types';

export type SearchPageState =
  | { status: 'loading' }
  | { status: 'ready'; data: SearchPage; pageLoading: boolean; version: number }
  | { status: 'error'; error: unknown }
  | { status: 'notfound' };

export function useSearchPage(searchId: string, page: number) {
  const [state, setState] = useState<SearchPageState>({ status: 'loading' });
  const shown = useRef<SearchPage | null>(null);
  const latest = useRef(0);
  const version = useRef(0);

  const show = useCallback((data: SearchPage) => {
    shown.current = data;
    version.current += 1;
    setState({ status: 'ready', data, pageLoading: false, version: version.current });
  }, []);

  const load = useCallback(async () => {
    const request = ++latest.current;
    // Keep the header and chips while another page loads; skeleton only the list.
    setState((s) => (s.status === 'ready' ? { ...s, pageLoading: true } : { status: 'loading' }));
    try {
      const data = await api.searchPage(searchId, page);
      if (request === latest.current) show(data);
    } catch (err) {
      if (request !== latest.current) return;
      if (err instanceof ApiClientError && err.status === 404) setState({ status: 'notfound' });
      else setState({ status: 'error', error: err });
    }
  }, [searchId, page, show]);

  useEffect(() => {
    // Already showing this page (right after Apply): no request needed.
    if (shown.current?.search_id === searchId && shown.current.page === page) return;
    void load();
  }, [searchId, page, load]);

  /** Shows a response we already have (from Apply) and cancels any page load in flight. */
  const replace = useCallback(
    (data: SearchPage) => {
      latest.current += 1;
      show(data);
    },
    [show],
  );

  return { state, retry: load, replace };
}
