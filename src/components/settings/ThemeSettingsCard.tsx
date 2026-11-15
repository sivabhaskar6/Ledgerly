"use client";
import { Sun, Moon, Check } from "lucide-react";
import clsx from "clsx";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useToast } from "@/components/ui/Toast";

export function ThemeSettingsCard() {
  const { theme, setTheme } = useTheme();
  const { notify } = useToast();

  const handleSelect = (mode: "light" | "dark") => {
    if (theme === mode) return;
    setTheme(mode);
    notify(
      "success",
      mode === "dark" ? "Switched to Dark Mode." : "Switched to Light Mode."
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs md:p-5 dark:border-white/10 dark:bg-[#141414]">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Appearance
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Light Mode Option */}
        <button
          type="button"
          onClick={() => handleSelect("light")}
          className={clsx(
            "flex items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all cursor-pointer",
            theme === "light"
              ? "border-2 border-slate-900 bg-slate-100/90 shadow-sm dark:border-white dark:bg-[#252525]"
              : "border border-slate-200 bg-white opacity-50 hover:opacity-100 hover:border-slate-300 dark:border-white/10 dark:bg-[#0e0e0e] dark:hover:border-white/20"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                theme === "light"
                  ? "border-amber-300 bg-amber-100 text-amber-600 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-300"
                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-500"
              )}
            >
              <Sun className="h-5 w-5" />
            </div>
            <span
              className={clsx(
                "text-sm font-bold",
                theme === "light"
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-zinc-400"
              )}
            >
              Light Mode
            </span>
          </div>

          {theme === "light" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-xs dark:bg-white dark:text-black">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              Active
            </span>
          )}
        </button>

        {/* Dark Mode Option */}
        <button
          type="button"
          onClick={() => handleSelect("dark")}
          className={clsx(
            "flex items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all cursor-pointer",
            theme === "dark"
              ? "border-2 border-slate-900 bg-slate-100/90 shadow-sm dark:border-2 dark:border-white dark:bg-[#252525]"
              : "border border-slate-200 bg-white opacity-50 hover:opacity-100 hover:border-slate-300 dark:border-white/10 dark:bg-[#0e0e0e] dark:hover:border-white/20"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                theme === "dark"
                  ? "border-slate-300 bg-slate-200 text-slate-900 dark:border-white/30 dark:bg-white/20 dark:text-white"
                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-500"
              )}
            >
              <Moon className="h-5 w-5" />
            </div>
            <span
              className={clsx(
                "text-sm font-bold",
                theme === "dark"
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-zinc-400"
              )}
            >
              Dark Mode
            </span>
          </div>

          {theme === "dark" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-xs dark:bg-white dark:text-black">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              Active
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
