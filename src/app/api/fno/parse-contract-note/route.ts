import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  parseContractNoteText,
  parseContractNoteRows,
} from "@/lib/data/contractNoteParser";

export const runtime = "nodejs";

/**
 * Extract text from a PDF buffer using the pdfjs v2.0.550 bundled inside
 * pdf-parse v1.1.1. This version has zero browser DOM dependencies and
 * is fully compatible with Vercel serverless Node.js functions.
 *
 * We call pdfjs directly (instead of going through pdf-parse's wrapper)
 * so we can correctly pass the password option, which pdf-parse ignores.
 */
async function extractPdfText(
  buffer: Buffer,
  password?: string
): Promise<{ text: string; needsPassword: boolean; wrongPassword: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFJS = require("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js") as {
    getDocument: (src: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: (opts?: Record<string, unknown>) => Promise<{
            items: Array<{ str: string; transform: number[] }>;
          }>;
          cleanup: () => void;
        }>;
        destroy: () => void;
      }>;
      onPassword: (
        cb: (pw: string) => void,
        reason: number
      ) => void;
    };
    disableWorker: boolean;
  };

  PDFJS.disableWorker = true;

  let needsPassword = false;
  let wrongPassword = false;

  const loadingTask = PDFJS.getDocument({
    data: new Uint8Array(buffer),
    ...(password ? { password } : {}),
  });

  // Wire up the password callback BEFORE awaiting the promise
  loadingTask.onPassword = (_updateCb: (pw: string) => void, reason: number) => {
    // reason 1 = password needed, reason 2 = wrong password
    if (reason === 2) {
      wrongPassword = true;
    } else {
      needsPassword = true;
    }
    // Not calling updateCb causes the promise to reject with PasswordException
  };

  try {
    const doc = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      let lastY: number | undefined;
      let pageText = "";
      for (const item of content.items) {
        if (lastY === item.transform[5] || lastY === undefined) {
          pageText += item.str;
        } else {
          pageText += "\n" + item.str;
        }
        lastY = item.transform[5];
      }

      pages.push(pageText);
      page.cleanup();
    }

    doc.destroy();
    return { text: pages.join("\n\n"), needsPassword: false, wrongPassword: false };
  } catch (err: unknown) {
    // If the onPassword callback fired, return those flags
    if (needsPassword || wrongPassword) {
      return { text: "", needsPassword, wrongPassword };
    }

    // Also check error message/name as fallback
    const msg = String((err as Error)?.message ?? (err as Error)?.name ?? err).toLowerCase();
    if (msg.includes("password") || msg.includes("encrypt")) {
      return { text: "", needsPassword: true, wrongPassword: false };
    }

    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (list) => {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;
    const password = (formData.get("password") as string | null)?.trim() || "";

    // If direct text provided
    if (text && text.trim().length > 0) {
      const result = parseContractNoteText(text);
      return NextResponse.json(result);
    }

    if (!file) {
      return NextResponse.json(
        {
          error: "NO_FILE_PROVIDED",
          message: "Please select a contract note file or paste trade text.",
        },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();

    // 3. Process PDF files in-memory
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // --- First attempt: try with the provided password (or no password) ---
        let attempt = await extractPdfText(buffer, password || undefined);

        // --- If password needed and not yet provided, tell the UI ---
        if (attempt.needsPassword && !password) {
          return NextResponse.json(
            {
              error: "PASSWORD_REQUIRED",
              message:
                "This contract note PDF is password-protected. Please enter your password (typically your PAN number in UPPERCASE or lowercase).",
            },
            { status: 422 }
          );
        }

        // --- If wrong password was explicitly flagged ---
        if (attempt.wrongPassword) {
          return NextResponse.json(
            {
              error: "PASSWORD_REQUIRED",
              message:
                "Incorrect password. Please check your PAN number (try UPPERCASE, e.g. ABCDE1234F).",
            },
            { status: 422 }
          );
        }

        // --- Password was provided but pdfjs still fired needsPassword ---
        // This can happen with some PDFs where the password variant matters.
        // Try common transformations: UPPERCASE, lowercase, then without password
        if (attempt.needsPassword && password) {
          const variants = [
            password.toUpperCase(),
            password.toLowerCase(),
            password.toUpperCase().trim(),
            password.toLowerCase().trim(),
          ].filter((v) => v !== password);

          for (const variant of variants) {
            attempt = await extractPdfText(buffer, variant);
            if (!attempt.needsPassword && !attempt.wrongPassword) break;
          }

          // If still failing after all variants
          if (attempt.needsPassword || attempt.wrongPassword) {
            return NextResponse.json(
              {
                error: "PASSWORD_REQUIRED",
                message:
                  "Password incorrect. For Groww contract notes, the password is your PAN number in UPPERCASE (e.g. ABCDE1234F).",
              },
              { status: 422 }
            );
          }
        }

        if (!attempt.text || !attempt.text.trim()) {
          return NextResponse.json(
            {
              error: "EMPTY_PDF",
              message:
                "Could not extract text from this PDF. It may be a scanned image or empty.",
            },
            { status: 422 }
          );
        }

        const result = parseContractNoteText(attempt.text);
        return NextResponse.json(result);
      } catch (err: unknown) {
        return NextResponse.json(
          {
            error: "PDF_PARSE_FAILED",
            message: `Failed to read PDF: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // 4. Process Excel (.xlsx, .xls) files in-memory
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return NextResponse.json(
          {
            error: "EMPTY_EXCEL",
            message: "The uploaded Excel spreadsheet contains no sheets.",
          },
          { status: 422 }
        );
      }
      const sheet = workbook.Sheets[sheetName]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        return NextResponse.json(
          {
            error: "EMPTY_SHEET",
            message: "The uploaded Excel sheet contains no rows.",
          },
          { status: 422 }
        );
      }

      const result = parseContractNoteRows(rows);
      return NextResponse.json(result);
    }

    // 5. Process CSV / TXT files in-memory
    const rawText = await file.text();
    if (fileName.endsWith(".csv")) {
      const parsedCsv = Papa.parse<Record<string, unknown>>(rawText, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsedCsv.data && parsedCsv.data.length > 0) {
        const rowsResult = parseContractNoteRows(parsedCsv.data);
        if (rowsResult.trades.length > 0) {
          return NextResponse.json(rowsResult);
        }
      }
    }

    // Default: treat as text contract note
    const result = parseContractNoteText(rawText);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message:
          e instanceof Error
            ? e.message
            : "Internal error processing contract note.",
      },
      { status: 500 }
    );
  }
}
