-- Remove Chatbot Flow Builder feature (premature for BD use)
-- Keeps core AI agent tables: crm_ai_agent_config, crm_ai_conversations

-- Drop the FK column from QR codes first (added in 20260404_p1_enhancements)
ALTER TABLE crm_qr_codes DROP COLUMN IF EXISTS chatbot_flow_id;

-- Drop chatbot flow tables in dependency order
DROP TABLE IF EXISTS crm_chatbot_flow_stats CASCADE;
DROP TABLE IF EXISTS crm_chatbot_flow_runs CASCADE;
DROP TABLE IF EXISTS crm_chatbot_flows CASCADE;

-- Drop the legacy table referenced in the task spec
DROP TABLE IF EXISTS crm_chatbot_decision_trees CASCADE;

-- Drop the trigger function
DROP FUNCTION IF EXISTS update_chatbot_flow_updated_at();
