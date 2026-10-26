'use client';
// Typed fetch wrapper for our /api routes: the only way the UI reads or writes
// app data. Scripts and other API clients call these same routes.
//
// Every request:
//   - attaches the signed-in recruiter's access token as Authorization: Bearer
//   - turns any failure into an ApiClientError: offline, timeout, network,
//     a non-2xx answer (with its { error, message } body when it is JSON) or
//     a 2xx answer that is not JSON. err.message is always plain language,
//     never a status code or a raw body (lib/error-copy.ts)
//   - 401: the session is gone or invalid -> sign out and go to /login
//     (except a new search, which shows a "sign in again" card instead)
//   - 402 free_limit_reached: open the upgrade dialog, then still throw so the
//     caller can stop its loading state
import type {
  ApiErrorBody,
  Created,
  Deleted,
  Filters,
  Membership,
  Person,
  Plan,
  RecentSearchesResponse,
  Renamed,
  SavedBriefsResponse,
  SearchPage,
  SearchResponse,
  ShortlistDetail,
  ShortlistsResponse,
} from './api-types';
import { openUpgrade, resetAppStore, setPlanState } from './app-store';
import { shortMessage } from './error-copy';
import { supabaseBrowser } from './supabase-browser';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body: ApiErrorBody | null = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Signs out and goes to /login (also the "Sign in again" button). */
export async function signOutAndRedirect() {
  resetAppStore();
  await supabaseBrowser().auth.signOut().catch(() => {});
  // A full page load on purpose: it drops every bit of in-memory state from
  // the expired session. This runs outside React, where there is no router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (window.location.pathname !== '/login') window.location.assign('/login');
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' && value !== null &&
    typeof (value as ApiErrorBody).error === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}

type RequestOptions = {
  /** Give up after this long. A new search can take up to ~17 s on the server (5 s x 3 model attempts). */
  timeoutMs?: number;
  /** On 401, sign out and go to /login (default). false: just throw, the caller shows a sign-in card. */
  redirectOn401?: boolean;
};

const DEFAULT_TIMEOUT_MS = 15_000;

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, redirectOn401 = true } = options;
  if (offline()) throw new ApiClientError(0, 'offline', shortMessage(0, 'offline'));

  // getSession reads the stored session and refreshes it first if it expired.
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    await signOutAndRedirect();
    throw new ApiClientError(401, 'unauthorized', 'Please sign in again.');
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const code = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : offline() ? 'offline' : 'network_error';
    throw new ApiClientError(0, code, shortMessage(0, code));
  }

  // Not every answer is ours: a proxy or a crashed server can send an HTML page.
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    if (json === null) throw new ApiClientError(res.status, 'bad_response', shortMessage(res.status, 'bad_response'));
    return json as T;
  }

  const errorBody = isErrorBody(json) ? json : null;
  // Our 4xx messages are written for people (e.g. "That name is already used");
  // anything else gets our own copy, so no status code or raw body is shown.
  const fromServer = errorBody && res.status < 500 ? errorBody.message : null;
  const error = new ApiClientError(
    res.status,
    errorBody?.error ?? 'http_error',
    fromServer ?? shortMessage(res.status, errorBody?.error ?? 'http_error'),
    errorBody,
  );

  if (res.status === 401 && redirectOn401) await signOutAndRedirect();
  if (res.status === 402 && error.code === 'free_limit_reached') {
    setPlanState({ status: 'ready', plan: { plan: 'free', searches_remaining: 0 } });
    openUpgrade();
  }
  throw error;
}

const enc = encodeURIComponent;

export const api = {
  plan: () => request<Plan>('GET', '/api/plan'),

  search: (brief: string) =>
    request<SearchResponse>('POST', '/api/search', { brief }, { timeoutMs: 30_000, redirectOn401: false }),
  searchPage: (searchId: string, page: number) =>
    request<SearchPage>('GET', `/api/search/${enc(searchId)}?page=${page}`),
  recentSearches: () => request<RecentSearchesResponse>('GET', '/api/searches'),
  updateFilters: (searchId: string, filters: Filters) =>
    request<SearchResponse>('POST', `/api/search/${enc(searchId)}/filters`, { filters }),

  person: (personId: string) => request<Person>('GET', `/api/people/${enc(personId)}`),

  shortlists: () => request<ShortlistsResponse>('GET', '/api/shortlists'),
  shortlist: (id: string) => request<ShortlistDetail>('GET', `/api/shortlists/${enc(id)}`),
  createShortlist: (name: string) => request<Created>('POST', '/api/shortlists', { name }),
  renameShortlist: (id: string, name: string) => request<Renamed>('PATCH', `/api/shortlists/${enc(id)}`, { name }),
  deleteShortlist: (id: string) => request<Deleted>('DELETE', `/api/shortlists/${enc(id)}`),
  addToShortlist: (id: string, personId: string) =>
    request<Membership>('POST', `/api/shortlists/${enc(id)}/people/${enc(personId)}`),
  removeFromShortlist: (id: string, personId: string) =>
    request<Membership>('DELETE', `/api/shortlists/${enc(id)}/people/${enc(personId)}`),

  savedBriefs: () => request<SavedBriefsResponse>('GET', '/api/saved-briefs'),
  saveBrief: (brief: string, filters: Filters) => request<Created>('POST', '/api/saved-briefs', { brief, filters }),
  deleteSavedBrief: (id: string) => request<Deleted>('DELETE', `/api/saved-briefs/${enc(id)}`),
};
