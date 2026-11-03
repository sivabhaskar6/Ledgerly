"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Coins, Award } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchCapitalEntries, deleteCapitalEntry, type CapitalSummary, type CapitalEntryWithDelta } from "@/lib/data/capital";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { CapitalFormModal } from "./CapitalFormModal";

export function CapitalView() {
  const { notify } = useToast();
  const [data, setData] = useState<CapitalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CapitalEntryWithDelta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CapitalEntryWithDelta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const res = await fetchCapitalEntries(db);
      setData(res);
    } catch (e) {
      setError(errorMessage(e, "Could not load capital entries."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const db = createClient();
      await deleteCapitalEntry(db, deleteTarget.id);
      notify("success", "Capital entry deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete capital entry."));
    }
  }

  return (
    <>
      <PageHeader
        title="Capital Tracking"
        description="Record snapshots of your total available capital over time, with notes and dates."
        actions={
          <Button onClick={() => { setEditingEntry(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden />
            Record capital
          </Button>
        }
      />

      {data?.tableMissing && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Setup Required: Run Database Migration</p>
          <p className="mt-1">
            The <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">capital</code> table is not yet created in your Supabase project.
            Copy and paste the SQL from <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">supabase/migrations/0005_capital.sql</code> into your <strong>Supabase SQL Editor</strong> to enable capital tracking.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Current Capital</p>
            <Coins className="h-4 w-4 text-brand-600" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : data?.currentCapitalPaise !== null && data?.currentCapitalPaise !== undefined ? (
            <p className="num mt-1 text-xl font-bold text-slate-900 md:text-2xl">
              {formatINR(data.currentCapitalPaise)}
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Most recent recorded snapshot</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">All-Time High</p>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : data?.allTimeHighPaise !== null && data?.allTimeHighPaise !== undefined ? (
            <p className="num mt-1 text-xl font-bold text-amber-600 md:text-2xl">
              {formatINR(data.allTimeHighPaise)}
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Peak capital recorded</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Growth from Previous</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : data?.latestDeltaPaise !== null && data?.latestDeltaPaise !== undefined ? (
            <div className="mt-1 flex items-center gap-1.5">
              {data.latestDeltaPaise >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`num text-xl font-bold ${data.latestDeltaPaise >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {data.latestDeltaPaise >= 0 ? `+${formatINR(data.latestDeltaPaise)}` : formatINR(data.latestDeltaPaise)}
              </span>
              {data.latestDeltaPct !== null && (
                <span className="text-xs text-slate-500">({data.latestDeltaPct > 0 ? `+${data.latestDeltaPct}` : data.latestDeltaPct}%)</span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Needs 2+ entries</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Delta vs. prior snapshot</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Entries Logged</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="num mt-1 text-xl font-bold text-slate-900 md:text-2xl">
              {data?.entries.length ?? 0}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Historical snapshots</p>
        </div>
      </div>

      {/* Capital History List / Table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Capital History</h2>

        {loading && (data?.entries.length ?? 0) === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (data?.entries.length ?? 0) === 0 && !error ? (
          <EmptyState
            title="No capital entries logged yet"
            body="Record your total current capital amount to start tracking your capital over time."
            action={
              <Button onClick={() => { setEditingEntry(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" aria-hidden />
                Record first capital entry
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Total Capital</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="num whitespace-nowrap px-4 py-3 text-slate-600">
                      {displayDate(entry.occurred_on)}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right font-bold text-slate-900">
                      {formatINR(entry.amount_paise)}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right">
                      {entry.deltaPaise !== null ? (
                        <span className={`inline-flex items-center gap-0.5 font-medium ${entry.deltaPaise >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {entry.deltaPaise >= 0 ? `+${formatINR(entry.deltaPaise)}` : formatINR(entry.deltaPaise)}
                          {entry.deltaPct !== null && (
                            <span className="text-xs text-slate-400 ml-1">
                              ({entry.deltaPct > 0 ? `+${entry.deltaPct}` : entry.deltaPct}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Baseline</span>
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-slate-500" title={entry.note ?? undefined}>
                      {entry.note || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditingEntry(entry); setFormOpen(true); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Edit entry from ${entry.occurred_on}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                          aria-label={`Delete entry from ${entry.occurred_on}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CapitalFormModal
        open={formOpen}
        entry={editingEntry}
        currentCapitalPaise={data?.currentCapitalPaise ?? null}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
        notify={notify}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete capital entry?"
        body={
          deleteTarget
            ? `The capital entry of ${formatINR(deleteTarget.amount_paise)} on ${displayDate(deleteTarget.occurred_on)} will be permanently removed.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
