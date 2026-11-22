"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Menu } from "lucide-react";
import { NAV } from "./nav";
import { Dialog } from "@/components/ui/Dialog";

export function MobileNavigation({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const primary = items.filter((n) => n.primaryOnMobile);
  const rest = items.filter((n) => !n.primaryOnMobile);
  const isMoreActive = rest.some(
    ({ href }) => path === href || path.startsWith(href + "/")
  );

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-white/10 dark:bg-[#0a0a0a]/95"
      >
        {primary.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active
                  ? "text-brand-700 dark:text-white dark:font-semibold"
                  : "text-slate-500 dark:text-zinc-400"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMore(true)}
          className={clsx(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
            isMoreActive
              ? "text-brand-700 dark:text-white dark:font-semibold"
              : "text-slate-500 dark:text-zinc-400"
          )}
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span>More</span>
        </button>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title="More Features">
        <div className="grid grid-cols-2 gap-2 pt-1 pb-1">
          {rest.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMore(false)}
                className={clsx(
                  "flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-medium transition-colors",
                  active
                    ? "border-brand-500/40 bg-brand-50 text-brand-700 dark:border-white/20 dark:bg-white/10 dark:text-white"
                    : "border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
                )}
              >
                <div
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-brand-600 text-white dark:bg-white dark:text-black"
                      : "bg-white text-slate-600 shadow-xs dark:bg-[#262626] dark:text-zinc-300"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
