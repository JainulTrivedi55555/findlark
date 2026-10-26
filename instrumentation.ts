// Runs once when the Next.js server starts.
// 1. Fires one small model call in the background so the first real search finds
//    the prompt cache (and the compiled output schema) warm.
// 2. Requests the main routes once so the first real request does not pay for
//    loading them: compiling in `next dev`, loading the route code in `next start`
//    (see warmRoutes).
// Neither is awaited, so they never delay startup, and both swallow every error.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  void warmRoutes();
  if (!process.env.ANTHROPIC_API_KEY) return;
  try {
    const { warmUp } = await import('./lib/server/llm');
    void warmUp();
  } catch {
    // Never let a warm-up problem affect the server.
  }
}

// `next dev` compiles each route on its first request, which added ~1.5 s to the
// first search; `next start` loads a route's code on its first request, which
// made the first search ~1.5 s slower than the rest (measured).
// These unauthenticated requests stop at 401/404 (auth runs first, so no data is
// read and no model is called); loading the route is the point.
// API routes go first because API clients (and the tests) time them; pages after.
const API_ROUTES: Array<[method: string, path: string]> = [
  ['GET', '/api/plan'],
  ['GET', '/api/search/00000000-0000-0000-0000-000000000000'],
  ['POST', '/api/search/00000000-0000-0000-0000-000000000000/filters'],
  ['GET', '/api/people/x'],
  ['GET', '/api/shortlists'],
  ['GET', '/api/saved-briefs'],
  ['GET', '/api/searches'],
];
const PAGES = ['/login', '/'];

async function warmRoutes(): Promise<void> {
  try {
    const base = `http://localhost:${process.env.PORT ?? '3000'}`;
    const started = performance.now();
    const hit = async (method: string, path: string) => {
      const res = await fetch(base + path, { method, cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      await res.arrayBuffer();
    };

    // register() runs before the server listens, so retry the first request
    // (the slowest route, /api/search) until it connects: 30 s at most.
    let connected = false;
    for (let attempt = 0; attempt < 120 && !connected; attempt++) {
      try {
        await hit('POST', '/api/search');
        connected = true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (!connected) return;

    await Promise.allSettled(API_ROUTES.map(([method, path]) => hit(method, path)));
    await Promise.allSettled(PAGES.map((path) => hit('GET', path)));
    console.log(`routes warmed in ${Math.round(performance.now() - started)} ms`);
  } catch {
    // A speed-up only: never let it affect the server.
  }
}
