import {
  LayoutDashboard,
  Target,
  Kanban,
  GraduationCap,
  FileText,
  Receipt,
  CreditCard,
  CheckSquare,
  Activity,
  BarChart3,
  Users,
  Package,
  Calculator,
  Settings,
  type LucideIcon,
  AlertCircle,
  Ban,
} from "lucide-react";
import type { Role } from "~/api/rbac";

export interface NavigationItem {
  title: string;
  url?: string;
  icon?: LucideIcon;
  children?: NavigationItem[];
  canView?: boolean;
  allowedRoles?: Role["name"][];
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
    ],
  },

  // Activity Section
  {
    title: "Activity",
    icon: Activity,
    canView: false,
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
    children: [
      {
        title: "Tasks",
        url: "/tasks",
        icon: CheckSquare,
        canView: false,
        allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
      },
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
    ],
  },
];
