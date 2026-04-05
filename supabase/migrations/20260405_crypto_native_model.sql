-- Crypto-native extensions for companies and contacts
-- Supports protocol partnerships, multi-wallet contacts, and AI qualification data flow

-- Companies: add protocol metadata fields
ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS tvl numeric(20,2),
  ADD COLUMN IF NOT EXISTS chain_deployments text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_status text CHECK (token_status IN ('pre_tge', 'post_tge', 'no_token')),
  ADD COLUMN IF NOT EXISTS funding_stage text CHECK (funding_stage IN ('pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'public', 'bootstrapped')),
  ADD COLUMN IF NOT EXISTS protocol_type text CHECK (protocol_type IN ('defi', 'infrastructure', 'gaming', 'nft', 'dao', 'social', 'bridge', 'oracle', 'wallet', 'other'));

-- Contacts: multi-wallet support + partnership context
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS wallets jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS decision_maker_level text CHECK (decision_maker_level IN ('founder', 'c_level', 'vp', 'director', 'manager', 'ic')),
  ADD COLUMN IF NOT EXISTS partnership_type text CHECK (partnership_type IN ('integration', 'listing', 'co_marketing', 'investment', 'advisory', 'node_operator'));

-- Index for chain deployment filtering
CREATE INDEX IF NOT EXISTS idx_companies_chain_deployments ON crm_companies USING gin (chain_deployments);
CREATE INDEX IF NOT EXISTS idx_companies_protocol_type ON crm_companies (protocol_type) WHERE protocol_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_token_status ON crm_companies (token_status) WHERE token_status IS NOT NULL;
