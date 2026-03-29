-- Atomic deal update that returns the previous value (fixes read-modify-write race)
-- Performs UPDATE and returns old value in a single transaction
CREATE OR REPLACE FUNCTION update_deal_value_returning_old(
  p_deal_id UUID,
  p_new_value NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_value NUMERIC;
BEGIN
  SELECT value INTO v_old_value
  FROM crm_deals
  WHERE id = p_deal_id
  FOR UPDATE;

  UPDATE crm_deals
  SET value = p_new_value, updated_at = now()
  WHERE id = p_deal_id;

  RETURN v_old_value;
END;
$$;
