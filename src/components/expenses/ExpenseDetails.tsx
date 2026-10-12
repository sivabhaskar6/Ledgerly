import type { ExpenseWithRefs } from "@/types/db";
import { Dialog } from "@/components/ui/Dialog";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import { PAYMENT_METHODS } from "@/lib/validations/expense";

export function ExpenseDetails({ expense, onClose }: { expense: ExpenseWithRefs | null; onClose: () => void }) {
  const method = PAYMENT_METHODS.find((m) => m.value === expense?.payment_method)?.label;
  const rows: [string, string][] = expense ? [
    ["Category", expense.category?.name ?? "—"], ["Date", displayDate(expense.occurred_on)], ["Amount", formatINR(expense.amount_paise)],
    ["Account", expense.account?.name ?? "None"], ["Payment method", method ?? "Not specified"], ["Note", expense.note || "None"],
    ["Added", new Date(expense.created_at).toLocaleString("en-IN")], ["Last updated", new Date(expense.updated_at).toLocaleString("en-IN")],
  ] : [];
  return (
    <Dialog open={!!expense} onClose={onClose} title={expense?.title ?? "Expense"}>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="num text-right">{v}</dd></div>
        ))}
      </dl>
    </Dialog>
  );
}
