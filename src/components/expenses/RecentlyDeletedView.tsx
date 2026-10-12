"use client";
import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { ExpenseWithRefs } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, fetchDeleted, permanentlyDeleteExpense, restoreExpense } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

export function RecentlyDeletedView() {
  const { notify } = useToast();
  const [rows, setRows] = useState<ExpenseWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ExpenseWithRefs | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchDeleted(createClient())); } catch (e) { setError(errorMessage(e, "Could not load deleted expenses.")); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function restore(e: ExpenseWithRefs) {
    setBusyId(e.id);
    try { await restoreExpense(createClient(), e.id); notify("success", `Restored "${e.title}" to ${displayDate(e.occurred_on)}.`); await load(); }
    catch (err) { notify("error", errorMessage(err, "Could not restore the expense.")); } finally { setBusyId(null); }
  }
  async function destroy() {
    if (!target) return;
    setBusyId(target.id);
    try { await permanentlyDeleteExpense(createClient(), target.id); notify("success", "Deleted permanently."); setTarget(null); await load(); }
    catch (err) { notify("error", errorMessage(err, "Could not delete the expense.")); } finally { setBusyId(null); }
  }

  return (
    <>
      <PageHeader title="Recently deleted" description="Deleted expenses stay here until you remove them permanently. They are not counted in any totals." />
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button className="underline" onClick={() => void load()}>Try again</button></div>}
      {loading ? <ListSkeleton rows={3} /> : rows.length === 0 && !error ? (
        <EmptyState title="Nothing in Recently deleted" body="Expenses you delete will appear here so you can restore them." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{e.category?.name ?? "—"} · {displayDate(e.occurred_on)} · deleted {new Date(e.deleted_at!).toLocaleString("en-IN")}</p>
                {e.note && <p className="mt-0.5 truncate text-xs text-slate-500">{e.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="num mr-2 font-medium text-red-600">{formatINR(e.amount_paise)}</span>
                <Button variant="secondary" className="h-9" loading={busyId === e.id} onClick={() => restore(e)}><RotateCcw className="h-4 w-4" aria-hidden />Restore</Button>
                <Button variant="ghost" className="h-9 text-red-600 hover:bg-red-50" disabled={busyId === e.id} onClick={() => setTarget(e)}><Trash2 className="h-4 w-4" aria-hidden />Delete forever</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!target} title="Delete permanently?" busy={!!busyId} confirmLabel="Delete forever"
        body={target ? `"${target.title}" will be erased and cannot be recovered.` : ""} onConfirm={destroy} onClose={() => setTarget(null)} />
    </>
  );
}
