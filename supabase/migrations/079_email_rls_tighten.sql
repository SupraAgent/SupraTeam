-- Fix: Tighten RLS on email templates — was auth.uid() IS NOT NULL (any user could CRUD any template)
DROP POLICY IF EXISTS "Authenticated users manage templates" ON crm_email_templates;
CREATE POLICY "Users manage own templates"
  ON crm_email_templates FOR ALL
  USING (auth.uid() = created_by);

-- Fix: Tighten RLS on email sequences — same issue
DROP POLICY IF EXISTS "Authenticated users manage sequences" ON crm_email_sequences;
CREATE POLICY "Users manage own sequences"
  ON crm_email_sequences FOR ALL
  USING (auth.uid() = created_by);

-- Fix: Tighten RLS on sequence enrollments
-- Add enrolled_by column if missing (referenced by cron worker)
ALTER TABLE crm_email_sequence_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_by UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Authenticated users manage enrollments" ON crm_email_sequence_enrollments;
CREATE POLICY "Users manage own enrollments"
  ON crm_email_sequence_enrollments FOR ALL
  USING (auth.uid() = enrolled_by);

-- Backfill enrolled_by from the sequence creator for existing rows
UPDATE crm_email_sequence_enrollments e
  SET enrolled_by = s.created_by
  FROM crm_email_sequences s
  WHERE e.sequence_id = s.id
    AND e.enrolled_by IS NULL;
