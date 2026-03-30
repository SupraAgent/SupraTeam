-- Create crm_companies table
CREATE TABLE IF NOT EXISTS public.crm_companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  domain text,
  industry text,
  website text,
  description text,
  logo_url text,
  employee_count int,
  location text,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add company_id to crm_contacts
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

-- Add company_id to tg_groups
ALTER TABLE public.tg_groups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON public.crm_companies (name);
CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON public.crm_companies (domain);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_id ON public.crm_contacts (company_id);
CREATE INDEX IF NOT EXISTS idx_tg_groups_company_id ON public.tg_groups (company_id);

-- RLS for crm_companies
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view companies"
  ON public.crm_companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert companies"
  ON public.crm_companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update companies"
  ON public.crm_companies FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete companies"
  ON public.crm_companies FOR DELETE
  TO authenticated
  USING (true);

-- Backfill: create company records from existing contact company text values
INSERT INTO public.crm_companies (name, created_by)
SELECT DISTINCT c.company, MIN(c.created_by)
FROM public.crm_contacts c
WHERE c.company IS NOT NULL AND c.company != ''
GROUP BY c.company
ON CONFLICT DO NOTHING;

-- Link existing contacts to their backfilled company records
UPDATE public.crm_contacts ct
SET company_id = co.id
FROM public.crm_companies co
WHERE ct.company = co.name
  AND ct.company IS NOT NULL
  AND ct.company != ''
  AND ct.company_id IS NULL;
