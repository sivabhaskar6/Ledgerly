import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapitalEntry } from "@/types/db";
import { toCapitalRow, type CapitalFormValues } from "@/lib/validations/capital";

async function currentUserId(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export type CapitalEntryWithDelta = CapitalEntry & {
  deltaPaise: number | null;
  deltaPct: number | null;
};

export type CapitalSummary = {
  entries: CapitalEntryWithDelta[];
  currentCapitalPaise: number | null;
  allTimeHighPaise: number | null;
  allTimeLowPaise: number | null;
  latestDeltaPaise: number | null;
  latestDeltaPct: number | null;
  tableMissing?: boolean;
};

export async function fetchCapitalEntries(db: SupabaseClient): Promise<CapitalSummary> {
  let raw: CapitalEntry[] = [];
  let tableMissing = false;

  try {
    const { data, error } = await db
      .from("capital")
      .select("*")
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      if (/schema cache/i.test(error.message)) {
        tableMissing = true;
      } else {
        throw error;
      }
    } else if (data) {
      raw = data as CapitalEntry[];
    }
  } catch (err) {
    if (err instanceof Error && /schema cache/i.test(err.message)) {
      tableMissing = true;
    } else {
      throw err;
    }
  }

  if (raw.length === 0) {
    return {
      entries: [],
      currentCapitalPaise: null,
      allTimeHighPaise: null,
      allTimeLowPaise: null,
      latestDeltaPaise: null,
      latestDeltaPct: null,
      tableMissing,
    };
  }

  // Calculate delta with previous chronological entry
  const enriched: CapitalEntryWithDelta[] = [];
  let ath = raw[0]!.amount_paise;
  let atl = raw[0]!.amount_paise;

  for (let i = 0; i < raw.length; i++) {
    const curr = raw[i]!;
    if (curr.amount_paise > ath) ath = curr.amount_paise;
    if (curr.amount_paise < atl) atl = curr.amount_paise;

    let deltaPaise: number | null = null;
    let deltaPct: number | null = null;

    if (i > 0) {
      const prev = raw[i - 1]!;
      deltaPaise = curr.amount_paise - prev.amount_paise;
      if (prev.amount_paise > 0) {
        deltaPct = Math.round((deltaPaise / prev.amount_paise) * 1000) / 10;
      }
    }

    enriched.push({
      ...curr,
      deltaPaise,
      deltaPct,
    });
  }

  // Most recent entry is the last in chronological order
  const latest = enriched[enriched.length - 1]!;

  // Return entries sorted in reverse-chronological order (most recent first) for UI display
  return {
    entries: [...enriched].reverse(),
    currentCapitalPaise: latest.amount_paise,
    allTimeHighPaise: ath,
    allTimeLowPaise: atl,
    latestDeltaPaise: latest.deltaPaise,
    latestDeltaPct: latest.deltaPct,
    tableMissing,
  };
}

export async function createCapitalEntry(
  db: SupabaseClient,
  v: CapitalFormValues,
  baselinePaise?: number | null
) {
  const user_id = await currentUserId(db);
  const row = { ...toCapitalRow(v, baselinePaise), user_id };
  const { error } = await db.from("capital").insert(row);
  if (error) throw error;
}

export async function updateCapitalEntry(
  db: SupabaseClient,
  id: string,
  v: CapitalFormValues,
  baselinePaise?: number | null
) {
  const row = toCapitalRow(v, baselinePaise);
  const { data, error } = await db
    .from("capital")
    .update(row)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Capital entry not found.");
}

export async function deleteCapitalEntry(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("capital").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Capital entry not found.");
}
