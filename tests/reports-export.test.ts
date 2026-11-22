import { describe, it, expect } from "vitest";
import {
  formatINRNumber,
  normalizeExportOptions,
  buildReportCSV,
  buildReportExcelWorkbook,
  buildReportPDFDoc,
  exportReportToCSV,
  exportReportToExcel,
  exportReportToPDF,
  type FullReport,
} from "@/lib/data/reports";
import * as XLSX from "xlsx";

describe("Financial Reports Export System", () => {
  const sampleReport: FullReport = {
    totalExpensePaise: 883535,
    totalIncomePaise: 59511,
    netSavingsPaise: -824024,
    savingsRatePct: -1385,
    transactionCount: 3,
    expenseCount: 2,
    incomeCount: 1,
    categoryRows: [
      { categoryName: "Entertainment", amountPaise: 226500, percentage: 25.6, count: 1 },
      { categoryName: "Food", amountPaise: 657035, percentage: 74.4, count: 1 },
    ],
    accountRows: [
      { accountName: "HDFC Bank", amountPaise: 883535, count: 2 },
    ],
    methodRows: [
      { method: "UPI", amountPaise: 883535, count: 2 },
    ],
    transactions: [
      {
        date: "2026-11-19",
        type: "expense",
        category: "Food",
        title: "Team lunch",
        note: "Celebration",
        account: "HDFC Bank",
        method: "UPI",
        amountPaise: 657035,
      },
      {
        date: "2026-11-18",
        type: "expense",
        category: "Entertainment",
        title: "Movie tickets",
        note: "IMAX",
        account: "HDFC Bank",
        method: "UPI",
        amountPaise: 226500,
      },
      {
        date: "2026-11-18",
        type: "income",
        category: "F&O Trading",
        title: "F&O Profit: NIFTY 25300 CE",
        note: "Realized F&O profit",
        account: "Groww",
        method: "DIRECT",
        amountPaise: 59511,
      },
    ],
  };

  it("correctly formats Indian currency numbers with comma grouping", () => {
    expect(formatINRNumber(0)).toBe("0.00");
    expect(formatINRNumber(883535)).toBe("8,835.35");
    expect(formatINRNumber(-824024)).toBe("-8,240.24");
    expect(formatINRNumber(4935012)).toBe("49,350.12");
    expect(formatINRNumber(10000000)).toBe("1,00,000.00");
    expect(formatINRNumber(125000000)).toBe("12,50,000.00");
  });

  it("normalizes export options with default fallbacks and custom parameters", () => {
    const defaultOpt = normalizeExportOptions(undefined, "xlsx");
    expect(defaultOpt.dateRangeLabel).toBe("Selected Period");
    expect(defaultOpt.categoryLabel).toBe("All Categories");
    expect(defaultOpt.accountLabel).toBe("All Accounts");
    expect(defaultOpt.filename).toBe("ledgerly_financial_report.xlsx");

    const stringOpt = normalizeExportOptions("my_report", "csv");
    expect(stringOpt.filename).toBe("my_report.csv");

    const customOpt = normalizeExportOptions({
      dateRangeLabel: "November 2026",
      categoryLabel: "Food",
      accountLabel: "HDFC Bank",
      filename: "custom_statement",
    }, "pdf");
    expect(customOpt.dateRangeLabel).toBe("November 2026");
    expect(customOpt.categoryLabel).toBe("Food");
    expect(customOpt.accountLabel).toBe("HDFC Bank");
    expect(customOpt.filename).toBe("custom_statement.pdf");
  });

  it("builds a multi-sheet Excel workbook with all expected sheets and structured data", () => {
    const { workbook, filename } = buildReportExcelWorkbook(sampleReport, {
      dateRangeLabel: "November 2026",
      categoryLabel: "All Categories",
      accountLabel: "All Accounts",
      filename: "test_report.xlsx",
    });

    expect(filename).toBe("test_report.xlsx");
    expect(workbook.SheetNames).toEqual([
      "Full Financial Report",
      "All Transactions",
      "Category Breakdown",
      "Account Distribution",
    ]);

    // Check Full Financial Report contains all sections
    const fullReportSheet = workbook.Sheets["Full Financial Report"]!;
    const fullReportData = XLSX.utils.sheet_to_json(fullReportSheet, { header: 1 }) as (string | number)[][];
    expect(fullReportData[0]?.[0]).toBe("LEDGERLY FINANCIAL REPORT & AUDIT STATEMENT");
    expect(fullReportData[1]?.[1]).toBe("November 2026");

    // Check All Transactions sheet
    const txSheet = workbook.Sheets["All Transactions"]!;
    const txData = XLSX.utils.sheet_to_json(txSheet, { header: 1 }) as (string | number)[][];
    expect(txData[3]).toEqual([
      "Date",
      "Flow Type",
      "Category / Source",
      "Title",
      "Description / Note",
      "Account",
      "Payment Method",
      "Net Amount (INR)",
      "Cash Flow Impact",
    ]);
    expect(txData.length).toBeGreaterThanOrEqual(7);

    // Ensure exportReportToExcel returns the workbook safely
    const exportedWb = exportReportToExcel(sampleReport, "test_report.xlsx");
    expect(exportedWb.SheetNames).toContain("Full Financial Report");
  });

  it("builds a CSV file with complete metadata header and transaction rows", () => {
    const { filename, content } = buildReportCSV(sampleReport, {
      dateRangeLabel: "November 2026",
      filename: "test_report.csv",
    });

    expect(filename).toBe("test_report.csv");
    expect(content).toContain("LEDGERLY FINANCIAL REPORT & AUDIT STATEMENT");
    expect(content).toContain("November 2026");
    expect(content).toContain("=== EXECUTIVE FINANCIAL SUMMARY ===");
    expect(content).toContain("=== CATEGORY BREAKDOWN (EXPENSES) ===");
    expect(content).toContain("=== COMPLETE IN-SCOPE TRANSACTIONS LEDGER ===");
    expect(content).toContain("Team lunch");
    expect(content).toContain("Movie tickets");
    expect(content).toContain("F&O Profit: NIFTY 25300 CE");

    // Test exportReportToCSV returns content
    const res = exportReportToCSV(sampleReport, {
      dateRangeLabel: "November 2026",
      filename: "test_report.csv",
    });
    expect(res).toBe(content);
  });

  it("builds a complete PDF report document without errors", () => {
    const { filename, doc } = buildReportPDFDoc(sampleReport, {
      dateRangeLabel: "November 2026",
      categoryLabel: "All Categories",
      accountLabel: "All Accounts",
      filename: "test_report.pdf",
    });

    expect(filename).toBe("test_report.pdf");
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    // Verify PDF output bytes can be generated cleanly
    const pdfData = doc.output();
    expect(pdfData.length).toBeGreaterThan(1000);

    // Ensure exportReportToPDF returns doc safely
    const exportedDoc = exportReportToPDF(sampleReport, "test_report.pdf");
    expect(exportedDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
