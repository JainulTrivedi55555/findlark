// Plain-language copy for every failed request the UI shows. Pure, no I/O.
//
// The UI never shows a raw status code or response body: an HTML error page
// from a proxy, a JSON 500 and a dropped connection all end up here and get
// a title, a message and one next step (retry, or sign in again).

/** The parts of an ApiClientError this module needs (kept structural to avoid an import cycle). */
type RequestError = { status: number; code: string };

export type ErrorKind =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'session'
  | 'forbidden'
  | 'rate_limit'
  | 'server'
  | 'bad_request'
  | 'unknown';

/**
 * Whether a failed new search used the company's free search, as far as the
 * client can tell (see useRunSearch, which compares the plan before and after):
 *   not_used  - the server gave it back (it always does when the model or SQL fails)
 *   used      - the plan went down, so the search ran even though the reply was lost
 *   unlimited - paid plan: nothing to use up
 *   unknown   - the plan could not be read
 */
export type SearchUsage = 'not_used' | 'used' | 'unlimited' | 'unknown';

export type ErrorCopy = {
  kind: ErrorKind;
  title: string;
  message: string;
  /** The main button: try the same thing again, or sign in again (retrying cannot help). */
  action: 'retry' | 'sign_in';
};

function isRequestError(err: unknown): err is RequestError {
  return (
    typeof err === 'object' && err !== null &&
    typeof (err as RequestError).status === 'number' &&
    typeof (err as RequestError).code === 'string'
  );
}

export function errorKind(err: unknown): ErrorKind {
  if (!isRequestError(err)) return 'unknown';
  if (err.code === 'offline') return 'offline';
  if (err.code === 'timeout') return 'timeout';
  if (err.status === 0) return 'network';
  if (err.status === 401) return 'session';
  if (err.status === 403) return 'forbidden';
  if (err.status === 429) return 'rate_limit';
  if (err.status >= 500) return 'server';
  if (err.status >= 400) return 'bad_request';
  return 'unknown'; // e.g. a 200 whose body was not JSON
}

const BASE: Record<ErrorKind, Omit<ErrorCopy, 'kind'>> = {
  offline: { title: 'You’re offline', message: 'Check your internet connection, then try again.', action: 'retry' },
  network: { title: 'Can’t reach Findlark', message: 'The connection dropped before an answer came back. Try again in a moment.', action: 'retry' },
  timeout: { title: 'This is taking too long', message: 'The server didn’t answer in time. Try again in a moment.', action: 'retry' },
  session: { title: 'Your session has expired', message: 'Sign in again to carry on.', action: 'sign_in' },
  forbidden: { title: 'This account can’t do that', message: 'Sign in with a recruiter account to carry on.', action: 'sign_in' },
  rate_limit: { title: 'Too many requests', message: 'Wait a few seconds, then try again.', action: 'retry' },
  server: { title: 'Something went wrong on our side', message: 'It’s not something you did. Try again in a moment.', action: 'retry' },
  bad_request: { title: 'That request didn’t work', message: 'Try again. If it keeps happening, reload the page.', action: 'retry' },
  unknown: { title: 'Something went wrong', message: 'Try again in a moment.', action: 'retry' },
};

/** Copy for a failed page load or action (results page, a candidate, a list). */
export function describeError(err: unknown): ErrorCopy {
  const kind = errorKind(err);
  return { kind, ...BASE[kind] };
}

/** One sentence on whether a failed new search used a search. */
export function usageSentence(usage: SearchUsage): string {
  switch (usage) {
    case 'not_used':
      return 'Your search was not used.';
    case 'used':
      return 'Your free search was used, but the results didn’t come back. Open it from Recent searches below.';
    case 'unlimited':
      return 'Nothing was used up: your plan has unlimited searches.';
    case 'unknown':
      return 'If the search went through, it will appear under Recent searches below.';
  }
}

/** Copy for a failed new search (POST /api/search). Always says whether the search was used. */
export function describeSearchError(err: unknown, usage: SearchUsage): ErrorCopy {
  const copy = describeError(err);
  const titles: Partial<Record<ErrorKind, string>> = {
    server: 'The search didn’t finish',
    bad_request: 'We couldn’t read that brief',
    unknown: 'The search didn’t finish',
  };
  const messages: Partial<Record<ErrorKind, string>> = {
    bad_request: 'Rephrase it or make it shorter, then search again.',
    session: 'Sign in again to search.',
  };
  return {
    ...copy,
    title: titles[copy.kind] ?? copy.title,
    message: `${messages[copy.kind] ?? copy.message} ${usageSentence(usage)}`,
  };
}

/** Short message for toasts and inline errors (ApiClientError.message). */
export function shortMessage(status: number, code: string): string {
  return describeError({ status, code }).title + '.';
}

/** app/error.tsx and app/global-error.tsx: the page itself failed to render. */
export const PAGE_ERROR_COPY: ErrorCopy = {
  kind: 'unknown',
  title: 'This page didn’t load',
  message: 'Something went wrong while showing this page. It’s not something you did. Try again, or reload the page.',
  action: 'retry',
};
