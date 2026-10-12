"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

export function Topbar({ name }: { name: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      notify("error", "Could not log out. Check your connection and try again.");
      setBusy(false);
    }
  }
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <span className="text-lg font-semibold text-brand-700 md:hidden">Ledgerly</span>
      <span className="hidden text-sm text-slate-500 md:block">{name}</span>
      <button onClick={logout} disabled={busy} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60">
        <LogOut className="h-4 w-4" aria-hidden />Log out
      </button>
    </header>
  );
}
