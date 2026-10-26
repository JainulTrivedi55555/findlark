-- Billing: apply one verified Stripe subscription event, in one transaction.
--
-- Called only by POST /api/billing/events after the signature check, with the
-- secret key (service_role). Returns what happened:
--   'duplicate' this event id was seen before: nothing changes
--   'ignored'   unknown company (or no subscription data): recorded, nothing changes
--   'stale'     older than what we already applied for this subscription: recorded, nothing changes
--   'applied'   subscription updated and the company's plan recomputed
--
-- Ordering rule: events are ordered by event.created from the BODY (when Stripe
-- created the event), never the Stripe-Signature t (when it was delivered;
-- a late redelivery of an old event carries a new t).
--
-- Tie-break for equal created timestamps: the event with the greater event id
-- (plain text comparison) wins. Any fixed rule works as long as it is the same
-- for every delivery order; this one makes the final state independent of the
-- order in which two same-second events arrive.

create or replace function public.apply_stripe_event(
  p_event_id        text,
  p_type            text,
  p_created         bigint,
  p_subscription_id text,
  p_company         text,
  p_status          text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_sub      public.subscriptions%rowtype;
begin
  -- 1. Dedupe by event id. A concurrent delivery of the same id blocks on the
  --    primary key until this transaction ends, then sees the conflict.
  insert into public.stripe_events (event_id, type, created)
  values (p_event_id, p_type, p_created)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  -- 2. Only subscriptions for companies we know. The event stays recorded.
  if p_subscription_id is null or p_status is null
     or p_company is null
     or not exists (select 1 from public.companies where id = p_company) then
    return 'ignored';
  end if;

  -- 3. Lock the company row: events for the same company apply one at a time,
  --    so two concurrent events cannot both read the old state.
  perform 1 from public.companies where id = p_company for update;

  -- 4. Never let an older event overwrite newer state (see tie-break above).
  select * into v_sub
    from public.subscriptions
   where stripe_subscription_id = p_subscription_id
     for update;
  if found and not (
       p_created > v_sub.last_event_created
       or (p_created = v_sub.last_event_created and p_event_id > v_sub.last_event_id)
     ) then
    return 'stale';
  end if;

  insert into public.subscriptions
    (stripe_subscription_id, company_id, status, last_event_created, last_event_id, updated_at)
  values
    (p_subscription_id, p_company, p_status, p_created, p_event_id, now())
  on conflict (stripe_subscription_id) do update
     set company_id         = excluded.company_id,
         status             = excluded.status,
         last_event_created = excluded.last_event_created,
         last_event_id      = excluded.last_event_id,
         updated_at         = now();

  -- 5. The plan is derived, never set directly: paid iff any active subscription.
  --    Also recompute the previous owner if a subscription changed company.
  update public.companies c
     set plan = case
                  when exists (select 1 from public.subscriptions s
                                where s.company_id = c.id and s.status = 'active')
                  then 'paid' else 'free'
                end
   where c.id = p_company
      or c.id = v_sub.company_id;

  return 'applied';
end;
$$;

revoke all on function public.apply_stripe_event(text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_event(text, text, bigint, text, text, text) to service_role;
