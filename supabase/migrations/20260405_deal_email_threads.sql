-- Link email threads to deals (Phase 5: email-to-deal linking)
CREATE TABLE IF NOT EXISTS public.crm_deal_email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  connection_id uuid NOT NULL,
  subject text,
  linked_by uuid REFERENCES auth.users(id),
  linked_at timestamptz DEFAULT now(),
  UNIQUE(deal_id, thread_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_email_threads_deal ON public.crm_deal_email_threads(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_email_threads_thread ON public.crm_deal_email_threads(thread_id);

ALTER TABLE public.crm_deal_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view deal email threads"
  ON public.crm_deal_email_threads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deal email threads"
  ON public.crm_deal_email_threads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deal email threads"
  ON public.crm_deal_email_threads FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete deal email threads"
  ON public.crm_deal_email_threads FOR DELETE
  TO authenticated
  USING (true);
