import {
  Home,
  KanbanSquare,

  Inbox,
  Mail,
  Users,
  Building2,
  MessageCircle,
  Bell,
  Send,
  Droplet,
  Workflow,
  Clock,
  Calendar,
  BarChart3,
  Shield,
  Settings,
  Crown,
  FolderSync,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** If set, only users with one of these crm_role values see this item */
  requiredRole?: string[];
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const TOP_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/telegram", label: "Telegram", icon: MessageCircle },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "contacts",
    label: "Team & Groups",
    items: [
      { href: "/inbox", label: "Team Inbox", icon: Inbox },
      { href: "/groups", label: "TG Groups", icon: MessageCircle },
      { href: "/telegram/admin", label: "My Groups", icon: Crown },
      { href: "/telegram/folders", label: "Folder Sync", icon: FolderSync },
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/companies", label: "Companies", icon: Building2 },
    ],
  },
  {
    key: "messaging",
    label: "Messaging",
    items: [
      { href: "/broadcasts", label: "Broadcasts", icon: Bell, requiredRole: ["admin_lead"] },
      { href: "/outreach", label: "Outreach", icon: Send, requiredRole: ["admin_lead"] },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/automations/runs", label: "Runs", icon: Clock },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      { href: "/calendar", label: "Calendar & Tasks", icon: Calendar },
      { href: "/reports", label: "Reports", icon: BarChart3, requiredRole: ["admin_lead"] },
      { href: "/access", label: "Access Control", icon: Shield, requiredRole: ["admin_lead"] },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: Shield };

export const ALL_NAV_ITEMS: NavItem[] = [
  ...TOP_ITEMS,
  ...NAV_SECTIONS.flatMap((s) => s.items),
  SETTINGS_ITEM,
];

export function filterByRole(items: NavItem[], role: string | null): NavItem[] {
  return items.filter((item) => !item.requiredRole || (role && item.requiredRole.includes(role)));
}
