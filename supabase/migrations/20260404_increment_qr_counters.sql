-- Atomic counter increment for QR code scan/lead tracking (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_qr_counters(qr_id uuid, scan_inc int DEFAULT 1, lead_inc int DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE crm_qr_codes
  SET scan_count = COALESCE(scan_count, 0) + scan_inc,
      lead_count = COALESCE(lead_count, 0) + lead_inc
  WHERE id = qr_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
