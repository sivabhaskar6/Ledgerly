import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseISODate } from "@/lib/utils/dates";
import { rupeesToPaise } from "@/lib/utils/money";

export type ColumnMapping = {
  dateCol: string;
  titleCol: string;
  amountCol: string;
  refCol?: string;
  noteCol?: string;
};

export type ParsedRow = {
  rowIndex: number;
  raw: Record<string, unknown>;
  date: string | null;
  title: string;
  amount_paise: number;
  external_ref: string | null;
  fingerprint: string;
  note: string | null;
  isValid: boolean;
  validationError?: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  selected: boolean;
  categoryId?: string;
};

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateFingerprint(date: string, amountPaise: number, title: string): string {
  const normTitle = normalizeTitle(title).slice(0, 40);
  return `${date}_${amountPaise}_${normTitle}`;
}

/** Parses dates in multiple standard bank formats to YYYY-MM-DD */
export function parseFlexibleDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();

  // If already YYYY-MM-DD
  if (parseISODate(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    if (parseISODate(iso)) return iso;
  }

  // MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    if (parseISODate(iso)) return iso;
  }

  // Check JavaScript Date parse (e.g. "12 Oct 2026")
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    if (parseISODate(iso)) return iso;
  }

  return null;
}

export function parseFlexibleAmount(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  // Remove currency symbols, commas, DR/CR suffixes
  str = str.replace(/[₹$€£,]/g, "").replace(/\s*(dr|cr)\s*$/i, "").trim();
  // If amount is wrapped in parentheses e.g. (120.00) or negative
  const isNegative = str.startsWith("-") || (str.startsWith("(") && str.endsWith(")"));
  str = str.replace(/[()-]/g, "").trim();

  try {
    const paise = rupeesToPaise(str);
    return isNegative ? paise : paise;
  } catch {
    return null;
  }
}

export async function parseFileHeadersAndRows(file: File): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
}> {
  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  if (isExcel) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file contains no sheets.");
    const sheet = workbook.Sheets[sheetName]!;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (json.length === 0) throw new Error("Excel sheet is empty.");
    const headers = Object.keys(json[0] || {});
    return { headers, rows: json };
  } else {
    const text = await file.text();
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length && results.data.length === 0) {
            reject(new Error(results.errors[0]?.message || "Could not parse CSV."));
          } else {
            const headers = results.meta.fields || [];
            resolve({ headers, rows: results.data });
          }
        },
        error: (err: Error) => reject(err),
      });
    });
  }
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const findMatch = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(h.trim().toLowerCase()))) || "";

  return {
    dateCol: findMatch([/^date$/i, /txn.*date/i, /value.*date/i, /trans.*date/i, /date/i]),
    titleCol: findMatch([/desc/i, /particulars/i, /narration/i, /title/i, /details/i, /remark/i]),
    amountCol: findMatch([/^amount$/i, /withdrawal/i, /debit/i, /spend/i, /dr.*amount/i, /amount/i]),
    refCol: findMatch([/ref/i, /utr/i, /chq/i, /cheque/i, /trans.*id/i, /txn.*id/i]),
    noteCol: findMatch([/note/i, /remark/i, /memo/i]),
  };
}

export async function evaluateAndDeduplicateRows(
  db: SupabaseClient,
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
  defaultCategoryId: string
): Promise<ParsedRow[]> {
  // Fetch existing non-deleted transactions to check for duplicates
  const { data: existingTxs, error } = await db
    .from("transactions")
    .select("external_ref, fingerprint")
    .is("deleted_at", null);
  if (error) throw error;

  const existingRefs = new Set<string>();
  const existingFingerprints = new Set<string>();

  for (const t of existingTxs ?? []) {
    if (t.external_ref) existingRefs.add(t.external_ref.toLowerCase().trim());
    if (t.fingerprint) existingFingerprints.add(t.fingerprint);
  }

  const seenInBatchRefs = new Set<string>();
  const seenInBatchFingerprints = new Set<string>();

  const results: ParsedRow[] = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx]!;
    const rawDate = raw[mapping.dateCol];
    const rawTitle = raw[mapping.titleCol];
    const rawAmount = raw[mapping.amountCol];
    const rawRef = mapping.refCol ? raw[mapping.refCol] : null;
    const rawNote = mapping.noteCol ? raw[mapping.noteCol] : null;

    const parsedDate = parseFlexibleDate(rawDate);
    const parsedAmount = parseFlexibleAmount(rawAmount);
    const title = String(rawTitle ?? "").trim();
    const externalRef = rawRef ? String(rawRef).trim() : null;
    const note = rawNote ? String(rawNote).trim() : null;

    let isValid = true;
    let validationError: string | undefined;

    if (!parsedDate) {
      isValid = false;
      validationError = "Invalid date format";
    } else if (!title) {
      isValid = false;
      validationError = "Missing title/description";
    } else if (parsedAmount === null || parsedAmount <= 0) {
      isValid = false;
      validationError = "Amount must be greater than 0";
    }

    const fingerprint = (parsedDate && parsedAmount && title)
      ? generateFingerprint(parsedDate, parsedAmount, title)
      : "";

    let isDuplicate = false;
    let duplicateReason: string | undefined;

    if (isValid) {
      if (externalRef && (existingRefs.has(externalRef.toLowerCase()) || seenInBatchRefs.has(externalRef.toLowerCase()))) {
        isDuplicate = true;
        duplicateReason = `Bank Ref (${externalRef}) already imported`;
      } else if (existingFingerprints.has(fingerprint) || seenInBatchFingerprints.has(fingerprint)) {
        isDuplicate = true;
        duplicateReason = "Probable duplicate (matching date, amount and title)";
      }

      if (externalRef) seenInBatchRefs.add(externalRef.toLowerCase());
      if (fingerprint) seenInBatchFingerprints.add(fingerprint);
    }

    results.push({
      rowIndex: idx,
      raw,
      date: parsedDate,
      title: title.slice(0, 120),
      amount_paise: parsedAmount ?? 0,
      external_ref: externalRef,
      fingerprint,
      note: note ? note.slice(0, 500) : null,
      isValid,
      validationError,
      isDuplicate,
      duplicateReason,
      selected: isValid && !isDuplicate,
      categoryId: defaultCategoryId,
    });
  }

  return results;
}

export async function commitImportBatch(
  db: SupabaseClient,
  filename: string,
  rows: ParsedRow[],
  accountId?: string
): Promise<{
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
}> {
  const { data: { user }, error: uerr } = await db.auth.getUser();
  if (uerr || !user) throw new Error("Your session has expired. Log in again.");

  const selectedRows = rows.filter((r) => r.selected && r.isValid);
  const duplicateCount = rows.filter((r) => r.isDuplicate).length;
  const invalidCount = rows.filter((r) => !r.isValid).length;
  const skippedCount = rows.filter((r) => !r.selected && r.isValid && !r.isDuplicate).length;

  // 1. Record import batch
  let batchId: string | null = null;
  try {
    const { data: batch, error: batchErr } = await db
      .from("import_batches")
      .insert({
        user_id: user.id,
        filename,
        imported_count: selectedRows.length,
        duplicate_count: duplicateCount,
        skipped_count: skippedCount,
      })
      .select("id")
      .single();
    if (!batchErr && batch) {
      batchId = batch.id;
    }
  } catch {
    // If import_batches table is not yet migrated, continue importing transactions
  }

  // 2. Insert transactions in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < selectedRows.length; i += CHUNK_SIZE) {
    const chunk = selectedRows.slice(i, i + CHUNK_SIZE);
    const toInsert = chunk.map((r) => ({
      user_id: user.id,
      category_id: r.categoryId,
      account_id: accountId || null,
      title: r.title,
      note: r.note,
      occurred_on: r.date!,
      amount_paise: r.amount_paise,
      external_ref: r.external_ref,
      fingerprint: r.fingerprint,
      import_batch_id: batchId,
    }));

    const { error: insErr } = await db.from("transactions").insert(toInsert);
    if (insErr) throw insErr;
  }

  return {
    importedCount: selectedRows.length,
    duplicateCount,
    skippedCount,
    invalidCount,
  };
}
