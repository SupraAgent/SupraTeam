-- Remove Applications board type from the pipeline
-- Migrate existing Applications deals to BD, delete Applications-specific data

-- 1. Migrate any existing deals with board_type = 'Applications' to 'BD'
--    Move them to the first shared stage (Potential Client)
UPDATE crm_deals
SET board_type = 'BD',
    stage_id = (SELECT id FROM pipeline_stages WHERE board_type IS NULL ORDER BY position LIMIT 1)
WHERE board_type = 'Applications';

-- 2. Delete pipeline_stages where board_type = 'Applications'
DELETE FROM pipeline_stages WHERE board_type = 'Applications';

-- 3. Delete deal custom fields scoped to Applications board
DELETE FROM crm_deal_fields WHERE board_type = 'Applications';

-- 4. Delete folder stage mappings for Applications board
DELETE FROM tg_folder_stage_mappings WHERE board_type = 'Applications';

-- 5. Delete QR codes for Applications board
DELETE FROM crm_qr_codes WHERE board_type = 'Applications';

-- 6. Remove the RLS policy that was specific to Applications stages
DROP POLICY IF EXISTS "Anyone can read application stages" ON pipeline_stages;

-- 7. Update CHECK constraints to remove 'Applications'
ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_board_type_check;
ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_board_type_check CHECK (board_type IN ('BD', 'Marketing', 'Admin'));

ALTER TABLE crm_deal_fields DROP CONSTRAINT IF EXISTS crm_deal_fields_board_type_check;
ALTER TABLE crm_deal_fields ADD CONSTRAINT crm_deal_fields_board_type_check CHECK (board_type IN ('BD', 'Marketing', 'Admin'));

ALTER TABLE tg_folder_stage_mappings DROP CONSTRAINT IF EXISTS tg_folder_stage_mappings_board_type_check;
ALTER TABLE tg_folder_stage_mappings ADD CONSTRAINT tg_folder_stage_mappings_board_type_check CHECK (board_type IN ('BD', 'Marketing', 'Admin'));

ALTER TABLE crm_qr_codes DROP CONSTRAINT IF EXISTS crm_qr_codes_board_type_check;
ALTER TABLE crm_qr_codes ADD CONSTRAINT crm_qr_codes_board_type_check CHECK (board_type IN ('BD', 'Marketing', 'Admin'));
