"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Sun, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme/ThemeProvider";

export function Topbar({ name }: { name: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      notify("error", "Could not log out. Check your connection and try again.");
      setBusy(false);
    }
  }

  const handleToggle = () => {
    toggleTheme();
    notify(
      "success",
      theme === "dark" ? "Switched to Light Mode." : "Switched to Dark Mode."
    );
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 dark:border-white/10 dark:bg-[#0a0a0a]/90 backdrop-blur-md">
      <span className="text-lg font-bold text-brand-700 dark:text-white md:hidden">Ledgerly</span>
      <span className="hidden text-sm text-slate-500 dark:text-zinc-400 md:block">{name}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors dark:border-white/10 dark:bg-[#141414] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600" />
          )}
        </button>
        <button
          onClick={logout}
          disabled={busy}
          aria-label="Log out"
          title="Log out"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 transition-colors dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}
