-- Add sort_order to email connections for drag-and-drop tab reordering
ALTER TABLE crm_email_connections
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- Backfill existing rows: default connections first, then by connected_at
UPDATE crm_email_connections
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY is_default DESC, connected_at ASC
  ) - 1 AS rn
  FROM crm_email_connections
) sub
WHERE crm_email_connections.id = sub.id;
