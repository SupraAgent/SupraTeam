export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
};

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  company: string | null;
  title: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Deal = {
  id: string;
  deal_name: string;
  contact_id: string | null;
  assigned_to: string | null;
  board_type: "BD" | "Marketing" | "Admin";
  stage_id: string | null;
  value: number | null;
  probability: number | null;
  telegram_chat_id: number | null;
  telegram_chat_name: string | null;
  telegram_chat_link: string | null;
  stage_changed_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact | null;
  stage?: PipelineStage | null;
  assigned_profile?: { display_name: string; avatar_url: string } | null;
};

export type BoardType = "All" | "BD" | "Marketing" | "Admin";
