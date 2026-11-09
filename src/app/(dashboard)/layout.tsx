import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { checkUserApproval } from "@/lib/data/users";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { isApproved, isAdmin } = await checkUserApproval(supabase, user.id);
  if (!isApproved && !isAdmin) {
    redirect("/pending-approval");
  }

  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const displayName = fullName || user.email || "";
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={displayName} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">{children}</main>
      </div>
      <MobileNavigation />
    </div>
  );
}
