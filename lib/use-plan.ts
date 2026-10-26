'use client';
// The company's plan, shared by the plan pill and anything that changes it.
// Call refreshPlan() after a search (it uses the free search) or any time the
// plan may have changed.
import { useEffect } from 'react';
import { api } from './api-client';
import { setPlanState, useAppStore } from './app-store';

let inFlight: Promise<void> | null = null;

/** Re-reads GET /api/plan. Concurrent calls share one request. */
export function refreshPlan(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = api
    .plan()
    .then((plan) => setPlanState({ status: 'ready', plan }))
    .catch(() => setPlanState({ status: 'error' }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Plan state for rendering. Loads it the first time any component asks. */
export function usePlan() {
  const plan = useAppStore((s) => s.plan);
  useEffect(() => {
    if (plan.status === 'loading') void refreshPlan();
  }, [plan.status]);
  return plan;
}
