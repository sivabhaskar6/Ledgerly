"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, ShieldAlert, CheckCircle2, Ban, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  checkUserApproval,
  getReRequestCooldown,
  reRequestAccess,
  type ApprovalStatusResult,
} from "@/lib/data/users";

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

export default function PendingApprovalPage() {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [profile, setProfile] = useState<ApprovalStatusResult | null>(null);
  const [, setTicker] = useState(0);

  const checkStatus = async () => {
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const res = await checkUserApproval(supabase, authData.user.id, authData.user.email);
        setProfile(res);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkStatus();
    // Live ticker every 30 seconds for countdown
    const interval = setInterval(() => setTicker((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const cooldown = profile?.status === "rejected"
    ? getReRequestCooldown(profile.rejected_at, profile.rejection_count || 0)
    : null;

  async function handleReRequest() {
    setRequesting(true);
    try {
      await reRequestAccess(createClient());
      await checkStatus();
    } catch {
      // ignore
    } finally {
      setRequesting(false);
    }
  }

  const isRejected = profile?.status === "rejected";

  return (
    <div className="space-y-5 text-center">
      {/* Icon */}
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-8 ${
          isRejected
            ? "bg-rose-50 text-rose-600 ring-rose-50/50"
            : "bg-amber-50 text-amber-600 ring-amber-50/50"
        }`}
      >
        {isRejected ? <Ban className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
      </div>

      {/* Headings */}
      <div>
        <div
          className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isRejected
              ? "bg-rose-50 text-rose-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {isRejected ? (
            <>
              <Ban className="h-3.5 w-3.5" />
              Request Declined
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Email Verified
            </>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {isRejected ? "Access Request Declined" : "Under Admin Approval"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isRejected
            ? `Your request was declined on ${formatFullDateTime(profile?.rejected_at)}`
            : "Your account is awaiting administrator review."}
        </p>
      </div>

      {/* Details Box */}
      <div
        className={`rounded-card border p-4 text-left ${
          isRejected ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"
        }`}
      >
        <div className="flex items-start gap-3">
          {isRejected ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div className="space-y-1.5 text-xs leading-relaxed text-slate-800">
            {isRejected ? (
              <>
                <p className="font-semibold text-rose-950">
                  Access was not approved by the administrator
                </p>
                <p>
                  You were rejected {profile?.rejection_count || 1} time
                  {(profile?.rejection_count || 1) > 1 ? "s" : ""}.
                </p>
                {cooldown?.isLocked ? (
                  <p className="flex items-center gap-1.5 pt-1 text-rose-900 font-medium">
                    <Timer className="h-4 w-4 shrink-0 text-rose-600" />
                    You can request access again in{" "}
                    <strong>{cooldown.formattedRemaining}</strong> (cooldown:{" "}
                    {cooldown.cooldownHours}h).
                  </p>
                ) : (
                  <p className="pt-1 text-emerald-800 font-medium">
                    Your cooldown has expired! You can now submit a new request below.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-amber-950">
                  Account awaiting administrator approval
                </p>
                <p>
                  To protect database resources, access to this Ledgerly instance requires approval from the administrator.
                </p>
                {profile?.requested_at && (
                  <p className="text-[11px] text-amber-900">
                    Request sent: <strong>{formatFullDateTime(profile.requested_at)}</strong>
                  </p>
                )}
                <p className="pt-1">
                  The admin has been notified. Once approved, you can log in directly with your email and password.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        {isRejected && (
          <Button
            onClick={() => void handleReRequest()}
            loading={requesting}
            disabled={Boolean(cooldown?.isLocked)}
            className="w-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {cooldown?.isLocked
              ? `Re-request in ${cooldown.formattedRemaining}`
              : "Request Access Again"}
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={() => void checkStatus()}
          loading={loading}
          className="w-full gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Check Status
        </Button>

        <Link href="/login" className="block w-full">
          <Button variant="ghost" className="w-full text-xs text-slate-500">
            Back to Log in
          </Button>
        </Link>
      </div>
    </div>
  );
}
