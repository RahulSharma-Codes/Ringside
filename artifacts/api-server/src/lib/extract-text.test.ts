/**
 * Unit tests for extractText — the server-side text extraction utility that
 * populates extracted_text / extraction_status on deal_documents rows.
 *
 * All tests are pure: they exercise the extractText function directly without
 * any DB, network, or file-system interaction.
 */

import { describe, it, expect } from "vitest";
import { extractText } from "./extract-text";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ── Unsupported MIME types ────────────────────────────────────────────────────

describe("extractText — unsupported MIME type", () => {
  it("returns status=unsupported for image/png", async () => {
    const result = await extractText(Buffer.from("fake"), "image/png");
    expect(result.status).toBe("unsupported");
    expect(result.text).toBeNull();
  });

  it("returns status=unsupported for text/plain", async () => {
    const result = await extractText(Buffer.from("hello"), "text/plain");
    expect(result.status).toBe("unsupported");
    expect(result.text).toBeNull();
  });

  it("returns status=unsupported for application/octet-stream", async () => {
    const result = await extractText(Buffer.alloc(16), "application/octet-stream");
    expect(result.status).toBe("unsupported");
    expect(result.text).toBeNull();
  });
});

// ── Corrupt / invalid file buffers ───────────────────────────────────────────

describe("extractText — corrupt files return status=failed", () => {
  it("returns status=failed for a PDF MIME but garbage bytes", async () => {
    const result = await extractText(Buffer.from("not a pdf at all"), PDF_MIME);
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
  });

  it("returns status=failed for a DOCX MIME but garbage bytes", async () => {
    const result = await extractText(Buffer.from("not a docx"), DOCX_MIME);
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
  });

  // Note: xlsx is intentionally lenient and silently returns an empty workbook for
  // most unrecognised inputs rather than throwing. Only truly unreadable streams
  // (e.g. malformed zip) cause it to throw, so a "failed" status is not guaranteed
  // for every garbage input. The DOCX and PDF parsers are stricter.
});

// ── Truncation ────────────────────────────────────────────────────────────────

describe("extractText — truncation at 80 000 chars", () => {
  it("returns status=truncated and appends [TRUNCATED] when text exceeds limit", async () => {
    // Build a valid XLSX with many rows to exceed 80 000 chars.
    // xlsx caps individual cell text at 32 767 chars, so use many rows of 1 000-char strings.
    const xlsx = await import("xlsx");
    const rows = Array.from({ length: 100 }, (_, i) => [`Row${i}:` + "X".repeat(994)]);
    const ws = xlsx.utils.aoa_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await extractText(buf, XLSX_MIME);
    expect(result.status).toBe("truncated");
    expect(result.text).not.toBeNull();
    expect(result.text!.endsWith("\n[TRUNCATED]")).toBe(true);
    // Extracted text (before marker) must not exceed 80 000 chars
    const textWithoutMarker = result.text!.slice(0, -"\n[TRUNCATED]".length);
    expect(textWithoutMarker.length).toBeLessThanOrEqual(80_000);
  });
});

// ── Valid XLSX extraction ─────────────────────────────────────────────────────

describe("extractText — valid XLSX", () => {
  it("extracts sheet values from a real in-memory workbook", async () => {
    const xlsx = await import("xlsx");
    const ws = xlsx.utils.aoa_to_sheet([
      ["Revenue", "2024", "1000"],
      ["Costs", "2024", "600"],
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Financials");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await extractText(buf, XLSX_MIME);
    expect(result.status).toBe("done");
    expect(result.text).not.toBeNull();
    expect(result.text).toContain("Revenue");
    expect(result.text).toContain("1000");
    expect(result.text).toContain("Financials"); // sheet header
  });

  it("returns status=done and non-null text", async () => {
    const xlsx = await import("xlsx");
    const ws = xlsx.utils.aoa_to_sheet([["Hello", "World"]]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Data");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await extractText(buf, XLSX_MIME);
    expect(result.status).toBe("done");
    expect(result.text).toContain("Hello");
  });
});
