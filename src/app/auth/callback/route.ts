import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkUserApproval } from "@/lib/data/users";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const rawName = data.user.user_metadata?.full_name || data.user.user_metadata?.name;
      if (rawName) {
        try {
          await supabase.from("profiles").update({
            display_name: rawName,
            email: data.user.email,
          }).eq("id", data.user.id);
        } catch {
          // ignore
        }
      }
      const { isApproved, isAdmin } = await checkUserApproval(supabase, data.user.id);
      if (!isApproved && !isAdmin) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/pending-approval`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
