-- Persistent rate-limit buckets for Telegram send layer.
-- Replaces in-memory-only token buckets that are lost on crash
-- and break multi-instance deployments.

create table if not exists crm_rate_limit_buckets (
  id            text        primary key,
  tokens        numeric     not null,
  max_tokens    numeric     not null,
  last_refill_at timestamptz not null default now(),
  refill_rate   numeric     not null  -- tokens per second
);

-- Atomic token-bucket consume function.
-- Upserts the bucket, refills based on elapsed time, attempts to consume 1 token.
-- Returns true if allowed, false if rate-limited.
create or replace function consume_rate_limit_token(
  bucket_id     text,
  p_max_tokens  numeric,
  p_refill_rate numeric
) returns boolean
language plpgsql
as $$
declare
  v_tokens   numeric;
  v_elapsed  numeric;
  v_now      timestamptz := now();
begin
  -- Upsert: insert full bucket if missing, otherwise lock the row
  insert into crm_rate_limit_buckets (id, tokens, max_tokens, last_refill_at, refill_rate)
  values (bucket_id, p_max_tokens, p_max_tokens, v_now, p_refill_rate)
  on conflict (id) do nothing;

  -- Lock the row and read current state
  select tokens, extract(epoch from (v_now - last_refill_at))
    into v_tokens, v_elapsed
    from crm_rate_limit_buckets
   where id = bucket_id
     for update;

  -- Refill tokens based on elapsed time
  if v_elapsed > 0 then
    v_tokens := least(p_max_tokens, v_tokens + v_elapsed * p_refill_rate);
  end if;

  -- Try to consume
  if v_tokens >= 1 then
    update crm_rate_limit_buckets
       set tokens = v_tokens - 1,
           max_tokens = p_max_tokens,
           last_refill_at = v_now,
           refill_rate = p_refill_rate
     where id = bucket_id;
    return true;
  else
    -- Update refill time even when denied so next call calculates correctly
    update crm_rate_limit_buckets
       set tokens = v_tokens,
           max_tokens = p_max_tokens,
           last_refill_at = v_now,
           refill_rate = p_refill_rate
     where id = bucket_id;
    return false;
  end if;
end;
$$;
