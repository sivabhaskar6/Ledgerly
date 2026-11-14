import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkUserApproval } from "@/lib/data/users";
import { UserApprovalsView } from "@/components/settings/UserApprovalsView";

export default async function UserApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { isAdmin } = await checkUserApproval(supabase, user.id);
  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <UserApprovalsView />;
}
