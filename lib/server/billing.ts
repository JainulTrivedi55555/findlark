import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from './supabase';

/**
 * Verifies a Stripe-Signature header ("t=...,v1=...,v1=...") against the raw body.
 * Offline: HMAC-SHA256 of `${t}.${rawBody}` with the webhook secret, compared in
 * constant time with every v1 value; any match is valid (Stripe sends several
 * v1 values while a secret is being rotated).
 *
 * The timestamp's age is deliberately NOT checked. The demo events in
 * seed/stripe-events.json were signed long ago and must stay replayable, so a
 * tolerance window would reject valid events. Replay safety comes from the database instead: a repeated event
 * id is a no-op, and an older event never overwrites newer state.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// The fields we use from a customer.subscription.* event. Anything else in the
// body is ignored. An event that does not fit this shape is ignored, not an error.
export const SubscriptionEvent = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
  created: z.number().int().nonnegative(),
  data: z.object({
    object: z.object({
      id: z.string().min(1).max(255),
      status: z.string().min(1).max(64),
      metadata: z.object({ company: z.string().max(64).optional() }).partial().optional(),
    }),
  }),
});

export const HANDLED_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export type ApplyResult = 'applied' | 'duplicate' | 'stale' | 'ignored';

/** Records and applies one verified event in a single SQL transaction. */
export async function applySubscriptionEvent(event: z.infer<typeof SubscriptionEvent>): Promise<ApplyResult> {
  const sub = event.data.object;
  // A deleted subscription is over, whatever status the payload carries.
  const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;

  const { data, error } = await createAdminClient().rpc('apply_stripe_event', {
    p_event_id: event.id,
    p_type: event.type,
    p_created: event.created, // from the body, never the signature header's t
    p_subscription_id: sub.id,
    p_company: sub.metadata?.company ?? null,
    p_status: status,
  });
  if (error) throw new Error(`apply_stripe_event: ${error.message}`);
  return data as ApplyResult;
}
