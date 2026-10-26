import 'server-only';
import { z } from 'zod';
import { ApiError, errorResponse } from './errors';

// Small helpers every route handler uses, so each route reads top to bottom:
// auth -> validate -> query -> respond. Every failure becomes { error, message }.

type Context<P> = { params: Promise<P> };

/**
 * Free text from a user (brief, list name): trimmed, 1..max characters, and
 * cleaned of what Postgres text cannot store. A NUL byte or a lone surrogate
 * would otherwise be a 500 at insert time, so they are removed up front.
 */
export const safeText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\u0000/g, '').toWellFormed())
    .pipe(z.string().trim().min(1).max(max));

/** Wraps a route handler so any thrown error becomes a clean JSON error response. */
export function handle<P = Record<string, never>>(
  fn: (req: Request, ctx: Context<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: Context<P>): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue?.message ?? 'invalid input'}`;
}

/** Parses a JSON body with a zod schema. Bad JSON or a bad shape is a 400. */
export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'invalid_request', firstIssue(parsed.error));
  return parsed.data;
}

// Path ids. A malformed id cannot name an existing resource, so it is a 404,
// the same answer as "exists but belongs to another company".
const Uuid = z.uuid();
const PersonId = z.string().regex(/^cand_\d{1,10}$/);

export function uuidParam(value: string, what: string): string {
  if (!Uuid.safeParse(value).success) throw notFound(what);
  return value;
}

export function personParam(value: string): string {
  if (!PersonId.safeParse(value).success) throw notFound('Person');
  return value;
}

export function notFound(what: string): ApiError {
  return new ApiError(404, 'not_found', `${what} not found.`);
}

/** ?page=N, a whole number from 1. Missing means 1. Anything else is a 400. */
export function pageParam(req: Request): number {
  const raw = new URL(req.url).searchParams.get('page');
  if (raw === null) return 1;
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1) {
    throw new ApiError(400, 'invalid_page', 'page must be a whole number from 1.');
  }
  return Number(raw);
}

/** Throws on a Supabase error; the message is logged, never sent to the client. */
export function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
