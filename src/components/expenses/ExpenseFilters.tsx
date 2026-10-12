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
const ctl = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm";

export function ExpenseFilters({ filters, categories, accounts, onChange }: {
  filters: Filters; categories: Category[]; accounts: Account[]; onChange: (patch: Partial<Filters>) => void;
}) {
  const dirty = JSON.stringify({ ...filters, page: 0 }) !== JSON.stringify(DEFAULT_FILTERS);
  return (
    <section aria-label="Filters" className="mb-4 space-y-3 rounded-card border border-slate-200 bg-white p-3 md:p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden />
        <input aria-label="Search title or note" placeholder="Search title or note" value={filters.q}
          onChange={(e) => onChange({ q: e.target.value, page: 0 })} className={`${ctl} w-full pl-9`} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select aria-label="Category" className={ctl} value={filters.category} onChange={(e) => onChange({ category: e.target.value, page: 0 })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Payment account" className={ctl} value={filters.account} onChange={(e) => onChange({ account: e.target.value, page: 0 })}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input aria-label="From date" type="date" className={ctl} value={filters.from} max={filters.to || undefined} onChange={(e) => onChange({ from: e.target.value, page: 0 })} />
        <input aria-label="To date" type="date" className={ctl} value={filters.to} min={filters.from || undefined} onChange={(e) => onChange({ to: e.target.value, page: 0 })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange({ ...presetRange(p.key), page: 0 })}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">{p.label}</button>
        ))}
        {dirty && <Button variant="ghost" className="ml-auto h-8 px-2 text-xs" onClick={() => onChange({ ...DEFAULT_FILTERS })}><X className="h-3 w-3" aria-hidden />Clear filters</Button>}
      </div>
    </section>
  );
}
