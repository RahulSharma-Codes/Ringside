/**
 * extract-text.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Server-side text extraction from uploaded documents.
 *
 * Supported MIME types (matching the vault allowlist):
 *   • application/pdf                                                              → pdf-parse
 *   • application/vnd.openxmlformats-officedocument.wordprocessingml.document     → mammoth
 *   • application/vnd.openxmlformats-officedocument.spreadsheetml.sheet           → xlsx
 *
 * Extraction status values returned:
 *   'done'        – extraction succeeded, full text returned
 *   'truncated'   – text exceeded MAX_CHARS; truncated with marker
 *   'unsupported' – MIME type not handled
 *   'failed'      – extraction threw an error (caller should log & continue)
 */

import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as xlsx from "xlsx";

const MAX_CHARS = 80_000;
const TRUNCATION_MARKER = "\n[TRUNCATED]";

export type ExtractionStatus = "done" | "truncated" | "failed" | "unsupported";

export interface ExtractionResult {
  text: string | null;
  status: ExtractionStatus;
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  try {
    let raw: string;

    if (mimeType === "application/pdf") {
      const result = await pdfParse(buffer);
      raw = result.text ?? "";
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value ?? "";
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) parts.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
      raw = parts.join("\n\n");
    } else {
      return { text: null, status: "unsupported" };
    }

    if (raw.length > MAX_CHARS) {
      return {
        text: raw.slice(0, MAX_CHARS) + TRUNCATION_MARKER,
        status: "truncated",
      };
    }

    return { text: raw, status: "done" };
  } catch {
    return { text: null, status: "failed" };
  }
}
