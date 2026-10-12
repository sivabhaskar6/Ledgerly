import { LayoutDashboard, Receipt, Tags, TrendingUp, Trash2, Landmark, LineChart, FileBarChart, Settings, PiggyBank, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; primaryOnMobile?: boolean };
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primaryOnMobile: true },
  { href: "/expenses", label: "Expenses", icon: Receipt, primaryOnMobile: true },
  { href: "/income", label: "Income", icon: PiggyBank, primaryOnMobile: true },
  { href: "/spending-categories", label: "Categories", icon: Tags, primaryOnMobile: true },
  { href: "/monthly-trends", label: "Monthly trends", icon: TrendingUp },
  { href: "/recently-deleted", label: "Recently deleted", icon: Trash2 },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/investments", label: "Investments", icon: LineChart },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: Settings },
];
