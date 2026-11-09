"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  Clock,
  Check,
  X,
  Ban,
  RefreshCw,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchAdminUsers,
  approveUserProfile,
  rejectUserProfile,
  getReRequestCooldown,
  formatUserName,
  type UserProfile,
} from "@/lib/data/users";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function formatFullDateTime(s?: string | null) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return s || "—";
  }
}

type FilterTab = "all" | "pending" | "approved" | "rejected";

export function AdminUsersCard() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers(createClient());
      setIsAdmin(res.isCurrentUserAdmin);
      setCurrentUserId(res.currentUserId);
      setUsers(res.users);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const approvedUsers = useMemo(
    () => users.filter((u) => u.is_approved && u.status === "approved"),
    [users]
  );
  const pendingUsers = useMemo(
    () => users.filter((u) => !u.is_approved && u.status === "pending"),
    [users]
  );
  const rejectedUsers = useMemo(
    () => users.filter((u) => !u.is_approved && u.status === "rejected"),
    [users]
  );

  const filteredUsers = useMemo(() => {
    switch (activeTab) {
      case "pending":
        return pendingUsers;
      case "approved":
        return approvedUsers;
      case "rejected":
        return rejectedUsers;
      default:
        return users;
    }
  }, [activeTab, users, pendingUsers, approvedUsers, rejectedUsers]);

  if (!isAdmin) {
    return null;
  }

  async function handleApprove(user: UserProfile) {
    setActionLoadingId(user.id);
    try {
      await approveUserProfile(createClient(), user.id);
      notify("success", `Approved ${formatUserName(user.display_name, user.email)} (${user.email || ""}). They can now log in!`);
      await loadData();
    } catch (err) {
      notify("error", (err as Error)?.message || "Could not approve user.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject(user: UserProfile) {
    setActionLoadingId(user.id);
    try {
      await rejectUserProfile(createClient(), user.id, user.rejection_count);
      const nextCount = (user.rejection_count || 0) + 1;
      const cooldownHours = nextCount <= 3 ? 2 : 24;
      notify(
        "success",
        `Access rejected for ${formatUserName(user.display_name, user.email)}. Cooldown: ${cooldownHours}h.`
      );
      await loadData();
    } catch (err) {
      notify("error", (err as Error)?.message || "Could not reject user.");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="mt-8 rounded-card border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">User Approvals & Access</h2>
            <p className="text-xs text-slate-500">
              Review and approve friends or new users who register to use your Ledgerly instance.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadData()}
          loading={loading}
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Summary Stat Cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-900">{approvedUsers.length}</div>
            <div className="text-xs text-emerald-700">Approved Users</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-amber-900">{pendingUsers.length}</div>
            <div className="text-xs text-amber-700">Pending Requests</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-rose-100 bg-rose-50/50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <Ban className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-rose-900">{rejectedUsers.length}</div>
            <div className="text-xs text-rose-700">Rejected Users</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-5 flex gap-2 border-b border-slate-100 pb-2 text-xs">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            activeTab === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            activeTab === "pending"
              ? "bg-amber-600 text-white"
              : "text-amber-700 hover:bg-amber-50"
          }`}
        >
          Pending ({pendingUsers.length})
        </button>
        <button
          onClick={() => setActiveTab("approved")}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            activeTab === "approved"
              ? "bg-emerald-600 text-white"
              : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          Approved ({approvedUsers.length})
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            activeTab === "rejected"
              ? "bg-rose-600 text-white"
              : "text-rose-700 hover:bg-rose-50"
          }`}
        >
          Rejected ({rejectedUsers.length})
        </button>
      </div>

      {/* Table */}
      <div className="mt-3 divide-y divide-slate-100 overflow-x-auto">
        {filteredUsers.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No users match the selected tab filter.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Request Sent</th>
                <th className="pb-2 font-medium">Decision & Status</th>
                <th className="pb-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const isPending = !u.is_approved && u.status === "pending";
                const isApproved = u.is_approved && u.status === "approved";
                const isRejected = !u.is_approved && u.status === "rejected";
                const isProcessing = actionLoadingId === u.id;
                const cooldown = getReRequestCooldown(u.rejected_at, u.rejection_count);

                return (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    {/* User Info */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        {formatUserName(u.display_name, u.email)}
                        {isSelf && (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            Super Admin (You)
                          </span>
                        )}
                        {!isSelf && u.is_admin && (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500">{u.email || "No email"}</div>
                    </td>

                    {/* Requested At */}
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">
                      <div>{formatFullDateTime(u.requested_at || u.created_at)}</div>
                      {u.rejection_count > 0 && isPending && (
                        <div className="text-[10px] text-amber-600 font-medium">
                          Re-request (Attempt #{u.rejection_count + 1})
                        </div>
                      )}
                    </td>

                    {/* Decision & Timestamps */}
                    <td className="py-3 pr-4">
                      {isApproved && (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <Check className="h-3 w-3" /> Approved
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Approved on: {formatFullDateTime(u.approved_at || u.created_at)}
                          </div>
                        </div>
                      )}

                      {isPending && (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            <Clock className="h-3 w-3" /> Pending Approval
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Awaiting your review
                          </div>
                        </div>
                      )}

                      {isRejected && (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                            <Ban className="h-3 w-3" /> Rejected ({u.rejection_count}x)
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Rejected on: {formatFullDateTime(u.rejected_at)}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                            {cooldown.isLocked ? (
                              <span className="inline-flex items-center text-amber-600 font-medium">
                                <Timer className="mr-0.5 h-3 w-3" />
                                Re-request in {cooldown.formattedRemaining} ({cooldown.cooldownHours}h cooldown)
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-emerald-600 font-medium">
                                <CheckCircle2 className="mr-0.5 h-3 w-3" />
                                Can re-request now
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 text-right whitespace-nowrap">
                      {isSelf ? (
                        <span className="text-[11px] text-slate-400 italic">Primary Account</span>
                      ) : isPending ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            loading={isProcessing}
                            onClick={() => void handleApprove(u)}
                            className="h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            variant="secondary"
                            loading={isProcessing}
                            onClick={() => void handleReject(u)}
                            className="h-7 px-2.5 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : isApproved ? (
                        <Button
                          variant="secondary"
                          loading={isProcessing}
                          onClick={() => void handleReject(u)}
                          className="h-7 px-2.5 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" /> Revoke Access
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          loading={isProcessing}
                          onClick={() => void handleApprove(u)}
                          className="h-7 px-2.5 text-xs text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve Access
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
