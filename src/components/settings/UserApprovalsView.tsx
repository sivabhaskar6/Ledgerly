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
  Users,
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
import { Skeleton } from "@/components/ui/Skeleton";
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

export function UserApprovalsView() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers(createClient());
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

  async function handleApprove(user: UserProfile) {
    setActionLoadingId(user.id);
    try {
      await approveUserProfile(createClient(), user.id);
      notify(
        "success",
        `Approved ${formatUserName(user.display_name, user.email)} (${user.email || ""}). They can now log in!`
      );
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
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">User Approvals & Access</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              <ShieldCheck className="h-3 w-3" />
              Admin Only
            </span>
          </div>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
            Review and manage access for friends or new users who register to use your Ledgerly instance.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadData()}
          loading={loading}
          className="h-8 sm:h-9 gap-1.5 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Approved Users</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-emerald-700 md:text-xl dark:text-emerald-400">
              {approvedUsers.length}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Have active system access</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Pending Requests</span>
            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-amber-600 md:text-xl dark:text-amber-400">
              {pendingUsers.length}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Awaiting your approval</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Rejected Requests</span>
            <Ban className="h-3.5 w-3.5 text-rose-500 shrink-0" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-rose-700 md:text-xl dark:text-rose-400">
              {rejectedUsers.length}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Denied with cooldown timer</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Total Registered</span>
            <Users className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-slate-900 md:text-xl dark:text-white">
              {users.length}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Total user accounts</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 shrink-0 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
            activeTab === "all"
              ? "bg-slate-900 text-white font-bold shadow-xs dark:bg-white dark:text-zinc-950 dark:shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-400 dark:hover:bg-[#252525] dark:hover:text-white font-medium"
          }`}
        >
          All
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === "all" ? "bg-black/10 text-slate-900 dark:bg-black/15 dark:text-zinc-950 font-bold" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-400"
            }`}
          >
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
            activeTab === "pending"
              ? "bg-slate-900 text-white font-bold shadow-xs dark:bg-white dark:text-zinc-950 dark:shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-400 dark:hover:bg-[#252525] dark:hover:text-white font-medium"
          }`}
        >
          <Clock className={`h-3.5 w-3.5 ${activeTab === "pending" ? "text-white dark:text-zinc-950" : "text-amber-500"}`} />
          Pending
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === "pending" ? "bg-black/10 text-slate-900 dark:bg-black/15 dark:text-zinc-950 font-bold" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-400"
            }`}
          >
            {pendingUsers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("approved")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
            activeTab === "approved"
              ? "bg-slate-900 text-white font-bold shadow-xs dark:bg-white dark:text-zinc-950 dark:shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-400 dark:hover:bg-[#252525] dark:hover:text-white font-medium"
          }`}
        >
          <CheckCircle2 className={`h-3.5 w-3.5 ${activeTab === "approved" ? "text-white dark:text-zinc-950" : "text-emerald-500"}`} />
          Approved
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === "approved" ? "bg-black/10 text-slate-900 dark:bg-black/15 dark:text-zinc-950 font-bold" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-400"
            }`}
          >
            {approvedUsers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("rejected")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
            activeTab === "rejected"
              ? "bg-slate-900 text-white font-bold shadow-xs dark:bg-white dark:text-zinc-950 dark:shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-400 dark:hover:bg-[#252525] dark:hover:text-white font-medium"
          }`}
        >
          <Ban className={`h-3.5 w-3.5 ${activeTab === "rejected" ? "text-white dark:text-zinc-950" : "text-rose-500"}`} />
          Rejected
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === "rejected" ? "bg-black/10 text-slate-900 dark:bg-black/15 dark:text-zinc-950 font-bold" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-400"
            }`}
          >
            {rejectedUsers.length}
          </span>
        </button>
      </div>

      {/* Table & Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && users.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            No users match the selected tab filter.
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2 whitespace-nowrap">Request Sent</th>
                    <th className="px-4 py-2">Decision & Status</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">Actions</th>
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
                      <tr key={u.id} className="transition hover:bg-slate-50/70">
                        {/* User Info */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <span>{formatUserName(u.display_name, u.email)}</span>
                            {isSelf && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-700">
                                Super Admin (You)
                              </span>
                            )}
                            {!isSelf && u.is_admin && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-700">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.email || "No email"}</div>
                        </td>

                        {/* Requested At */}
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                          <div>{formatFullDateTime(u.requested_at || u.created_at)}</div>
                          {u.rejection_count > 0 && isPending && (
                            <div className="text-[10px] text-amber-600 font-medium">
                              Re-request (Attempt #{u.rejection_count + 1})
                            </div>
                          )}
                        </td>

                        {/* Decision & Timestamps */}
                        <td className="px-4 py-2.5">
                          {isApproved && (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                <Check className="h-3 w-3" /> Approved
                              </span>
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                Approved on: {formatFullDateTime(u.approved_at || u.created_at)}
                              </div>
                            </div>
                          )}

                          {isPending && (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                <Clock className="h-3 w-3" /> Pending Approval
                              </span>
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                Awaiting your review
                              </div>
                            </div>
                          )}

                          {isRejected && (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                <Ban className="h-3 w-3" /> Rejected ({u.rejection_count}x)
                              </span>
                              <div className="mt-0.5 text-[10px] text-slate-400">
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
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {isSelf ? (
                            <span className="text-[11px] text-slate-400 italic">Primary Account</span>
                          ) : isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                loading={isProcessing}
                                onClick={() => void handleApprove(u)}
                                className="h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700 shadow-xs"
                              >
                                <Check className="mr-1 h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button
                                variant="secondary"
                                loading={isProcessing}
                                onClick={() => void handleReject(u)}
                                className="h-7 px-2.5 text-xs text-rose-600 hover:bg-rose-50 shadow-xs"
                              >
                                <X className="mr-1 h-3.5 w-3.5" /> Reject
                              </Button>
                            </div>
                          ) : isApproved ? (
                            <Button
                              variant="secondary"
                              loading={isProcessing}
                              onClick={() => void handleReject(u)}
                              className="h-7 px-2.5 text-xs text-rose-600 hover:bg-rose-50 shadow-xs"
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" /> Revoke Access
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              loading={isProcessing}
                              onClick={() => void handleApprove(u)}
                              className="h-7 px-2.5 text-xs text-emerald-600 hover:bg-emerald-50 shadow-xs"
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
            </div>

            {/* Pinned Bottom Footer */}
            <div className="shrink-0 mt-2 flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Showing {filteredUsers.length} of {users.length} users
              </span>
              <span className="text-[11px] text-slate-400">
                🔒 Only super administrators have access to this section
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
