"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useExpenses } from "@/hooks/useExpenses";
import { useLookups } from "@/hooks/useLookups";
import { PAGE_SIZE } from "@/lib/data/expenses";
import type { ExpenseWithRefs } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
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
    const c = new URLSearchParams(window.location.search).get("category");
    if (c) patch({ category: c });
  }, [patch]);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const filtered = !!(filters.q || filters.category || filters.account || filters.from || filters.to);
  const openAdd = () => { setEditing(null); setFormOpen(true); };

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Every expense you record, saved to your account."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              disabled={lookups.loading || !!lookups.error}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Import statement
            </Button>
            <Button onClick={openAdd} disabled={lookups.loading || !!lookups.error}>
              <Plus className="h-4 w-4" aria-hidden />
              Add expense
            </Button>
          </div>
        }
      />
      <ExpenseSummary summary={summary} loading={loading} />
      <ExpenseFilters filters={filters} categories={lookups.categories} accounts={lookups.accounts} onChange={patch} />

      {(error || lookups.error) && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error ?? lookups.error}</span>
          <Button variant="secondary" className="h-8" onClick={() => { void reload(); void lookups.reload(); }}>Try again</Button>
        </div>
      )}

      {loading && rows.length === 0 ? <ListSkeleton /> : rows.length === 0 && !error ? (
        filtered
          ? <EmptyState title="No expenses match these filters" body="Try a wider date range or clear the filters." action={<Button variant="secondary" onClick={() => patch({ q: "", category: "", account: "", from: "", to: "", page: 0 })}>Clear filters</Button>} />
          : <EmptyState title="No expenses yet" body="Add your first expense or import a statement to start tracking where your money goes." action={<Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden />Add expense</Button>} />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : ""} aria-busy={loading}>
          <ExpenseTable rows={rows} sort={filters.sort} dir={filters.dir}
            onSort={(k) => patch(filters.sort === k ? { dir: filters.dir === "asc" ? "desc" : "asc", page: 0 } : { sort: k, dir: "desc", page: 0 })}
            onView={setViewing} onEdit={(e) => { setEditing(e); setFormOpen(true); }} onDelete={setDeleting} />
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span className="num">Page {filters.page + 1} of {pages} · {count} expenses</span>
            <div className="flex gap-2">
              <Button variant="secondary" className="h-9 px-3" disabled={filters.page === 0} onClick={() => patch({ page: filters.page - 1 })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="secondary" className="h-9 px-3" disabled={filters.page + 1 >= pages} onClick={() => patch({ page: filters.page + 1 })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </nav>
        </div>
      )}

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
    </>
  );
}
