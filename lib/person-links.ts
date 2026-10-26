// Links to and from the candidate page. Pure.
//
// A result card links to /people/{id}?search={searchId}&from=/search/{searchId}?page=N
// so the candidate page can highlight the skills the search asked for and send
// the recruiter back to the same results page.

const SEARCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only our own results pages: /search/{uuid} with an optional ?page=N. This
// also rules out "//evil.com" and "https://..." (an open redirect).
const BACK_PATH = /^\/search\/[0-9a-f-]{36}(\?page=\d{1,6})?$/i;

export function personHref(personId: string, search?: { id: string; page: number }): string {
  const base = `/people/${encodeURIComponent(personId)}`;
  if (!search) return base;
  const from = search.page > 1 ? `/search/${search.id}?page=${search.page}` : `/search/${search.id}`;
  return `${base}?search=${encodeURIComponent(search.id)}&from=${encodeURIComponent(from)}`;
}

/** ?from=... as a safe in-app path, or null. */
export function safeBackPath(raw: string | null): string | null {
  return raw !== null && BACK_PATH.test(raw) ? raw : null;
}

/** ?search=... as a search id, or null. */
export function safeSearchId(raw: string | null): string | null {
  return raw !== null && SEARCH_ID.test(raw) ? raw : null;
}
