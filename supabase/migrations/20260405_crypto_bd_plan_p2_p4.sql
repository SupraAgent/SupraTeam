-- Meeting-to-deal junction table for calendar→pipeline linking
CREATE TABLE IF NOT EXISTS public.crm_calendar_event_deals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_event_id uuid NOT NULL REFERENCES public.crm_calendar_events(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(calendar_event_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_deals_deal
  ON public.crm_calendar_event_deals (deal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_deals_event
  ON public.crm_calendar_event_deals (calendar_event_id);

ALTER TABLE public.crm_calendar_event_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage calendar event deals"
  ON public.crm_calendar_event_deals FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Handoff summary for AI agent escalations
ALTER TABLE public.crm_ai_conversations
  ADD COLUMN IF NOT EXISTS handoff_summary text;

-- Company crypto-native fields for protocol BD qualification
ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS tvl numeric,
  ADD COLUMN IF NOT EXISTS chains text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_status text CHECK (token_status IN ('pre-token', 'live', 'vesting')),
  ADD COLUMN IF NOT EXISTS funding_round text,
  ADD COLUMN IF NOT EXISTS dex_listings text[] DEFAULT '{}';
