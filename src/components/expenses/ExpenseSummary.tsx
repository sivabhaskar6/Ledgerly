import { formatINR } from "@/lib/utils/money";
import { Skeleton } from "@/components/ui/Skeleton";

export type Summary = { total: number; count: number; today: number; month: number };

export function ExpenseSummary({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  const items = [
    { label: "Total for selected range", value: summary && formatINR(summary.total) },
    { label: "Spent today", value: summary && formatINR(summary.today) },
    { label: "Spent this month", value: summary && formatINR(summary.month) },
    { label: "Transactions", value: summary && String(summary.count) },
  ];
  return (
    <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-card border border-slate-200 bg-white p-3 md:p-4">
          <dt className="text-xs text-slate-500">{i.label}</dt>
          <dd className="num mt-1 text-lg font-semibold md:text-xl">{loading && !summary ? <Skeleton className="h-6 w-24" /> : (i.value ?? "—")}</dd>
        </div>
      ))}
    </dl>
  );
}
