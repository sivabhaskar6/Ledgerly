"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowRightLeft, Archive, ArchiveRestore, Pencil, Landmark, Wallet, LineChart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { archiveAccount, fetchAccountsWithBalances, fetchTransfers, unarchiveAccount, deleteTransfer } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import type { Account, AccountWithBalance, TransferWithRefs } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { AccountFormModal } from "./AccountFormModal";
import { TransferModal } from "./TransferModal";

function typeIcon(type: Account["type"]) {
  switch (type) {
    case "bank": return <Landmark className="h-4 w-4 text-indigo-600" />;
    case "cash": return <Wallet className="h-4 w-4 text-emerald-600" />;
    case "brokerage": return <LineChart className="h-4 w-4 text-purple-600" />;
  }
}

function typeBadge(type: Account["type"]) {
  switch (type) {
    case "bank": return <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Bank</span>;
    case "cash": return <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Cash</span>;
    case "brokerage": return <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">Brokerage</span>;
  }
}

export function AccountsView() {
  const { notify } = useToast();
  const [data, setData] = useState<{
    accounts: AccountWithBalance[];
    totalLiquidPaise: number;
    totalBrokeragePaise: number;
    netWorthPaise: number;
  } | null>(null);
  const [transfers, setTransfers] = useState<TransferWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [deleteTransferTarget, setDeleteTransferTarget] = useState<TransferWithRefs | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [accResult, tfResult] = await Promise.all([
        fetchAccountsWithBalances(db),
        fetchTransfers(db),
      ]);
      setData(accResult);
      setTransfers(tfResult);
    } catch (e) {
      setError(errorMessage(e, "Could not load accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAccounts = data?.accounts.filter((a) => !a.archived_at) ?? [];
  const archivedAccounts = data?.accounts.filter((a) => !!a.archived_at) ?? [];

  async function handleArchiveToggle() {
    if (!archiveTarget) return;
    try {
      const db = createClient();
      if (archiveTarget.archived_at) {
        await unarchiveAccount(db, archiveTarget.id);
        notify("success", `Unarchived ${archiveTarget.name}.`);
      } else {
        await archiveAccount(db, archiveTarget.id);
        notify("success", `Archived ${archiveTarget.name}.`);
      }
      setArchiveTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not update account status."));
    }
  }

  async function handleDeleteTransfer() {
    if (!deleteTransferTarget) return;
    try {
      const db = createClient();
      await deleteTransfer(db, deleteTransferTarget.id);
      notify("success", "Transfer deleted.");
      setDeleteTransferTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete transfer."));
    }
  }

  return (
    <>
      <PageHeader
        title="Accounts & Liquidity"
        description="Monitor bank balances, cash in hand, and brokerage accounts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setTransferOpen(true)}
              disabled={activeAccounts.length < 2}
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
              Transfer money
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" aria-hidden />
              Add account
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Liquid Cash & Bank</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="num mt-1 text-xl font-semibold text-slate-900">
              {formatINR(data?.totalLiquidPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Available across checking & cash</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Brokerage & Demat</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="num mt-1 text-xl font-semibold text-purple-700">
              {formatINR(data?.totalBrokeragePaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Trading cash balance</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Net Liquid Balance</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="num mt-1 text-xl font-semibold text-indigo-700">
              {formatINR(data?.netWorthPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Total in all active accounts</p>
        </div>
      </div>

      {/* Accounts List */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Active Accounts ({activeAccounts.length})</h2>
          {archivedAccounts.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {showArchived ? "Hide archived accounts" : `Show archived (${archivedAccounts.length})`}
            </button>
          )}
        </div>

        {loading && activeAccounts.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-card border border-slate-200 bg-white p-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="mt-4 h-8 w-24" />
              </div>
            ))}
          </div>
        ) : activeAccounts.length === 0 && !error ? (
          <EmptyState
            title="No accounts yet"
            body="Add your bank accounts, cash wallets, or brokerage accounts to track balances accurately."
            action={
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" aria-hidden />Add first account
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeAccounts.map((a) => (
              <div key={a.id} className="flex flex-col justify-between rounded-card border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-slate-100 p-2">{typeIcon(a.type)}</div>
                      <span className="font-semibold text-slate-900">{a.name}</span>
                    </div>
                    {typeBadge(a.type)}
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-slate-500">Current Balance</p>
                    <p className="num text-2xl font-bold text-slate-900">{formatINR(a.current_balance_paise)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-400">
                    <span>Opening: {formatINR(a.opening_balance_paise)}</span>
                    <span>·</span>
                    <span>{a.tx_count} {a.tx_count === 1 ? "entry" : "entries"}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => { setEditing(a); setFormOpen(true); }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Edit ${a.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setArchiveTarget(a)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-amber-600"
                    aria-label={`Archive ${a.name}`}
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Archived Accounts */}
        {showArchived && archivedAccounts.length > 0 && (
          <div className="mt-6 rounded-card border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Archived Accounts</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {archivedAccounts.map((a) => (
                <div key={a.id} className="rounded-card border border-slate-200 bg-white p-3 opacity-75">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{a.name}</span>
                    <button
                      onClick={() => setArchiveTarget(a)}
                      className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                    </button>
                  </div>
                  <p className="num mt-2 font-semibold text-slate-600">{formatINR(a.current_balance_paise)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transfers History */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Account Transfers</h2>
        {transfers.length === 0 ? (
          <div className="rounded-card border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No transfers recorded yet. Use &ldquo;Transfer money&rdquo; to move capital between accounts without logging an expense.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">From Account</th>
                  <th className="px-4 py-3 font-medium">To Account</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((tf) => (
                  <tr key={tf.id} className="hover:bg-slate-50">
                    <td className="num whitespace-nowrap px-4 py-3 text-slate-600">{displayDate(tf.occurred_on)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{tf.from_account?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{tf.to_account?.name ?? "—"}</td>
                    <td className="max-w-[14rem] truncate px-4 py-3 text-slate-500">{tf.note ?? "—"}</td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right font-semibold text-indigo-700">{formatINR(tf.amount_paise)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteTransferTarget(tf)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        aria-label="Delete transfer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccountFormModal
        open={formOpen}
        account={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
        notify={notify}
      />

      <TransferModal
        open={transferOpen}
        accounts={data?.accounts ?? []}
        onClose={() => setTransferOpen(false)}
        onSaved={() => void load()}
        notify={notify}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.archived_at ? `Restore "${archiveTarget?.name}"?` : `Archive "${archiveTarget?.name}"?`}
        body={
          archiveTarget?.archived_at
            ? "This account will be active again in dropdowns and totals."
            : "Archived accounts are hidden from expense and transfer forms, but historical records remain intact."
        }
        confirmLabel={archiveTarget?.archived_at ? "Restore" : "Archive"}
        onConfirm={() => void handleArchiveToggle()}
        onClose={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTransferTarget}
        title="Delete transfer record?"
        body="This will revert the transfer between the accounts."
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteTransfer()}
        onClose={() => setDeleteTransferTarget(null)}
      />
    </>
  );
}
