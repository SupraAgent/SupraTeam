-- Multi-account Telegram support: allow multiple TG sessions per user for BD teams
-- Phase 3: Drop unique constraint on user_id, add display_name, update RLS for team visibility

-- 1. Drop the UNIQUE constraint on user_id (was enforced by the table definition)
ALTER TABLE tg_client_sessions DROP CONSTRAINT IF EXISTS tg_client_sessions_user_id_key;

-- 2. Add display_name column for labeling sessions (e.g., "John's BD Account")
ALTER TABLE tg_client_sessions
ADD COLUMN IF NOT EXISTS display_name text;

-- 3. Add index on user_id (now that it's no longer unique, we need a regular index)
CREATE INDEX IF NOT EXISTS idx_tg_client_sessions_user_id
  ON tg_client_sessions(user_id);

-- 4. Add index on (user_id, is_active) for filtered lookups
CREATE INDEX IF NOT EXISTS idx_tg_client_sessions_user_active
  ON tg_client_sessions(user_id, is_active);

-- 5. Update RLS policies: team can see all sessions, but only owner can modify
DROP POLICY IF EXISTS "Users manage own TG sessions" ON tg_client_sessions;

-- Authenticated users can see all team sessions (for shared visibility)
CREATE POLICY "Team can view all TG sessions"
  ON tg_client_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only insert their own sessions
CREATE POLICY "Users insert own TG sessions"
  ON tg_client_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sessions
CREATE POLICY "Users update own TG sessions"
  ON tg_client_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own sessions
CREATE POLICY "Users delete own TG sessions"
  ON tg_client_sessions FOR DELETE
  USING (auth.uid() = user_id);
