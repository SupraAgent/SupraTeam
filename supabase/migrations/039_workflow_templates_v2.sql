-- Migration 039: 20 new built-in workflow templates
-- Covers pipeline management, TG community, outreach, AI-powered, and operations

INSERT INTO crm_workflow_templates (name, description, category, tags, trigger_type, nodes, edges) VALUES

-- 1. Stale Deal Nudge
('Stale Deal Nudge',
 'When a deal sits in the same stage for 5+ days, sends a TG reminder to the deal owner and creates a follow-up task.',
 'built_in', ARRAY['pipeline','stale','reminder'], 'deal_stale',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_stale","label":"Deal Stale","config":{"stale_days":5}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"send_telegram","label":"Nudge Owner","config":{"message":"⚠️ Deal \"{{deal_name}}\" has been in {{stage}} for 5+ days. Time to follow up!"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"create_task","label":"Follow-up Task","config":{"title":"Follow up: {{deal_name}}","due_hours":24}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 2. Deal Won Celebration
('Deal Won Celebration',
 'When a deal is won, broadcasts a congrats message to Slack and the team TG group.',
 'built_in', ARRAY['pipeline','won','celebration'], 'deal_won',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_won","label":"Deal Won","config":{}}},{"id":"a1","type":"action","position":{"x":150,"y":280},"data":{"nodeType":"action","actionType":"send_slack","label":"Slack Alert","config":{"message":"🎉 Deal Won: *{{deal_name}}* ({{value}}) — {{contact_name}}"}}},{"id":"a2","type":"action","position":{"x":450,"y":280},"data":{"nodeType":"action","actionType":"send_telegram","label":"TG Celebration","config":{"message":"🏆 We closed {{deal_name}}! Value: {{value}}. Great work team!"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e02","source":"t0","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 3. Deal Lost Post-Mortem
('Deal Lost Post-Mortem',
 'When a deal is lost, creates a task to log the loss reason and notifies the team lead.',
 'built_in', ARRAY['pipeline','lost','review'], 'deal_lost',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_lost","label":"Deal Lost","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"create_task","label":"Log Loss Reason","config":{"title":"Post-mortem: {{deal_name}} — log loss reason","due_hours":48}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Notify Lead","config":{"message":"❌ Deal lost: {{deal_name}} ({{stage}}). Post-mortem task created."}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 4. Auto-Advance on MOU
('MOU Follow-up Chain',
 'When a deal reaches MOU Signed, creates a payment chase task and sends a TG follow-up after 3 days.',
 'built_in', ARRAY['pipeline','mou','follow-up'], 'deal_stage_change',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"MOU Signed","config":{"to_stage":"MOU Signed"}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"create_task","label":"Chase Payment","config":{"title":"Chase first payment: {{deal_name}}","due_hours":72}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"delay","label":"Wait 3 Days","config":{"duration":3,"unit":"days"}}},{"id":"a3","type":"action","position":{"x":300,"y":590},"data":{"nodeType":"action","actionType":"send_telegram","label":"TG Follow-up","config":{"message":"Hi! Just checking in on {{deal_name}} — any updates on the first payment? 🙏"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e23","source":"a2","target":"a3","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 5. High-Value Deal Alert
('High-Value Deal Alert',
 'When a deal value exceeds threshold, notify BD lead on Slack and reassign to senior rep.',
 'built_in', ARRAY['pipeline','high-value','alert'], 'deal_value_change',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_value_change","label":"Value Changed","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"send_slack","label":"Alert BD Lead","config":{"message":"💰 High-value deal: *{{deal_name}}* is now worth {{value}}!"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"add_tag","label":"Tag VIP","config":{"target":"deal","tag":"high-value"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 6. New TG Member Welcome
('New Member Welcome',
 'When a user joins a TG group, sends a welcome message.',
 'built_in', ARRAY['telegram','community','welcome'], 'tg_member_joined',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_member_joined","label":"Member Joined","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"send_telegram","label":"Welcome Message","config":{"message":"Welcome to the group! 👋 We''re glad to have you here. Feel free to introduce yourself!"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 7. Churn Alert
('Member Churn Alert',
 'When a user leaves a key TG group, adds a churn-risk tag and notifies the deal owner.',
 'built_in', ARRAY['telegram','churn','alert'], 'tg_member_left',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_member_left","label":"Member Left","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"add_tag","label":"Tag Churn Risk","config":{"target":"deal","tag":"churn-risk"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Notify Owner","config":{"message":"⚠️ A contact left the TG group linked to {{deal_name}}. Churn risk tagged."}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 8. Keyword Lead Capture
('Keyword Lead Capture',
 'When someone types "interested" or "partnership" in a TG group, auto-creates a deal and notifies BD.',
 'built_in', ARRAY['telegram','lead-capture','keyword'], 'tg_message',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_message","label":"Keyword Match","config":{"keyword":"interested, partnership, collaborate"}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"create_deal","label":"Create Deal","config":{"name":"{{sender_name}} — Inbound Lead","board_type":"BD"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_slack","label":"Notify BD","config":{"message":"🔥 New inbound lead from {{sender_name}} in {{group_name}}: \"{{message_text}}\""}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 9. TG to Slack Bridge
('TG → Slack Bridge',
 'Forwards all messages from a TG group to a Slack channel.',
 'built_in', ARRAY['telegram','slack','bridge','integration'], 'tg_message',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_message","label":"TG Message","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":280},"data":{"nodeType":"action","actionType":"send_slack","label":"Forward to Slack","config":{"message":"*[{{group_name}}]* {{sender_name}}:\n{{message_text}}\n<{{message_link}}|View in Telegram>"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 10. Slug-Based Onboarding
('Slug-Based TG Onboarding',
 'When a deal reaches Outreach stage, adds the contact to all partner TG groups.',
 'built_in', ARRAY['telegram','access','onboarding','slug'], 'deal_stage_change',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Moved to Outreach","config":{"to_stage":"Outreach"}}},{"id":"a1","type":"action","position":{"x":300,"y":280},"data":{"nodeType":"action","actionType":"tg_manage_access","label":"Add to Partner Groups","config":{"action":"add","slug":"partners"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 11. Auto-Enroll After Calendly
('Auto-Enroll After Calendly',
 'When a deal moves to Calendly Sent, enrolls the contact in a pre-call nurture sequence.',
 'built_in', ARRAY['outreach','sequence','calendly'], 'deal_stage_change',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Calendly Sent","config":{"to_stage":"Calendly Sent"}}},{"id":"a1","type":"action","position":{"x":300,"y":280},"data":{"nodeType":"action","actionType":"add_to_sequence","label":"Enroll in Sequence","config":{"sequence_id":"","start_step":1}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 12. Stop Sequence on Reply
('Stop Sequence on Reply',
 'When a TG message is received from a contact in an active sequence, removes them and notifies the rep.',
 'built_in', ARRAY['outreach','sequence','reply'], 'tg_message',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_message","label":"Reply Received","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"remove_from_sequence","label":"Unenroll","config":{"sequence_id":""}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Notify Rep","config":{"message":"📩 {{sender_name}} replied! They''ve been removed from the outreach sequence."}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 13. Video Call Follow-up Drip
('Video Call Follow-up Drip',
 'After Video Call stage, waits 2 days, sends a follow-up email, waits 3 more days, sends a TG nudge.',
 'built_in', ARRAY['outreach','drip','follow-up'], 'deal_stage_change',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":60},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Video Call","config":{"to_stage":"Video Call"}}},{"id":"a1","type":"action","position":{"x":300,"y":200},"data":{"nodeType":"action","actionType":"delay","label":"Wait 2 Days","config":{"duration":2,"unit":"days"}}},{"id":"a2","type":"action","position":{"x":300,"y":340},"data":{"nodeType":"action","actionType":"send_email","label":"Follow-up Email","config":{"subject":"Great chatting — next steps for {{deal_name}}","body":"Hi {{contact_name}},\n\nGreat call! Here are the next steps we discussed..."}}},{"id":"a3","type":"action","position":{"x":300,"y":480},"data":{"nodeType":"action","actionType":"delay","label":"Wait 3 Days","config":{"duration":3,"unit":"days"}}},{"id":"a4","type":"action","position":{"x":300,"y":620},"data":{"nodeType":"action","actionType":"send_telegram","label":"TG Nudge","config":{"message":"Hey {{contact_name}}! Just checking in on our call from last week. Any thoughts on the proposal?"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e23","source":"a2","target":"a3","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e34","source":"a3","target":"a4","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 14. Weekly Deal Summary (AI)
('Weekly Deal Summary',
 'Every Monday at 9am, AI summarizes all active deals and posts to Slack.',
 'built_in', ARRAY['ai','summary','scheduled','slack'], 'scheduled',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"scheduled","label":"Monday 9am","config":{"cron_expression":"0 9 * * 1","timezone":"Asia/Taipei"}}},{"id":"a1","type":"action","position":{"x":300,"y":280},"data":{"nodeType":"action","actionType":"ai_summarize","label":"Summarize Pipeline","config":{"target":"deal_history","output_to":"slack"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 15. Lead Qualification Scoring
('Lead Qualification Scoring',
 'When a new contact is created, AI classifies lead quality and tags hot leads.',
 'built_in', ARRAY['ai','lead-scoring','contact'], 'contact_created',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"contact_created","label":"Contact Created","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"ai_classify","label":"Score Lead","config":{"classification_type":"lead_quality","field_to_update":"lead_score"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"add_tag","label":"Tag Hot Lead","config":{"target":"contact","tag":"hot-lead"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 16. Sentiment Alert
('TG Sentiment Alert',
 'When a TG message is received, AI analyzes sentiment. If negative, alerts the account owner.',
 'built_in', ARRAY['ai','sentiment','telegram','alert'], 'tg_message',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"tg_message","label":"TG Message","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"ai_classify","label":"Analyze Sentiment","config":{"classification_type":"sentiment"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Alert Owner","config":{"message":"⚠️ Negative sentiment detected in {{group_name}} from {{sender_name}}. Review needed."}}},{"id":"a3","type":"action","position":{"x":300,"y":590},"data":{"nodeType":"action","actionType":"create_task","label":"Review Task","config":{"title":"Review negative sentiment: {{deal_name}}","due_hours":4}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e23","source":"a2","target":"a3","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 17. Daily Pipeline Digest
('Daily Pipeline Digest',
 'Every weekday morning, posts a pipeline summary to the team TG group.',
 'built_in', ARRAY['scheduled','digest','pipeline','telegram'], 'scheduled',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"scheduled","label":"Weekdays 9am","config":{"cron_expression":"0 9 * * 1-5","timezone":"Asia/Taipei"}}},{"id":"a1","type":"action","position":{"x":300,"y":280},"data":{"nodeType":"action","actionType":"ai_summarize","label":"Summarize Pipeline","config":{"target":"deal_history","output_to":"telegram"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 18. Overdue Task Escalation
('Overdue Task Escalation',
 'When a task becomes overdue, reminds the assignee. If still overdue after 24h, escalates to Slack.',
 'built_in', ARRAY['task','overdue','escalation'], 'task_overdue',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":60},"data":{"nodeType":"trigger","triggerType":"task_overdue","label":"Task Overdue","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":200},"data":{"nodeType":"action","actionType":"send_telegram","label":"Remind Assignee","config":{"message":"⏰ Your task is overdue: {{deal_name}}. Please update ASAP."}}},{"id":"a2","type":"action","position":{"x":300,"y":340},"data":{"nodeType":"action","actionType":"delay","label":"Wait 24h","config":{"duration":24,"unit":"hours"}}},{"id":"a3","type":"action","position":{"x":300,"y":480},"data":{"nodeType":"action","actionType":"send_slack","label":"Escalate to Lead","config":{"message":"🚨 Task escalation: overdue task for {{deal_name}} has not been addressed after 24h."}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e23","source":"a2","target":"a3","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 19. Webhook-to-Deal Bridge
('Webhook → Deal Pipeline',
 'Receives a webhook from an external form, creates a deal, assigns it, and sends a notification.',
 'built_in', ARRAY['webhook','deal','integration'], 'webhook',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":80},"data":{"nodeType":"trigger","triggerType":"webhook","label":"Webhook","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":250},"data":{"nodeType":"action","actionType":"create_deal","label":"Create Deal","config":{"name":"Inbound — {{company}}","board_type":"BD"}}},{"id":"a2","type":"action","position":{"x":300,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Notify Team","config":{"message":"📥 New inbound deal created from webhook: {{deal_name}}"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb),

-- 20. New Contact Auto-Enrich
('Contact Auto-Enrich',
 'When a contact is created, calls an enrichment API, updates the contact, and classifies lead quality.',
 'built_in', ARRAY['contact','enrichment','ai','api'], 'contact_created',
 '[{"id":"t0","type":"trigger","position":{"x":300,"y":60},"data":{"nodeType":"trigger","triggerType":"contact_created","label":"Contact Created","config":{}}},{"id":"a1","type":"action","position":{"x":300,"y":200},"data":{"nodeType":"action","actionType":"http_request","label":"Enrich Contact","config":{"method":"POST","url":"https://api.example.com/enrich","body":"{\"email\": \"{{contact_email}}\", \"name\": \"{{contact_name}}\"}"}}},{"id":"a2","type":"action","position":{"x":300,"y":370},"data":{"nodeType":"action","actionType":"ai_classify","label":"Score Lead","config":{"classification_type":"lead_quality"}}},{"id":"a3","type":"action","position":{"x":300,"y":540},"data":{"nodeType":"action","actionType":"add_tag","label":"Tag Qualified","config":{"target":"contact","tag":"enriched"}}}]'::jsonb,
 '[{"id":"e01","source":"t0","target":"a1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e12","source":"a1","target":"a2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}},{"id":"e23","source":"a2","target":"a3","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142,71%,45%)","strokeWidth":2}}]'::jsonb);
