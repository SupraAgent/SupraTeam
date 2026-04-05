-- Workflow Dead Letter Queue (DLQ)
-- Captures failed workflow node executions for retry or manual triage.
-- Auto-retry on transient errors (rate_limit, timeout, server) with exponential backoff.

CREATE TABLE IF NOT EXISTS public.crm_workflow_dlq (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES public.crm_workflows(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.crm_workflow_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text,
  error_class text NOT NULL CHECK (error_class IN ('rate_limit', 'timeout', 'server', 'auth', 'config', 'validation', 'unknown')),
  error_message text,
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 3,
  next_retry_at timestamptz,
  payload_snapshot jsonb NOT NULL DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'exhausted', 'discarded', 'resolved')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_workflow ON public.crm_workflow_dlq(workflow_id);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON public.crm_workflow_dlq(status);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON public.crm_workflow_dlq(next_retry_at) WHERE status IN ('pending', 'retrying');
