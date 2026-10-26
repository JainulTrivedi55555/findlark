import 'server-only';

// One error shape for every API response: { error, message }.
// Route handlers throw ApiError for expected failures and pass anything
// caught to errorResponse(), which never leaks a stack trace or internals.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.code, message: err.message, ...err.extra }, { status: err.status });
  }
  // Log only the message on the server; the client gets a generic 500.
  console.error('Unhandled API error:', err instanceof Error ? err.message : 'unknown error');
  return Response.json({ error: 'internal_error', message: 'Something went wrong.' }, { status: 500 });
}
