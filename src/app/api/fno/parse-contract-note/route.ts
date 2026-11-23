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
 * Extract text from a PDF buffer using pdf-parse v1.1.1.
 * This version uses pdfjs-dist v2 which has zero browser DOM dependencies
 * and is fully compatible with Vercel serverless Node.js functions.
 */
async function extractPdfText(
  buffer: Buffer,
  password?: string
): Promise<string> {
  // Dynamic import avoids any SSR/Edge issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");

  const options: Record<string, unknown> = {};
  if (password) {
    options.password = password;
  }

  const data = await pdfParse(buffer, options);
  return data.text as string;
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

    // 3. Process PDF files in-memory using pdf-parse v1 (Node.js native, no DOM deps)
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let extractedText: string;
        try {
          extractedText = await extractPdfText(buffer, password || undefined);
        } catch (pdfErr: unknown) {
          const errMsg = String(
            (pdfErr as Error)?.message ?? pdfErr
          ).toLowerCase();
          // Detect password-protected PDFs
          if (
            errMsg.includes("password") ||
            errMsg.includes("encrypted") ||
            errMsg.includes("no password given") ||
            errMsg.includes("incorrect password")
          ) {
            const isWrong =
              errMsg.includes("incorrect") || errMsg.includes("wrong");
            return NextResponse.json(
              {
                error: "PASSWORD_REQUIRED",
                message: isWrong
                  ? "Incorrect password. Please try your PAN number in UPPERCASE or lowercase."
                  : "This contract note PDF is password-protected. Please enter your password (typically your PAN number in UPPERCASE or lowercase).",
              },
              { status: 422 }
            );
          }
          throw pdfErr;
        }

        if (!extractedText || !extractedText.trim()) {
          return NextResponse.json(
            {
              error: "EMPTY_PDF",
              message:
                "Could not extract text from this PDF. It may be a scanned image or empty.",
            },
            { status: 422 }
          );
        }

        const result = parseContractNoteText(extractedText);
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
