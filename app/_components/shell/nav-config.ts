import {
  Home,
  KanbanSquare,
  Inbox,
  Users,
  MessageSquare,
  Bell,
  Mail,
  Send,
  Workflow,
  RefreshCcw,
  Droplet,
  CheckSquare,
  MessageCircle,
  Shield,
  BarChart3,
  Network,
  Calendar,
  FileText,
  Lightbulb,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const TOP_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "messaging",
    label: "Messaging",
    items: [
      { href: "/conversations", label: "Conversations", icon: MessageSquare },
      { href: "/broadcasts", label: "Broadcasts", icon: Bell },
      { href: "/email", label: "Email", icon: Mail },
      { href: "/outreach", label: "Outreach", icon: Send },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/loop", label: "Loop Builder", icon: RefreshCcw },
      { href: "/drip", label: "Drip Sequences", icon: Droplet },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    items: [
      { href: "/groups", label: "TG Groups", icon: MessageCircle },
      { href: "/access", label: "Access Control", icon: Shield },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/graph", label: "Graph", icon: Network },
      { href: "/calendar", label: "Calendar", icon: Calendar },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/suggestions", label: "Suggestions", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: Shield };
