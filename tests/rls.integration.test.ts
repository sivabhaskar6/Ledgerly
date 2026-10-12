/**
 * RLS integration test. Runs only when a real Supabase project is configured:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Use a throwaway/dev project: it creates and deletes two test users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!(url && anon && service && !url.includes("example.supabase.co"));

describe.skipIf(!enabled)("row level security", () => {
  const admin = enabled ? createClient(url!, service!) : (null as unknown as SupabaseClient);
  const stamp = Date.now();
  const creds = [`rls-a-${stamp}@example.test`, `rls-b-${stamp}@example.test`].map((email) => ({ email, password: "Test-pass-12345" }));
  const ids: string[] = [];
  let a: SupabaseClient, b: SupabaseClient, txId: string;

  beforeAll(async () => {
    for (const c of creds) {
      const { data, error } = await admin.auth.admin.createUser({ ...c, email_confirm: true });
      if (error) throw error;
      ids.push(data.user.id);
    }
    const login = async (c: (typeof creds)[number]) => {
      const cl = createClient(url!, anon!);
      const { error } = await cl.auth.signInWithPassword(c);
      if (error) throw error;
      return cl;
    };
    a = await login(creds[0]!); b = await login(creds[1]!);
    const { data: cat } = await a.from("categories").select("id").limit(1).single();
    const { data: tx, error } = await a.from("transactions").insert({ user_id: ids[0], category_id: cat!.id, title: "A's expense", occurred_on: "2026-10-11", amount_paise: 1000 }).select("id").single();
    if (error) throw error;
    txId = tx!.id;
  });
  afterAll(async () => { for (const id of ids) await admin.auth.admin.deleteUser(id); });

  it("hides user A's rows from user B", async () => {
    const { data } = await b.from("transactions").select("id").eq("id", txId);
    expect(data).toEqual([]);
  });
  it("blocks B from editing, soft-deleting or hard-deleting A's row", async () => {
    const upd = await b.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", txId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await b.from("transactions").delete().eq("id", txId).select("id");
    expect(del.data ?? []).toEqual([]);
  });
  it("blocks B from inserting a row owned by A or using A's category", async () => {
    const { data: catA } = await a.from("categories").select("id").limit(1).single();
    const asA = await b.from("transactions").insert({ user_id: ids[0], category_id: catA!.id, title: "x", occurred_on: "2026-10-11", amount_paise: 1 });
    expect(asA.error).not.toBeNull();
    const ownIdForeignCat = await b.from("transactions").insert({ user_id: ids[1], category_id: catA!.id, title: "x", occurred_on: "2026-10-11", amount_paise: 1 });
    expect(ownIdForeignCat.error).not.toBeNull();
  });
  it("only allows hard delete of rows already in the trash", async () => {
    const early = await a.from("transactions").delete().eq("id", txId).select("id");
    expect(early.data ?? []).toEqual([]);
    await a.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", txId);
    const late = await a.from("transactions").delete().eq("id", txId).select("id");
    expect(late.data).toHaveLength(1);
  });
});
