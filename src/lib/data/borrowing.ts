import type { SupabaseClient } from "@supabase/supabase-js";
import type { BorrowRecord, BorrowRecordWithRefs } from "@/types/db";
import { rupeesToPaise } from "@/lib/utils/money";
import type { BorrowFormValues } from "@/lib/validations/borrowing";

async function currentUserId(db: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export async function fetchBorrowRecords(
  db: SupabaseClient
): Promise<{ records: BorrowRecordWithRefs[]; tableMissing?: boolean }> {
  try {
    const { data, error } = await db
      .from("borrow_records")
      .select("*, account:accounts(name)")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("borrow_records")
      ) {
        return { records: [], tableMissing: true };
      }
      throw error;
    }

    return { records: (data ?? []) as BorrowRecordWithRefs[] };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (
      err.code === "42P01" ||
      err.message?.includes("does not exist") ||
      err.message?.includes("borrow_records")
    ) {
      return { records: [], tableMissing: true };
    }
    throw e;
  }
}

export async function createBorrowRecord(
  db: SupabaseClient,
  v: BorrowFormValues
): Promise<BorrowRecord> {
  const userId = await currentUserId(db);
  const amountPaise = rupeesToPaise(v.amount);

  const payload = {
    user_id: userId,
    person_name: v.person_name.trim(),
    type: v.type,
    amount_paise: amountPaise,
    occurred_on: v.occurred_on,
    due_date: v.due_date?.trim() || null,
    status: v.status,
    settled_on: v.status === "settled" ? v.settled_on?.trim() || v.occurred_on : null,
    account_id: v.account_id?.trim() || null,
    note: v.note?.trim() || null,
  };

  const { data, error } = await db
    .from("borrow_records")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as BorrowRecord;
}

export async function updateBorrowRecord(
  db: SupabaseClient,
  id: string,
  v: BorrowFormValues
): Promise<BorrowRecord> {
  const amountPaise = rupeesToPaise(v.amount);

  const payload = {
    person_name: v.person_name.trim(),
    type: v.type,
    amount_paise: amountPaise,
    occurred_on: v.occurred_on,
    due_date: v.due_date?.trim() || null,
    status: v.status,
    settled_on: v.status === "settled" ? v.settled_on?.trim() || v.occurred_on : null,
    account_id: v.account_id?.trim() || null,
    note: v.note?.trim() || null,
  };

  const { data, error } = await db
    .from("borrow_records")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as BorrowRecord;
}

export async function settleBorrowRecord(
  db: SupabaseClient,
  id: string,
  settledOn: string
): Promise<void> {
  const { error } = await db
    .from("borrow_records")
    .update({
      status: "settled",
      settled_on: settledOn,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function unsettleBorrowRecord(
  db: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await db
    .from("borrow_records")
    .update({
      status: "pending",
      settled_on: null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteBorrowRecord(
  db: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await db
    .from("borrow_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function restoreBorrowRecord(
  db: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await db
    .from("borrow_records")
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) throw error;
}

export async function permanentlyDeleteBorrowRecord(
  db: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await db.from("borrow_records").delete().eq("id", id);
  if (error) throw error;
}
