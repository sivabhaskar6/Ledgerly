"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import { createIncome, deleteIncome, fetchIncome, fetchIncomeSummary, INCOME_PAGE_SIZE, updateIncome, type Income } from "@/lib/data/income";
import { incomeFormSchema, INCOME_SOURCES, type IncomeFormValues } from "@/lib/validations/income";
import { formatINR, paiseToRupeesString } from "@/lib/utils/money";
import { displayDate, todayISO } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormError } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldShell, SelectField, TextField } from "@/components/ui/Field";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const sourceLabel = (v: string) => INCOME_SOURCES.find((s) => s.value === v)?.label ?? v;
const blank = (): IncomeFormValues => ({ title: "", source: "stock_profit", occurred_on: todayISO(), amount: "", note: "" });

export function IncomeView() {
  const { notify } = useToast();
  const [rows, setRows] = useState<Income[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [sum, setSum] = useState<{ today: number; month: number; year: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Income | "new" | null>(null);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const db = createClient();
      const [list, s] = await Promise.all([fetchIncome(db, page), fetchIncomeSummary(db)]);
      setRows(list.rows); setCount(list.count); setSum(s);
    } catch (e) { setError(errorMessage(e, "Could not load income.")); } finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try { await deleteIncome(createClient(), deleting.id); notify("success", "Income entry deleted."); setDeleting(null); await load(); }
    catch (e) { notify("error", errorMessage(e, "Could not delete the entry.")); } finally { setBusy(false); }
  }

  const pages = Math.max(1, Math.ceil(count / INCOME_PAGE_SIZE));
  const cards = [["Earned today", sum?.today], ["Earned this month", sum?.month], ["Earned this year", sum?.year]] as const;
  return (
    <>
      <PageHeader title="Income" description="Profit and other money you earned. Your original capital is not income."
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden />Add income</Button>} />
      <dl className="mb-5 grid grid-cols-3 gap-3">
        {cards.map(([label, v]) => (
          <div key={label} className="rounded-card border border-slate-200 bg-white p-3 md:p-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="num mt-1 text-base font-semibold text-emerald-700 md:text-xl">{v === undefined ? "—" : formatINR(v)}</dd>
          </div>
        ))}
      </dl>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button className="underline" onClick={() => void load()}>Try again</button></div>}
      {loading && rows.length === 0 ? <ListSkeleton rows={4} /> : rows.length === 0 && !error ? (
        <EmptyState title="No income recorded yet" body="Add profit from selling shares, an IPO listing gain, dividends or interest." action={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden />Add income</Button>} />
      ) : (
        <div className={loading ? "opacity-60" : ""}>
          <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 md:p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-slate-500">{sourceLabel(r.source)} · {displayDate(r.occurred_on)}</p>
                  {r.note && <p className="mt-0.5 truncate text-xs text-slate-500">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="num mr-1 font-semibold text-emerald-700">+{formatINR(r.amount_paise)}</span>
                  <button aria-label={`Edit ${r.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></button>
                  <button aria-label={`Delete ${r.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span className="num">Page {page + 1} of {pages} · {count} entries</span>
            <div className="flex gap-2">
              <Button variant="secondary" className="h-9 px-3" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="secondary" className="h-9 px-3" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </nav>
        </div>
      )}
      <IncomeForm target={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <ConfirmDialog open={!!deleting} title="Delete this income entry?" busy={busy} confirmLabel="Delete entry"
        body={deleting ? `"${deleting.title}" will be permanently removed from your income totals. This cannot be undone.` : ""}
        onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </>
  );
}

function IncomeForm({ target, onClose, onSaved }: { target: Income | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const existing = target && target !== "new" ? target : null;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<IncomeFormValues>({ resolver: zodResolver(incomeFormSchema), defaultValues: blank() });
  useEffect(() => {
    if (!target) return;
    setError(null);
    reset(existing ? { title: existing.title, source: existing.source as IncomeFormValues["source"], occurred_on: existing.occurred_on, amount: paiseToRupeesString(existing.amount_paise), note: existing.note ?? "" } : blank());
  }, [target, existing, reset]);

  async function onSubmit(v: IncomeFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (existing) await updateIncome(db, existing.id, v); else await createIncome(db, v);
      notify("success", existing ? "Income updated." : "Income added.");
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e, "Could not save the income entry.")); }
  }
  return (
    <Dialog open={!!target} onClose={onClose} title={existing ? "Edit income" : "Add income"} wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <TextField label="Title" placeholder="e.g. Sold TCS shares" {...register("title")} error={errors.title?.message} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label="Profit amount (₹)" error={errors.amount?.message} hint="Only the profit, not the money you invested.">
            {(id, d) => <input id={id} inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} aria-describedby={d} {...register("amount")}
              className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.amount ? "border-red-400" : "border-slate-300"}`} />}
          </FieldShell>
          <TextField label="Date" type="date" {...register("occurred_on")} error={errors.occurred_on?.message} />
        </div>
        <SelectField label="Type of income" {...register("source")}>
          {INCOME_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </SelectField>
        <TextField label="Note (optional)" {...register("note")} error={errors.note?.message} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{existing ? "Save changes" : "Add income"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
