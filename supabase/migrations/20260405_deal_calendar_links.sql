-- Deal ↔ Calendar Event link table
-- Enables meeting-to-deal attribution and "Schedule Meeting" from deal view

CREATE TABLE IF NOT EXISTS public.crm_deal_calendar_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  calendar_event_id uuid NOT NULL REFERENCES public.crm_calendar_events(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(deal_id, calendar_event_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_calendar_links_deal ON public.crm_deal_calendar_links(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_calendar_links_event ON public.crm_deal_calendar_links(calendar_event_id);
