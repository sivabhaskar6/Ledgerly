"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV } from "./nav";

export function Sidebar({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white dark:border-white/10 dark:bg-[#0a0a0a] md:flex md:flex-col md:fixed md:top-0 md:left-0 md:bottom-0 md:z-30 overflow-y-auto">
      <div className="px-5 py-5 text-xl font-bold tracking-tight text-brand-700 dark:text-white">Ledgerly</div>
      <nav aria-label="Main" className="space-y-0.5 px-3 pb-6">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-white dark:border dark:border-white/10 dark:font-semibold"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-white")}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden />{label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
