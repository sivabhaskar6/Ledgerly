"use client";
import { Search, X } from "lucide-react";
import type { Account, Category } from "@/types/db";
import { DEFAULT_FILTERS, type ExpenseFilters as Filters } from "@/lib/data/expenses";
import { presetRange, type Preset } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "week", label: "This week" },
  { key: "month", label: "This month" }, { key: "year", label: "This year" },
];
const ctl = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 shadow-xs focus:border-brand-500 focus:outline-none transition-colors";

export function ExpenseFilters({ filters, categories, accounts, onChange }: {
  filters: Filters; categories: Category[]; accounts: Account[]; onChange: (patch: Partial<Filters>) => void;
}) {
  const dirty = JSON.stringify({ ...filters, page: 0 }) !== JSON.stringify(DEFAULT_FILTERS);

  // Detect which preset matches current date range (e.g. "This month", "Today", etc.)
  const activePreset = PRESETS.find((p) => {
    const range = presetRange(p.key);
    return filters.from === range.from && filters.to === range.to;
  })?.key;

  return (
    <section aria-label="Filters" className="mb-2 space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs shrink-0 dark:border-white/10 dark:bg-[#141414]">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
          <input
            aria-label="Search title or note"
            placeholder="Search title or note..."
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value, page: 0 })}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs text-slate-900 shadow-xs placeholder:text-slate-400 focus:bg-white focus:outline-none transition-colors dark:border-white/10 dark:bg-[#121212] dark:text-white dark:placeholder:text-zinc-500"
          />
        </div>
        <select aria-label="Category" className={ctl} value={filters.category} onChange={(e) => onChange({ category: e.target.value, page: 0 })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Payment account" className={ctl} value={filters.account} onChange={(e) => onChange({ account: e.target.value, page: 0 })}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input aria-label="From date" type="date" className={`${ctl} text-xs`} value={filters.from} max={filters.to || undefined} onChange={(e) => onChange({ from: e.target.value, page: 0 })} />
          <span className="text-xs text-slate-400">to</span>
          <input aria-label="To date" type="date" className={`${ctl} text-xs`} value={filters.to} min={filters.from || undefined} onChange={(e) => onChange({ to: e.target.value, page: 0 })} />
          <div className="filter-capsule">
            {PRESETS.map((p) => {
              const isSelected = activePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange({ ...presetRange(p.key), page: 0 })}
                  className={isSelected ? "filter-pill-active" : "filter-pill-inactive"}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        {dirty && (
          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}
