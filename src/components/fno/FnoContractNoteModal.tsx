"use client";
import { useState, useRef, useMemo } from "react";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Lock,
  Eye,
  EyeOff,
  Check,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { createFnoTrade } from "@/lib/data/fno";
import { formatINR } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import {
  type ParsedContractNoteResult,
  type ParsedFnoTrade,
} from "@/lib/data/contractNoteParser";
import type { Account } from "@/types/db";

type Props = {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  onImported: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function FnoContractNoteModal({
  open,
  accounts,
  onClose,
  onImported,
  notify,
}: Props) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");

  // File & Password state
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [pastedText, setPastedText] = useState("");

  // Parsing & Review state
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedContractNoteResult | null>(null);
  const [trades, setTrades] = useState<ParsedFnoTrade[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [tradeDate, setTradeDate] = useState<string>(todayISO());

  // In-line editing trade in review table
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setStep("upload");
    setInputMode("file");
    setFile(null);
    setPassword("");
    setPasswordRequired(false);
    setPastedText("");
    setParsing(false);
    setImporting(false);
    setError(null);
    setParsedData(null);
    setTrades([]);
    setSelectedAccountId("");
    setTradeDate(todayISO());
    setEditingTradeId(null);
  }

  function handleModalClose() {
    resetState();
    onClose();
  }

  // Handle file drop & select
  function handleFileSelect(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setError(null);
    setPasswordRequired(false);
  }

  // Parse contract note via Next.js API route
  async function handleParse() {
    setError(null);
    if (inputMode === "file" && !file) {
      setError("Please select a contract note file (PDF, CSV, Excel, or TXT).");
      return;
    }
    if (inputMode === "paste" && !pastedText.trim()) {
      setError("Please paste your contract note or trade text.");
      return;
    }

    setParsing(true);
    try {
      const formData = new FormData();
      if (inputMode === "file" && file) {
        formData.append("file", file);
      } else {
        formData.append("text", pastedText);
      }
      if (password) {
        formData.append("password", password);
      }

      const res = await fetch("/api/fno/parse-contract-note", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error === "PASSWORD_REQUIRED") {
          setPasswordRequired(true);
          setError(
            json.message ||
              "This PDF is password-protected. Enter your PAN number (Groww & Zerodha use PAN in UPPERCASE or lowercase)."
          );
          setParsing(false);
          return;
        }
        throw new Error(json.message || "Failed to parse contract note.");
      }

      const result = json as ParsedContractNoteResult;
      if (!result.success || result.trades.length === 0) {
        throw new Error(
          result.warnings?.[0] ||
            "No F&O trade executions could be matched from this document. Please check the file."
        );
      }

      setParsedData(result);
      setTrades(result.trades);
      setTradeDate(result.tradeDate || todayISO());
      setStep("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error processing contract note.");
    } finally {
      setParsing(false);
      setPassword(""); // Immediately zero out PAN/password from component state
    }
  }

  // Toggle selection for individual trade
  function toggleTradeSelect(id: string) {
    setTrades((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  }

  // Toggle Select All
  const allSelected = useMemo(
    () => trades.length > 0 && trades.every((t) => t.selected),
    [trades]
  );
  function toggleSelectAll() {
    const next = !allSelected;
    setTrades((prev) => prev.map((t) => ({ ...t, selected: next })));
  }

  // Remove a trade from import list
  function removeTrade(id: string) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

  // Update a trade's values inline
  function updateTradeField(
    id: string,
    field: keyof ParsedFnoTrade,
    value: unknown
  ) {
    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, [field]: value };
        // If prices or qty changed, recompute Gross and Net P&L
        if (field === "buy_price" || field === "sell_price" || field === "quantity" || field === "charges") {
          const bp = parseFloat(String(updated.buy_price)) || 0;
          const sp = parseFloat(String(updated.sell_price)) || 0;
          const qty = parseInt(String(updated.quantity), 10) || 0;
          const ch = parseFloat(String(updated.charges)) || 0;
          const grossRupees = (sp - bp) * qty;
          const netRupees = grossRupees - ch;
          updated.gross_pnl_paise = Math.round(grossRupees * 100);
          updated.net_pnl_paise = Math.round(netRupees * 100);
          updated.charges_paise = Math.round(ch * 100);
          updated.buy_price_paise = Math.round(bp * 100);
          updated.sell_price_paise = Math.round(sp * 100);
        }
        return updated;
      })
    );
  }

  // Metrics for selected trades in review
  const selectedTrades = useMemo(() => trades.filter((t) => t.selected), [trades]);
  const reviewMetrics = useMemo(() => {
    let grossPnlPaise = 0;
    let chargesPaise = 0;
    let netPnlPaise = 0;

    for (const t of selectedTrades) {
      grossPnlPaise += t.gross_pnl_paise;
      chargesPaise += t.charges_paise;
      netPnlPaise += t.net_pnl_paise;
    }

    return {
      count: selectedTrades.length,
      grossPnlPaise,
      chargesPaise,
      netPnlPaise,
    };
  }, [selectedTrades]);

  // Execute bulk import
  async function handleImport() {
    if (selectedTrades.length === 0) {
      setError("Please select at least one trade to import.");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const db = createClient();
      let importedCount = 0;

      for (const t of selectedTrades) {
        await createFnoTrade(db, {
          segment: t.segment,
          symbol: t.symbol,
          instrument_type: t.instrument_type,
          strike_price: t.strike_price,
          expiry_date: t.expiry_date || undefined,
          trade_type: t.trade_type,
          lots: String(t.lots),
          lot_size: String(t.lot_size),
          quantity: String(t.quantity),
          buy_price: t.buy_price,
          sell_price: t.sell_price,
          charges: t.charges,
          occurred_on: tradeDate,
          account_id: selectedAccountId || undefined,
          note: t.note || `Imported from contract note (${tradeDate})`,
        });
        importedCount++;
      }

      notify(
        "success",
        `Successfully imported ${importedCount} F&O trade${
          importedCount > 1 ? "s" : ""
        } from contract note! P&L synced to Income.`
      );
      onImported();
      handleModalClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import trades into journal.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleModalClose}
      title={step === "upload" ? "Import F&O Contract Note" : "Review & Confirm Extracted Trades"}
      extraWide
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <p className="font-semibold">{error}</p>
              {passwordRequired && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  Tip: Indian brokers lock contract notes with your PAN number (e.g. ABCDE1234F). Try entering your PAN in capital letters below.
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: UPLOAD / PASTE */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Input Mode Selector */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInputMode("file")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  inputMode === "file"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Contract Note File
              </button>
              <button
                type="button"
                onClick={() => setInputMode("paste")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  inputMode === "paste"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Paste Tradebook Text
              </button>
            </div>

            {/* Mode A: File Upload */}
            {inputMode === "file" && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  accept=".pdf,.csv,.xlsx,.xls,.txt"
                  className="hidden"
                />

                {!file ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleFileSelect(e.dataTransfer.files?.[0] || null);
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center transition-all hover:border-brand-500 hover:bg-brand-50/20 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-brand-500/60 dark:hover:bg-brand-950/10"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                      <Upload className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Click to choose or drag & drop your contract note
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Supports PDF, CSV, Excel (.xlsx, .xls), or text contract notes
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Groww
                      </span>
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Zerodha
                      </span>
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Angel One
                      </span>
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Upstox
                      </span>
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Dhan
                      </span>
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        NSE / BSE / MCX
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                        {file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv") ? (
                          <FileSpreadsheet className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {(file.size / 1024).toFixed(1)} KB • Ready to extract
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      title="Remove file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Password field for PDF contract notes */}
                <div
                  className={`rounded-xl border p-3.5 transition-all ${
                    passwordRequired
                      ? "border-amber-400 bg-amber-50/50 dark:border-amber-600/50 dark:bg-amber-950/20"
                      : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <Lock className="h-3.5 w-3.5 text-slate-500" />
                      PDF Password (if protected)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Usually your PAN (CAPS / lowercase)
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. ABCDE1234F"
                      autoComplete="new-password"
                      spellCheck={false}
                      data-lpignore="true"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mode B: Direct Text Paste */}
            {inputMode === "paste" && (
              <div className="space-y-2">
                <label className="font-medium text-slate-700 dark:text-slate-300">
                  Paste contract note email text or trade rows:
                </label>
                <textarea
                  rows={8}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Paste text from your contract note or broker tradebook:\n\nExample:\nOPTIDX NIFTY 21NOV2026 CE 24500.00 B 65 110.50\nOPTIDX NIFTY 21NOV2026 CE 24500.00 S 65 155.00\nTotal Charges: 82.50`}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            {/* Zero-Storage Privacy Guarantee */}
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>100% In-Memory Parsing:</strong> Your contract note is parsed in-memory and immediately discarded. No files are stored on disk or in the database.
              </span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={handleModalClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleParse}
                disabled={parsing || (inputMode === "file" && !file) || (inputMode === "paste" && !pastedText.trim())}
                className="gap-2"
              >
                {parsing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {parsing ? "Parsing contract note..." : "Extract trades & preview"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & CONFIRM EXTRACTED TRADES */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Broker & Settings Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white">
                  {parsedData?.broker || "Contract Note"}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {trades.length} trade{trades.length > 1 ? "s" : ""} extracted
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Trade Date Picker */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Trade Date:
                  </label>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Account selector */}
                {accounts.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Link Account:
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">No account linked</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* Selected Count */}
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Trades Selected
                </p>
                <p className="num mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                  {reviewMetrics.count} of {trades.length}
                </p>
                <p className="text-[10px] text-slate-400">Will be saved to journal</p>
              </div>

              {/* Gross Realized P&L */}
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Gross P&L
                  </p>
                  {reviewMetrics.grossPnlPaise >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                  )}
                </div>
                <p
                  className={`num mt-0.5 text-lg font-bold ${
                    reviewMetrics.grossPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {reviewMetrics.grossPnlPaise >= 0
                    ? `+${formatINR(reviewMetrics.grossPnlPaise)}`
                    : formatINR(reviewMetrics.grossPnlPaise)}
                </p>
                <p className="text-[10px] text-slate-400">Before charges & taxes</p>
              </div>

              {/* Charges & Taxes */}
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Charges & Taxes
                  </p>
                  <Receipt className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="num mt-0.5 text-lg font-bold text-slate-700 dark:text-slate-300">
                  {formatINR(reviewMetrics.chargesPaise)}
                </p>
                <p className="text-[10px] text-slate-400">Brokerage, STT, GST</p>
              </div>

              {/* Net P&L (Reflected to Income) */}
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Net Realized P&L
                  </p>
                  <Activity className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                </div>
                <p
                  className={`num mt-0.5 text-lg font-bold ${
                    reviewMetrics.netPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {reviewMetrics.netPnlPaise >= 0
                    ? `+${formatINR(reviewMetrics.netPnlPaise)}`
                    : formatINR(reviewMetrics.netPnlPaise)}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  Syncs to Income automatically
                </p>
              </div>
            </div>

            {/* Trades Review Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 dark:bg-slate-800/80 dark:border-slate-700">
                    <tr>
                      <th className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                        />
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Contract / Instrument
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Lots (Qty)
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Buy Price
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Sell Price
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Gross P&L
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Charges
                      </th>
                      <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                        Net P&L
                      </th>
                      <th className="w-10 px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {trades.map((t) => {
                      const isEditing = editingTradeId === t.id;
                      return (
                        <tr
                          key={t.id}
                          className={`transition-colors ${
                            t.selected
                              ? "bg-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              : "bg-slate-50/40 opacity-50 dark:bg-slate-900/30"
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={t.selected}
                              onChange={() => toggleTradeSelect(t.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                            />
                          </td>

                          {/* Contract description */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  t.instrument_type === "call"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40"
                                    : t.instrument_type === "put"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40"
                                    : "bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/40 dark:text-brand-400 dark:border-brand-800/40"
                                }`}
                              >
                                {t.instrument_type === "call" ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : t.instrument_type === "put" ? (
                                  <ArrowDownRight className="h-3 w-3" />
                                ) : (
                                  <Activity className="h-3 w-3" />
                                )}
                                {t.instrument_type === "call" ? "CE" : t.instrument_type === "put" ? "PE" : "FUT"}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {t.symbol} {t.strike_price ? `${t.strike_price}` : ""}
                              </span>
                              {t.segment === "commodity" && (
                                <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                  MCX
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Lots / Quantity */}
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                            {isEditing ? (
                              <input
                                type="number"
                                value={t.quantity}
                                onChange={(e) => updateTradeField(t.id, "quantity", e.target.value)}
                                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            ) : (
                              <span>
                                {t.lots} Lot{t.lots > 1 ? "s" : ""} ({t.quantity})
                              </span>
                            )}
                          </td>

                          {/* Buy Price */}
                          <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                            {isEditing ? (
                              <input
                                type="text"
                                value={t.buy_price}
                                onChange={(e) => updateTradeField(t.id, "buy_price", e.target.value)}
                                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            ) : (
                              `₹${t.buy_price}`
                            )}
                          </td>

                          {/* Sell Price */}
                          <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                            {isEditing ? (
                              <input
                                type="text"
                                value={t.sell_price}
                                onChange={(e) => updateTradeField(t.id, "sell_price", e.target.value)}
                                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            ) : (
                              `₹${t.sell_price}`
                            )}
                          </td>

                          {/* Gross P&L */}
                          <td
                            className={`num px-3 py-2.5 font-bold ${
                              t.gross_pnl_paise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {t.gross_pnl_paise >= 0
                              ? `+${formatINR(t.gross_pnl_paise)}`
                              : formatINR(t.gross_pnl_paise)}
                          </td>

                          {/* Charges */}
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                            {isEditing ? (
                              <input
                                type="text"
                                value={t.charges}
                                onChange={(e) => updateTradeField(t.id, "charges", e.target.value)}
                                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            ) : (
                              `₹${t.charges}`
                            )}
                          </td>

                          {/* Net P&L */}
                          <td
                            className={`num px-3 py-2.5 font-bold ${
                              t.net_pnl_paise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {t.net_pnl_paise >= 0
                              ? `+${formatINR(t.net_pnl_paise)}`
                              : formatINR(t.net_pnl_paise)}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingTradeId(isEditing ? null : t.id)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                title={isEditing ? "Save edit" : "Edit values"}
                              >
                                {isEditing ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTrade(t.id)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                title="Remove trade"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("upload")}
                disabled={importing}
              >
                ← Back to Upload
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={handleModalClose} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || selectedTrades.length === 0}
                  className="gap-2 font-bold"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importing
                    ? `Importing ${selectedTrades.length} trades...`
                    : `Import ${selectedTrades.length} Trades (${
                        reviewMetrics.netPnlPaise >= 0
                          ? `+${formatINR(reviewMetrics.netPnlPaise)}`
                          : formatINR(reviewMetrics.netPnlPaise)
                      })`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
