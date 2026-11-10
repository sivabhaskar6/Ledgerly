import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Coins,
  LineChart,
  Rocket,
  CandlestickChart,
  Wallet,
  Landmark,
  Tags,
  TrendingUp,
  FileBarChart,
  Trash2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; primaryOnMobile?: boolean };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primaryOnMobile: true },
  { href: "/expenses", label: "Expenses", icon: Receipt, primaryOnMobile: true },
  { href: "/income", label: "Income", icon: PiggyBank, primaryOnMobile: true },
  { href: "/capital", label: "Capital", icon: Coins, primaryOnMobile: true },
  { href: "/investments", label: "Investments", icon: LineChart },
  { href: "/ipo", label: "IPO Listing Gains", icon: Rocket },
  { href: "/fno", label: "F&O Trading", icon: CandlestickChart },
  { href: "/savings", label: "Savings", icon: Wallet },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/spending-categories", label: "Categories", icon: Tags },
  { href: "/monthly-trends", label: "Monthly trends", icon: TrendingUp },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/recently-deleted", label: "Recently deleted", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings },
];
