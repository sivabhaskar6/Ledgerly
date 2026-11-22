"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useExpenses } from "@/hooks/useExpenses";
import { useLookups } from "@/hooks/useLookups";
import { PAGE_SIZE } from "@/lib/data/expenses";
import type { ExpenseWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ExpenseSummary } from "./ExpenseSummary";
import { ExpenseFilters } from "./ExpenseFilters";
import { ExpenseTable } from "./ExpenseTable";
import { ExpenseForm } from "./ExpenseForm";
import { ExpenseDetails } from "./ExpenseDetails";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";
import { ImportModal } from "./ImportModal";

export function ExpensesView() {
  const { notify } = useToast();
  const { filters, patch, rows, count, summary, loading, error, reload } = useExpenses();
  const lookups = useLookups();
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseWithRefs | null>(null);
  const [viewing, setViewing] = useState<ExpenseWithRefs | null>(null);
  const [deleting, setDeleting] = useState<ExpenseWithRefs | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("category");
    const from = sp.get("from");
    const to = sp.get("to");
    const patchObj: Partial<typeof filters> = {};
    if (c) patchObj.category = c;
    if (from) patchObj.from = from;
    if (to) patchObj.to = to;
    if (Object.keys(patchObj).length > 0) {
      patch(patchObj);
    }
  }, [patch]);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const filtered = !!(filters.q || filters.category || filters.account || filters.from || filters.to);
  const openAdd = () => { setEditing(null); setFormOpen(true); };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Expenses</h1>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">Every expense you record, saved to your account.</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            disabled={lookups.loading || !!lookups.error}
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-medium shadow-xs"
          >
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            <span>Import<span className="hidden sm:inline"> statement</span></span>
          </Button>
          <Button
            onClick={openAdd}
            disabled={lookups.loading || !!lookups.error}
            className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

      <ExpenseSummary summary={summary} loading={loading} />
      <ExpenseFilters filters={filters} categories={lookups.categories} accounts={lookups.accounts} onChange={patch} />

      {(error || lookups.error) && (
        <div role="alert" className="mb-2.5 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0">
          <span>{error ?? lookups.error}</span>
          <Button variant="secondary" className="h-7 text-xs" onClick={() => { void reload(); void lookups.reload(); }}>Try again</Button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {loading && rows.length === 0 ? <ListSkeleton /> : rows.length === 0 && !error ? (
          filtered
            ? <EmptyState title="No expenses match these filters" body="Try a wider date range or clear the filters." action={<Button variant="secondary" onClick={() => patch({ q: "", category: "", account: "", from: "", to: "", page: 0 })}>Clear filters</Button>} />
            : <EmptyState title="No expenses yet" body="Add your first expense or import a statement to start tracking where your money goes." action={<Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden />Add expense</Button>} />
        ) : (
          <>
            <div className={`flex-1 min-h-0 flex flex-col ${loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={loading}>
              <ExpenseTable rows={rows} sort={filters.sort} dir={filters.dir}
                onSort={(k) => patch(filters.sort === k ? { dir: filters.dir === "asc" ? "desc" : "asc", page: 0 } : { sort: k, dir: "desc", page: 0 })}
                onView={setViewing} onEdit={(e) => { setEditing(e); setFormOpen(true); }} onDelete={setDeleting} />
            </div>
            <nav aria-label="Pagination" className="shrink-0 mt-2 flex items-center justify-between text-xs text-slate-600 px-1">
              <span className="num">Page {filters.page + 1} of {pages} · {count} expenses</span>
              <div className="flex gap-2">
                <Button variant="secondary" className="h-8 px-2.5 text-xs shadow-xs" disabled={filters.page === 0} onClick={() => patch({ page: filters.page - 1 })} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="secondary" className="h-8 px-2.5 text-xs shadow-xs" disabled={filters.page + 1 >= pages} onClick={() => patch({ page: filters.page + 1 })} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </nav>
          </>
        )}
      </div>

      <ExpenseForm open={formOpen} expense={editing} categories={lookups.categories} accounts={lookups.accounts} onClose={() => setFormOpen(false)} onSaved={() => void reload()} />
      <ExpenseDetails expense={viewing} onClose={() => setViewing(null)} />
      <DeleteExpenseDialog expense={deleting} onClose={() => setDeleting(null)} onDeleted={() => void reload()} />
      <ImportModal
        open={importOpen}
        categories={lookups.categories}
        accounts={lookups.accounts}
        onClose={() => setImportOpen(false)}
        onImported={() => { void reload(); void lookups.reload(); }}
        notify={notify}
      />
    </div>
  );
}
