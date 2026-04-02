-- Add Gmail label ID mapping to email groups.
-- For Gmail connections, groups map to real Gmail labels (SupraCRM/Name).
-- For IMAP connections, this column stays NULL and the junction table is used.

ALTER TABLE crm_email_groups ADD COLUMN IF NOT EXISTS gmail_label_id text;

CREATE INDEX IF NOT EXISTS idx_email_groups_gmail_label
  ON crm_email_groups(gmail_label_id) WHERE gmail_label_id IS NOT NULL;

-- Update the atomic insert to accept gmail_label_id
CREATE OR REPLACE FUNCTION insert_email_group_atomic(
  p_user_id uuid,
  p_connection_id uuid,
  p_name text,
  p_color text default '#3b82f6',
  p_gmail_label_id text default null
)
RETURNS crm_email_groups AS $$
DECLARE
  result crm_email_groups;
BEGIN
  -- Verify the caller is the user they claim to be
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user_id mismatch';
  END IF;

  -- Lock existing rows to prevent TOCTOU race on position calculation
  PERFORM 1 FROM crm_email_groups
    WHERE connection_id = p_connection_id AND user_id = p_user_id
    FOR UPDATE;

  INSERT INTO crm_email_groups (user_id, connection_id, name, color, position, gmail_label_id)
  VALUES (
    p_user_id,
    p_connection_id,
    p_name,
    p_color,
    COALESCE((SELECT max(position) + 1 FROM crm_email_groups WHERE connection_id = p_connection_id AND user_id = p_user_id), 0),
    p_gmail_label_id
  )
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
