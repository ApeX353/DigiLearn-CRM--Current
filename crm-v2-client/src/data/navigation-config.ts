import {
  LayoutDashboard,
  Target,
  Kanban,
  GraduationCap,
  FileText,
  Receipt,
  CreditCard,
  Activity,
  BarChart3,
  Users,
  Package,
  Calculator,
  Settings,
  type LucideIcon,
  AlertCircle,
  Ban,
  Mail,
  FileEdit,
  CalendarClock,
  ShieldAlert,
  Copy,
  ClipboardCheck,
  Wallet,
  Megaphone,
  Sparkles,
} from "lucide-react";
import type { Role } from "~/api/rbac";

export interface NavigationItem {
  title: string;
  url?: string;
  icon?: LucideIcon;
  children?: NavigationItem[];
  canView?: boolean;
  allowedRoles?: Role["name"][];
  /** When true, the item is shown to every user regardless of role. */
  alwaysVisible?: boolean;
}

export const NavigationConfig: NavigationItem[] = [
  // Main Section
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    title: "Leads",
    url: "/leads",
    icon: Target,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: Kanban,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    title: "Schools",
    url: "/schools",
    icon: GraduationCap,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    title: "What's New",
    url: "/whats-new",
    icon: Sparkles,
    canView: false,
    // Shown to EVERY user regardless of role — release highlights for the
    // whole team. alwaysVisible bypasses role filtering entirely, so it
    // reaches roles that aren't otherwise enumerated (e.g. admin_support).
    alwaysVisible: true,
    allowedRoles: [
      "admin",
      "admin_support",
      "manager",
      "sales_manager",
      "sales_rep",
      "finance",
    ],
  },

  // Sales Section
  {
    title: "Sales",
    icon: Receipt,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
    children: [
      {
        title: "Quotes",
        url: "/quotes",
        icon: FileText,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
      },
      {
        title: "Invoices",
        url: "/invoices",
        icon: Receipt,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
      },
      {
        title: "Payments",
        url: "/payments",
        icon: CreditCard,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
      },
      {
        title: "Collections",
        url: "/collections",
        icon: AlertCircle,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager"],
      },
      {
        title: "Requisitions",
        url: "/requisitions",
        icon: Wallet,
        canView: false,
        // Reps raise them; managers/finance approve them. Everyone
        // with a stake gets the page — the page itself scopes tabs.
        allowedRoles: [
          "admin",
          "manager",
          "sales_manager",
          "sales_rep",
          "finance",
        ],
      },
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: Megaphone,
        canView: false,
        allowedRoles: [
          "admin",
          "manager",
          "sales_manager",
          "sales_rep",
          "finance",
        ],
      },
    ],
  },

  // Activity Section — Tasks removed as a separate nav item because
  // Task is a sub-entity of Activity (1:1 via activity_id). Tasks now
  // live inside Activities as a filterable type; the /tasks route
  // redirects to /activities?type=task so old bookmarks keep working.
  {
    title: "Activity",
    icon: Activity,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
    children: [
      {
        title: "Activities",
        url: "/activities",
        icon: Activity,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
      },
      {
        title: "Reports",
        url: "/reports",
        icon: BarChart3,
        canView: false,
        allowedRoles: ["admin", "sales_manager", "manager"],
      },
      {
        title: "Scheduling Links",
        url: "/scheduling-links",
        icon: CalendarClock,
        canView: false,
        allowedRoles: ["admin", "sales_manager", "sales_rep"],
      },
    ],
  },

  // Management control (Phases 5 + 8) — stuck-lead escalations and
  // duplicate-suspicion queue. Manager-only.
  {
    title: "Management",
    icon: ShieldAlert,
    canView: false,
    allowedRoles: ["admin", "sales_manager"],
    children: [
      {
        title: "Escalations",
        url: "/management/escalations",
        icon: ShieldAlert,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
      {
        title: "Duplicates",
        url: "/management/duplicates",
        icon: Copy,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
    ],
  },

  // Admin Section
  {
    title: "Admin",
    icon: Settings,
    canView: false,
    allowedRoles: ["admin", "sales_manager"],
    children: [
      {
        title: "Users",
        url: "/admin/users",
        icon: Users,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
      {
        title: "Approval Queue",
        url: "/admin/approval-queue",
        icon: ClipboardCheck,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
      {
        title: "Compliance Report",
        url: "/admin/compliance-report",
        icon: ShieldAlert,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
      {
        title: "Roles & Permissions",
        url: "/admin/roles-permissions",
        icon: Ban,
        canView: false,
        allowedRoles: ["admin"],
      },
      {
        title: "Products",
        url: "/admin/products",
        icon: Package,
        canView: false,
        allowedRoles: ["admin"],
      },
      {
        title: "Finance Plans",
        url: "/admin/finance-plans",
        icon: Calculator,
        canView: false,
        allowedRoles: ["admin"],
      },
      {
        title: "Email Sequences",
        url: "/admin/email-sequences",
        icon: Mail,
        canView: false,
        allowedRoles: ["admin", "sales_manager"],
      },
      {
        title: "Email Templates",
        url: "/admin/email-templates",
        icon: FileEdit,
        canView: false,
        allowedRoles: ["admin", "sales_manager", "sales_rep"],
      },
    ],
  },
];
