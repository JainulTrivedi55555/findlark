import { ApiError } from '@/lib/server/errors';
import { handle } from '@/lib/server/http';
import { applySubscriptionEvent, HANDLED_TYPES, SubscriptionEvent, verifyStripeSignature } from '@/lib/server/billing';

// POST /api/billing/events: Stripe webhook. No recruiter token: the signature is the auth.
// 400 for a missing/bad signature or unparseable JSON. 200 for everything else,
// including duplicates, unknown event types and unknown companies, so Stripe
// stops retrying events we have deliberately chosen to ignore.
export const POST = handle(async (req) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

  // Verify against the exact raw body before parsing anything.
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), secret)) {
    throw new ApiError(400, 'invalid_signature', 'Missing or invalid Stripe-Signature.');
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body is not valid JSON.');
  }

  const type = (body as { type?: unknown })?.type;
  if (typeof type !== 'string' || !HANDLED_TYPES.has(type)) {
    return Response.json({ received: true, result: 'ignored', reason: 'unhandled event type' });
  }
  const event = SubscriptionEvent.safeParse(body);
  if (!event.success) {
    return Response.json({ received: true, result: 'ignored', reason: 'unexpected event shape' });
  }

  const result = await applySubscriptionEvent(event.data);
  return Response.json({ received: true, result });
});
