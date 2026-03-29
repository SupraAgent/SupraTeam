-- Fix push events RLS: INSERT/UPDATE policies were WITH CHECK (true),
-- allowing any authenticated user to insert fake push events for any user.
-- The webhook handler uses service role (bypasses RLS), so these policies
-- should be restricted to prevent client-side abuse.

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Service role inserts push events" ON crm_email_push_events;
DROP POLICY IF EXISTS "Service role updates push events" ON crm_email_push_events;

-- Recreate with user_id scoping — service role bypasses RLS anyway,
-- but authenticated users can only insert/update their own events
CREATE POLICY "Users insert own push events"
  ON crm_email_push_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own push events"
  ON crm_email_push_events FOR UPDATE
  USING (user_id = auth.uid());
