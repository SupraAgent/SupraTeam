/**
 * CRM palette items for the unified automation builder.
 * Full set of 17 triggers, 17 actions, and 1 condition node.
 */
import type { CustomPaletteItem, CustomNodeTypeInfo } from "@supra/loop-builder";

export const CRM_PALETTE_ITEMS: CustomPaletteItem[] = [
  // ── Triggers (17) ──
  { type: "crmTriggerNode", label: "Deal Stage Change", emoji: "📊", description: "Trigger on pipeline stage change", help: "Fires when a deal moves to a different pipeline stage", group: "CRM Triggers", data: { label: "Stage Change", crmTrigger: "deal_stage_change", config: {} } },
  { type: "crmTriggerNode", label: "Deal Created", emoji: "✨", description: "Trigger when a new deal is created", help: "Fires when a new deal is added to any board", group: "CRM Triggers", data: { label: "Deal Created", crmTrigger: "deal_created", config: {} } },
  { type: "crmTriggerNode", label: "Deal Won", emoji: "🏆", description: "Trigger when a deal is won", help: "Fires when a deal reaches the final stage", group: "CRM Triggers", data: { label: "Deal Won", crmTrigger: "deal_won", config: {} } },
  { type: "crmTriggerNode", label: "Deal Lost", emoji: "❌", description: "Trigger when a deal is lost", help: "Fires when a deal is marked as lost", group: "CRM Triggers", data: { label: "Deal Lost", crmTrigger: "deal_lost", config: {} } },
  { type: "crmTriggerNode", label: "Deal Stale", emoji: "⏳", description: "Trigger when a deal goes stale", help: "Fires when a deal has had no activity for a set period", group: "CRM Triggers", data: { label: "Deal Stale", crmTrigger: "deal_stale", config: {} } },
  { type: "crmTriggerNode", label: "Deal Value Change", emoji: "💰", description: "Trigger on deal value change", help: "Fires when a deal's value is updated", group: "CRM Triggers", data: { label: "Value Change", crmTrigger: "deal_value_change", config: {} } },
  { type: "crmTriggerNode", label: "Contact Created", emoji: "👤", description: "Trigger when a contact is created", help: "Fires when a new contact is added", group: "CRM Triggers", data: { label: "Contact Created", crmTrigger: "contact_created", config: {} } },
  { type: "crmTriggerNode", label: "Task Overdue", emoji: "⚠️", description: "Trigger when a task is overdue", help: "Fires when a task passes its due date", group: "CRM Triggers", data: { label: "Task Overdue", crmTrigger: "task_overdue", config: {} } },
  { type: "crmTriggerNode", label: "TG Message", emoji: "💬", description: "Trigger on Telegram message", help: "Fires when a message is received in a linked Telegram group", group: "CRM Triggers", data: { label: "TG Message", crmTrigger: "tg_message", config: {} } },
  { type: "crmTriggerNode", label: "TG Member Joined", emoji: "📥", description: "Trigger when a member joins a TG group", help: "Fires when someone joins a linked Telegram group", group: "CRM Triggers", data: { label: "TG Member Joined", crmTrigger: "tg_member_joined", config: {} } },
  { type: "crmTriggerNode", label: "TG Member Left", emoji: "📤", description: "Trigger when a member leaves a TG group", help: "Fires when someone leaves a linked Telegram group", group: "CRM Triggers", data: { label: "TG Member Left", crmTrigger: "tg_member_left", config: {} } },
  { type: "crmTriggerNode", label: "Email Received", emoji: "📧", description: "Trigger on email received", help: "Fires when an email is received from a contact", group: "CRM Triggers", data: { label: "Email Received", crmTrigger: "email_received", config: {} } },
  { type: "crmTriggerNode", label: "Calendar Event", emoji: "📅", description: "Trigger on calendar event", help: "Fires when a calendar event starts or is created", group: "CRM Triggers", data: { label: "Calendar Event", crmTrigger: "calendar_event", config: {} } },
  { type: "crmTriggerNode", label: "Webhook", emoji: "🔗", description: "Trigger from external webhook", help: "Fires when an external service sends a webhook", group: "CRM Triggers", data: { label: "Webhook", crmTrigger: "webhook", config: {} } },
  { type: "crmTriggerNode", label: "Manual", emoji: "👆", description: "Manual trigger", help: "Run this workflow manually from the UI", group: "CRM Triggers", data: { label: "Manual", crmTrigger: "manual", config: {} } },
  { type: "crmTriggerNode", label: "Lead Qualified", emoji: "🎯", description: "Trigger when a lead is qualified", help: "Fires when a lead's quality score crosses the threshold", group: "CRM Triggers", data: { label: "Lead Qualified", crmTrigger: "lead_qualified", config: {} } },
  { type: "crmTriggerNode", label: "Scheduled", emoji: "🕐", description: "Run on a schedule", help: "Fires on a cron schedule (daily, hourly, etc.)", group: "CRM Triggers", data: { label: "Scheduled", crmTrigger: "scheduled", config: {} } },
  { type: "crmTriggerNode", label: "Bot DM Received", emoji: "🤖", description: "Trigger on bot DM", help: "Fires when the bot receives a direct message", group: "CRM Triggers", data: { label: "Bot DM", crmTrigger: "bot_dm_received", config: {} } },

  // ── Actions (17) ──
  { type: "crmActionNode", label: "Send Telegram", emoji: "✈️", description: "Send a Telegram message", help: "Send a message to a Telegram chat or group", group: "CRM Actions", data: { label: "Send Telegram", crmAction: "send_telegram", config: {} } },
  { type: "crmActionNode", label: "Send Email", emoji: "📧", description: "Send an email", help: "Send an email to a contact or custom address", group: "CRM Actions", data: { label: "Send Email", crmAction: "send_email", config: {} } },
  { type: "crmActionNode", label: "Send Slack", emoji: "💬", description: "Send a Slack message", help: "Send a message to a Slack channel", group: "CRM Actions", data: { label: "Send Slack", crmAction: "send_slack", config: {} } },
  { type: "crmActionNode", label: "Broadcast", emoji: "📢", description: "Broadcast to TG groups", help: "Send a message to all Telegram groups matching a slug", group: "CRM Actions", data: { label: "Broadcast", crmAction: "send_broadcast", config: {} } },
  { type: "crmActionNode", label: "Update Deal", emoji: "📝", description: "Update deal fields", help: "Modify a deal's field value", group: "CRM Actions", data: { label: "Update Deal", crmAction: "update_deal", config: {} } },
  { type: "crmActionNode", label: "Update Contact", emoji: "👤", description: "Update contact fields", help: "Modify a contact's field value", group: "CRM Actions", data: { label: "Update Contact", crmAction: "update_contact", config: {} } },
  { type: "crmActionNode", label: "Assign Deal", emoji: "🔄", description: "Assign deal to team member", help: "Reassign a deal to a different team member", group: "CRM Actions", data: { label: "Assign Deal", crmAction: "assign_deal", config: {} } },
  { type: "crmActionNode", label: "Create Deal", emoji: "✨", description: "Create a new deal", help: "Create a new deal in the pipeline", group: "CRM Actions", data: { label: "Create Deal", crmAction: "create_deal", config: {} } },
  { type: "crmActionNode", label: "Create Task", emoji: "✅", description: "Create a task", help: "Create a new task linked to the current deal", group: "CRM Actions", data: { label: "Create Task", crmAction: "create_task", config: {} } },
  { type: "crmActionNode", label: "Add Tag", emoji: "🏷️", description: "Add a tag to a deal", help: "Add a tag to the deal's tag list", group: "CRM Actions", data: { label: "Add Tag", crmAction: "add_tag", config: {} } },
  { type: "crmActionNode", label: "Remove Tag", emoji: "🗑️", description: "Remove a tag from a deal", help: "Remove a tag from the deal's tag list", group: "CRM Actions", data: { label: "Remove Tag", crmAction: "remove_tag", config: {} } },
  { type: "crmActionNode", label: "TG Access", emoji: "🔐", description: "Manage TG group access", help: "Add or remove user access to Telegram groups by slug", group: "CRM Actions", data: { label: "TG Access", crmAction: "tg_manage_access", config: {} } },
  { type: "crmActionNode", label: "AI Summarize", emoji: "🧠", description: "AI-powered summary", help: "Generate an AI summary of the deal context", group: "CRM Actions", data: { label: "AI Summarize", crmAction: "ai_summarize", config: {} } },
  { type: "crmActionNode", label: "AI Classify", emoji: "🎯", description: "AI-powered classification", help: "Classify a deal into categories using AI", group: "CRM Actions", data: { label: "AI Classify", crmAction: "ai_classify", config: {} } },
  { type: "crmActionNode", label: "Add to Sequence", emoji: "📋", description: "Add contact to outreach sequence", help: "Enroll a contact in a drip sequence", group: "CRM Actions", data: { label: "Add to Sequence", crmAction: "add_to_sequence", config: {} } },
  { type: "crmActionNode", label: "Remove from Sequence", emoji: "📋", description: "Remove from outreach sequence", help: "Remove a contact from a drip sequence", group: "CRM Actions", data: { label: "Remove from Sequence", crmAction: "remove_from_sequence", config: {} } },
  { type: "crmActionNode", label: "HTTP Request", emoji: "🌐", description: "Make an HTTP request", help: "Call an external API endpoint", group: "CRM Actions", data: { label: "HTTP Request", crmAction: "http_request", config: {} } },

  // ── Conditions (1) ──
  { type: "crmConditionNode", label: "CRM Condition", emoji: "🔀", description: "Branch on CRM data", help: "Route the workflow based on CRM field values (deal stage, tags, value, etc.)", group: "CRM Logic", data: { label: "CRM Condition", field: "stage", operator: "equals", value: "" } },
];

export const CRM_NODE_TYPE_INFO: Record<string, CustomNodeTypeInfo> = {
  crmTriggerNode: { emoji: "▶", label: "CRM Trigger", color: "text-violet-400" },
  crmActionNode: { emoji: "⚡", label: "CRM Action", color: "text-blue-400" },
  crmConditionNode: { emoji: "🔀", label: "CRM Condition", color: "text-yellow-400" },
};
