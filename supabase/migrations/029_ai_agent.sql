-- AI agent configuration for automated Telegram responses
create table if not exists public.crm_ai_agent_config (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'Default Agent',
  is_active boolean not null default false,
  role_prompt text not null default 'You are a helpful assistant for Supra, an L1 blockchain company. Answer questions about partnerships, technology, and next steps. Be professional and concise.',
  knowledge_base text, -- custom knowledge/FAQ content
  qualification_fields jsonb default '["company", "role", "interest", "budget_range"]'::jsonb,
  auto_qualify boolean not null default false, -- auto-extract lead qualification data
  respond_to_dms boolean not null default false,
  respond_to_groups boolean not null default false,
  respond_to_mentions boolean not null default true, -- only respond when bot is mentioned
  max_tokens int not null default 500,
  escalation_keywords text[] default '{"urgent", "speak to human", "manager", "pricing"}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI conversation log
create table if not exists public.crm_ai_conversations (
  id uuid default gen_random_uuid() primary key,
  tg_chat_id bigint not null,
  tg_user_id bigint not null,
  user_message text not null,
  ai_response text not null,
  qualification_data jsonb, -- extracted lead data
  escalated boolean not null default false,
  escalation_reason text,
  agent_config_id uuid references public.crm_ai_agent_config on delete set null,
  deal_id uuid references public.crm_deals on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_ai_conversations_chat on public.crm_ai_conversations (tg_chat_id, created_at desc);
create index if not exists idx_ai_conversations_escalated on public.crm_ai_conversations (escalated) where escalated = true;
