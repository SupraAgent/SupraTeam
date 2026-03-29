import {
  Home,
  KanbanSquare,
  CheckSquare,
  Inbox,
  Mail,
  Users,
  MessageCircle,
  Bell,
  Send,
  Droplet,
  Workflow,
  Clock,
  Calendar,
  BarChart3,
  Shield,
  Network,
  FileText,
  Lightbulb,
  Settings,
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
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/email", label: "Email", icon: Mail },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "contacts",
    label: "Contacts & Groups",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/groups", label: "TG Groups", icon: MessageCircle },
    ],
  },
  {
    key: "messaging",
    label: "Messaging",
    items: [
      { href: "/broadcasts", label: "Broadcasts", icon: Bell, requiredRole: ["admin_lead"] },
      { href: "/outreach", label: "Outreach", icon: Send, requiredRole: ["admin_lead"] },
      { href: "/drip", label: "Drip Sequences", icon: Droplet, requiredRole: ["admin_lead"] },
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
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/access", label: "Access Control", icon: Shield },
      { href: "/graph", label: "Graph", icon: Network },
      { href: "/docs", label: "Docs", icon: FileText },
      { href: "/suggestions", label: "Suggestions", icon: Lightbulb },
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
