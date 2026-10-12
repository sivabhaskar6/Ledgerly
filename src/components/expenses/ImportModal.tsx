"use client";
import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import {
  parseFileHeadersAndRows,
  autoDetectMapping,
  evaluateAndDeduplicateRows,
  commitImportBatch,
  type ColumnMapping,
  type ParsedRow,
} from "@/lib/data/imports";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import type { Account, Category } from "@/types/db";

type Props = {
  open: boolean;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onImported: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

type Step = "upload" | "map" | "preview" | "done";

export function ImportModal({ open, categories, accounts, onClose, onImported, notify }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ dateCol: "", titleCol: "", amountCol: "" });
  const [defaultCategory, setDefaultCategory] = useState<string>("");
  const [defaultAccount, setDefaultAccount] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    importedCount: number;
    duplicateCount: number;
    skippedCount: number;
    invalidCount: number;
  } | null>(null);

  function resetState() {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({ dateCol: "", titleCol: "", amountCol: "" });
    setParsedRows([]);
    setError(null);
    setImportSummary(null);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setLoading(true);

    try {
      const { headers: hdrs, rows } = await parseFileHeadersAndRows(f);
      if (hdrs.length === 0 || rows.length === 0) {
        throw new Error("No data found in this file.");
      }
      setHeaders(hdrs);
      setRawRows(rows);

      // Auto-detect mappings
      const detected = autoDetectMapping(hdrs);
      setMapping(detected);

      // Default category fallback
      if (!defaultCategory && categories.length > 0) {
        setDefaultCategory(categories[0]!.id);
      }

      setStep("map");
    } catch (err) {
      setError(errorMessage(err, "Failed to parse file."));
    } finally {
      setLoading(false);
    }
  }

  async function handleProceedToPreview() {
    if (!mapping.dateCol || !mapping.titleCol || !mapping.amountCol) {
      setError("Please select the Date, Title/Description, and Amount columns.");
      return;
    }
    if (!defaultCategory) {
      setError("Please select a default category for the imported transactions.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const db = createClient();
      const evaluated = await evaluateAndDeduplicateRows(db, rawRows, mapping, defaultCategory);
      setParsedRows(evaluated);
      setStep("preview");
    } catch (err) {
      setError(errorMessage(err, "Failed to evaluate rows and check duplicates."));
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(idx: number) {
    setParsedRows((prev) =>
      prev.map((r) => (r.rowIndex === idx ? { ...r, selected: !r.selected } : r))
    );
  }

  function selectAllValid() {
    setParsedRows((prev) => prev.map((r) => ({ ...r, selected: r.isValid && !r.isDuplicate })));
  }

  function deselectAll() {
    setParsedRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  }

  async function handleCommitImport() {
    const toImport = parsedRows.filter((r) => r.selected && r.isValid);
    if (toImport.length === 0) {
      setError("No valid rows selected for import.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = createClient();
      const summary = await commitImportBatch(db, file?.name || "statement.csv", parsedRows, defaultAccount);
      setImportSummary(summary);
      setStep("done");
      notify("success", `Successfully imported ${summary.importedCount} transactions.`);
      onImported();
    } catch (err) {
      setError(errorMessage(err, "Failed to import transactions."));
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = parsedRows.filter((r) => r.selected && r.isValid).length;
  const duplicateCount = parsedRows.filter((r) => r.isDuplicate).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <Dialog
      open={open}
      onClose={() => { onClose(); resetState(); }}
      title={step === "done" ? "Import Complete" : "Import Statement (CSV / Excel)"}
      wide
    >
      <div className="space-y-4">
        <FormError message={error} />

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Upload bank or card statement</h3>
              <p className="mt-1 text-sm text-slate-500">
                Supports .csv and .xlsx files. Rows are previewed and deduplicated before saving.
              </p>
            </div>

            <div className="mt-4 flex justify-center">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                <Upload className="h-4 w-4" />
                {loading ? "Reading statement..." : "Select CSV or Excel file"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => void handleFileSelected(e)}
                  disabled={loading}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP 2: Map Columns */}
        {step === "map" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              File: <span className="font-semibold text-slate-800">{file?.name}</span> ({rawRows.length} rows detected)
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label="Date column *"
                value={mapping.dateCol}
                onChange={(e) => setMapping((m) => ({ ...m, dateCol: e.target.value }))}
              >
                <option value="">Select column</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectField>

              <SelectField
                label="Description / Title column *"
                value={mapping.titleCol}
                onChange={(e) => setMapping((m) => ({ ...m, titleCol: e.target.value }))}
              >
                <option value="">Select column</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectField>

              <SelectField
                label="Amount column *"
                value={mapping.amountCol}
                onChange={(e) => setMapping((m) => ({ ...m, amountCol: e.target.value }))}
              >
                <option value="">Select column</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectField>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Reference / UTR column (recommended)"
                value={mapping.refCol || ""}
                onChange={(e) => setMapping((m) => ({ ...m, refCol: e.target.value }))}
              >
                <option value="">Auto fingerprint only</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectField>

              <SelectField
                label="Note / Remarks column (optional)"
                value={mapping.noteCol || ""}
                onChange={(e) => setMapping((m) => ({ ...m, noteCol: e.target.value }))}
              >
                <option value="">None</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </SelectField>
            </div>

            <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
              <SelectField
                label="Default Category *"
                value={defaultCategory}
                onChange={(e) => setDefaultCategory(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>

              <SelectField
                label="Link to Account (optional)"
                value={defaultAccount}
                onChange={(e) => setDefaultAccount(e.target.value)}
              >
                <option value="">No account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </SelectField>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button loading={loading} onClick={() => void handleProceedToPreview()}>
                Preview & Deduplicate <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview & Deduplicate */}
        {step === "preview" && (
          <div className="space-y-3">
            {/* Counts summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
              <div className="flex gap-4">
                <span>Total: <strong>{parsedRows.length}</strong></span>
                <span className="text-emerald-700">Selected to import: <strong>{selectedCount}</strong></span>
                {duplicateCount > 0 && <span className="text-amber-700">Duplicates: <strong>{duplicateCount}</strong></span>}
                {invalidCount > 0 && <span className="text-red-700">Invalid: <strong>{invalidCount}</strong></span>}
              </div>
              <div className="flex gap-2">
                <button onClick={selectAllValid} className="font-medium text-brand-700 hover:underline">Select valid</button>
                <span>·</span>
                <button onClick={deselectAll} className="font-medium text-slate-600 hover:underline">Deselect all</button>
              </div>
            </div>

            {/* Table */}
            <div className="max-h-72 overflow-y-auto rounded border border-slate-200 text-xs">
              <table className="w-full text-left">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center">Import</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {parsedRows.map((r) => (
                    <tr key={r.rowIndex} className={`hover:bg-slate-50 ${r.isDuplicate ? "bg-amber-50/40" : !r.isValid ? "bg-red-50/40 opacity-70" : ""}`}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          disabled={!r.isValid}
                          onChange={() => toggleRow(r.rowIndex)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-slate-600">{r.date ?? "Invalid"}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-slate-900" title={r.title}>{r.title}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">{formatINR(r.amount_paise)}</td>
                      <td className="px-3 py-2">
                        {r.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> {r.duplicateReason}
                          </span>
                        ) : !r.isValid ? (
                          <span className="text-red-600">{r.validationError}</span>
                        ) : (
                          <span className="text-emerald-600">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setStep("map")}>
                <ArrowLeft className="h-4 w-4" /> Change mapping
              </Button>
              <Button loading={loading} disabled={selectedCount === 0} onClick={() => void handleCommitImport()}>
                Import {selectedCount} transactions
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Done */}
        {step === "done" && importSummary && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Import Finished</h3>
              <p className="mt-1 text-sm text-slate-500">
                Your transactions have been successfully recorded in Supabase.
              </p>
            </div>

            <div className="mx-auto grid max-w-sm grid-cols-2 gap-3 text-left">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Imported</p>
                <p className="num text-xl font-bold text-emerald-600">{importSummary.importedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Duplicates Skipped</p>
                <p className="num text-xl font-bold text-amber-600">{importSummary.duplicateCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Unselected</p>
                <p className="num text-xl font-bold text-slate-600">{importSummary.skippedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Invalid Rows</p>
                <p className="num text-xl font-bold text-slate-400">{importSummary.invalidCount}</p>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => { onClose(); resetState(); }}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
