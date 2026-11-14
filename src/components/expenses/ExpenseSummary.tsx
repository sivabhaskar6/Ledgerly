import { formatINR } from "@/lib/utils/money";
import { Skeleton } from "@/components/ui/Skeleton";

export type Summary = { total: number; count: number; today: number; month: number };

export function ExpenseSummary({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  const items = [
    { label: "Total for selected range", value: summary && formatINR(summary.total), sub: "Filter range sum" },
    { label: "Spent today", value: summary && formatINR(summary.today), sub: "Today's expenses" },
    { label: "Spent this month", value: summary && formatINR(summary.month), sub: "Month-to-date total" },
    { label: "Transactions", value: summary && String(summary.count), sub: "Recorded entries" },
  ];
  return (
    <dl className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4 shrink-0">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <dt className="text-[11px] font-medium text-slate-500">{i.label}</dt>
          <dd className="num mt-0.5 text-lg font-bold md:text-xl text-slate-900">
            {loading && !summary ? <Skeleton className="h-6 w-20" /> : (i.value ?? "—")}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">{i.sub}</p>
        </div>
      ))}
    </dl>
  );
}
