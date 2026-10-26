'use client';
// Runs a new search (POST /api/search: the model reads the brief, and on the
// free plan it uses the company's one search), then opens its results.
//
// A saved search is re-run from its brief, then its saved filters are applied
// on top (POST /api/search/{id}/filters, free), so edits made before saving
// are kept even if the model reads the brief a little differently this time.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { getPlanState } from '@/lib/app-store';
import { describeSearchError, type ErrorCopy, type SearchUsage } from '@/lib/error-copy';
import { sameFilters } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';
import { refreshPlan } from '@/lib/use-plan';

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; phase: 'reading' | 'finding' }
  | { status: 'error'; copy: ErrorCopy; retry: () => void };

const PHASE_MS = 1000;

type PlanState = ReturnType<typeof getPlanState>;

/**
 * Did the failed search use a search? The server gives the reservation back
 * whenever the model or SQL fails, but a reply can also be lost after the
 * search finished, so trust the plan: remaining went down = used.
 */
function searchUsage(err: unknown, before: PlanState, after: PlanState): SearchUsage {
  // Auth runs before the reservation, and 'offline' is thrown before sending.
  if (err instanceof ApiClientError && (err.status === 401 || err.status === 403 || err.code === 'offline')) {
    return 'not_used';
  }
  if (after.status !== 'ready') return 'unknown';
  if (after.plan.plan === 'paid') return 'unlimited';
  const left = after.plan.searches_remaining ?? 0;
  if (before.status !== 'ready') return left > 0 ? 'not_used' : 'unknown';
  return left < (before.plan.searches_remaining ?? 0) ? 'used' : 'not_used';
}

export function useRunSearch() {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => clearTimer, []);

  async function run(brief: string, savedFilters?: Filters) {
    if (state.status === 'running') return;
    const planBefore = getPlanState();
    setState({ status: 'running', phase: 'reading' });
    clearTimer();
    timer.current = setTimeout(() => setState({ status: 'running', phase: 'finding' }), PHASE_MS);

    try {
      const res = await api.search(brief);
      if (savedFilters && !sameFilters(savedFilters, res.filters)) {
        // The search already ran (and was counted): if this step fails, still
        // open it with the filters the model chose rather than offer a retry
        // that would run, and count, a second search.
        await api.updateFilters(res.search_id, savedFilters).catch(() =>
          toast.error('Opened with fresh filters', { description: 'The saved filters could not be applied.' }),
        );
      }
      void refreshPlan();
      // Stay in "running" while the results page loads.
      router.push(`/search/${res.search_id}`);
    } catch (err) {
      clearTimer();
      if (err instanceof ApiClientError && err.status === 402) {
        // The API client already opened the upgrade dialog. Keep the text.
        void refreshPlan();
        setState({ status: 'idle' });
        return;
      }
      // Not after a 401/403: reading the plan with a dead session would redirect
      // to /login at once, and the card offering to sign in would never show.
      const sessionGone = err instanceof ApiClientError && (err.status === 401 || err.status === 403);
      if (!sessionGone) await refreshPlan();
      setState({
        status: 'error',
        copy: describeSearchError(err, searchUsage(err, planBefore, getPlanState())),
        retry: () => void run(brief, savedFilters),
      });
    }
  }

  return { state, run, reset: () => setState({ status: 'idle' }) };
}
