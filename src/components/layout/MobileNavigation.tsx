"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Menu } from "lucide-react";
import { NAV } from "./nav";
import { Dialog } from "@/components/ui/Dialog";

export function MobileNavigation() {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const primary = NAV.filter((n) => n.primaryOnMobile);
  const rest = NAV.filter((n) => !n.primaryOnMobile);
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-700" : "text-slate-500")}>
              <Icon className="h-5 w-5" aria-hidden />{label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500">
          <Menu className="h-5 w-5" aria-hidden />More
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="-mx-2">
          {rest.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-lg px-2 py-3 text-sm text-slate-700 hover:bg-slate-100">
                <Icon className="h-4 w-4" aria-hidden />{label}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
