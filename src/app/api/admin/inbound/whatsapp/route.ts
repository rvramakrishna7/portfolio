import { NextRequest, NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import { parseInboundCandidates, processAndIngestInboundCandidates } from "../../../../../lib/inbound/parse";
import { getJobsRepository } from "../../../../../lib/jobs/repository";

export const dynamic = "force-dynamic";

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json",
};

const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_ZIP_ENTRIES = 50;
const MAX_MESSAGE_AGE_DAYS = 10;

/**
 * Strips phone numbers from text to prevent PII leakage.
 */
export function stripPhoneNumbers(text: string): string {
  // Matches international phone numbers, e.g. +91 98765 43210, +1 (555) 123-4567, 9876543210
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}\b/g;
  return text.replace(phoneRegex, "[REDACTED PHONE]");
}

/**
 * Parses date string in common WhatsApp formats:
 * dd/MM/yy or dd/MM/yyyy or MM/dd/yy
 */
export function parseWhatsAppDate(dateStr: string, timeStr: string): Date | null {
  try {
    const parts = dateStr.trim().split(/[/.-]/);
    if (parts.length !== 3) return null;

    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1; // 0-indexed
    let year = parseInt(parts[2], 10);

    if (year < 100) {
      year += 2000;
    }

    // Sanity check month vs day if day > 12
    if (month > 11 && day <= 12) {
      const tmp = day;
      day = month + 1;
      month = tmp - 1;
    }

    // Parse time
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    const isPm = /pm/i.test(timeStr);
    const isAm = /am/i.test(timeStr);
    const cleanTime = timeStr.replace(/[^\d:]/g, "");
    const timeParts = cleanTime.split(":");

    if (timeParts[0]) hours = parseInt(timeParts[0], 10);
    if (timeParts[1]) minutes = parseInt(timeParts[1], 10);
    if (timeParts[2]) seconds = parseInt(timeParts[2], 10);

    if (isPm && hours < 12) hours += 12;
    if (isAm && hours === 12) hours = 0;

    const parsedDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  } catch {
    return null;
  }
}

export interface ParsedWhatsAppMessage {
  text: string;
  date: Date | null;
}

/**
 * Parses a raw WhatsApp export text into sanitized message blocks.
 * Android: dd/MM/yy, hh:mm - Sender: message
 * iOS: [dd/MM/yy, hh:mm:ss] Sender: message
 * Sender names and phone numbers are completely stripped.
 */
export function parseWhatsAppExport(rawText: string, maxDays = MAX_MESSAGE_AGE_DAYS): {
  totalMessages: number;
  recentMessages: ParsedWhatsAppMessage[];
} {
  const lines = rawText.split(/\r?\n/);
  const messages: ParsedWhatsAppMessage[] = [];

  // Regex for Android format: "12/05/24, 14:30 - Sender: message"
  const androidRegex = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\s*-\s*([^:]+):\s*(.*)$/i;

  // Regex for iOS format: "[12/05/24, 14:30:15] Sender: message"
  const iosRegex = /^\[(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\]\s*([^:]+):\s*(.*)$/i;

  let currentMsg: { text: string; date: Date | null } | null = null;
  let totalCount = 0;

  for (const line of lines) {
    const androidMatch = line.match(androidRegex);
    const iosMatch = line.match(iosRegex);
    const match = androidMatch || iosMatch;

    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
        totalCount++;
      }

      const dateStr = match[1];
      const timeStr = match[2];
      // Note: match[3] is the sender name / phone number -- we intentionally drop it!
      const initialText = match[4];

      const date = parseWhatsAppDate(dateStr, timeStr);
      const sanitizedInitialText = stripPhoneNumbers(initialText);

      currentMsg = {
        text: sanitizedInitialText,
        date,
      };
    } else if (currentMsg) {
      // Continuation line of multi-line message
      currentMsg.text += "\n" + stripPhoneNumbers(line);
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
    totalCount++;
  }

  // Filter messages older than maxDays
  const cutoffTime = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  const recentMessages = messages.filter((m) => {
    if (!m.date) return true; // If date couldn't be parsed, keep conservatively
    return m.date.getTime() >= cutoffTime;
  });

  return {
    totalMessages: totalCount,
    recentMessages,
  };
}

export async function POST(req: NextRequest) {
  // 1. Authenticate admin
  const auth = requireAdminApi(req);
  if (auth.errorResponse) return auth.errorResponse;

  // 2. Verify origin
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden: invalid origin" },
      { status: 403, headers: NOINDEX_HEADERS }
    );
  }

  let fileBuffer: Uint8Array;
  let isZip = false;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: "Missing 'file' field in form data" },
          { status: 400, headers: NOINDEX_HEADERS }
        );
      }
      if (file.size > MAX_COMPRESSED_BYTES) {
        return NextResponse.json(
          { error: "File exceeds 10MB limit" },
          { status: 413, headers: NOINDEX_HEADERS }
        );
      }
      const arrayBuf = await file.arrayBuffer();
      fileBuffer = new Uint8Array(arrayBuf);
      isZip = (file instanceof File ? file.name : "").endsWith(".zip") || file.type === "application/zip";
    } catch (err: unknown) {
      return NextResponse.json(
        { error: `Failed to read form data: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400, headers: NOINDEX_HEADERS }
      );
    }
  } else {
    // Direct binary or text upload
    try {
      const arrayBuf = await req.arrayBuffer();
      if (arrayBuf.byteLength > MAX_COMPRESSED_BYTES) {
        return NextResponse.json(
          { error: "Payload exceeds 10MB limit" },
          { status: 413, headers: NOINDEX_HEADERS }
        );
      }
      fileBuffer = new Uint8Array(arrayBuf);
      // Check magic numbers for ZIP: 0x50 0x4B 0x03 0x04
      isZip =
        fileBuffer.length > 4 &&
        fileBuffer[0] === 0x50 &&
        fileBuffer[1] === 0x4b &&
        fileBuffer[2] === 0x03 &&
        fileBuffer[3] === 0x04;
    } catch (err: unknown) {
      return NextResponse.json(
        { error: `Failed to read body: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400, headers: NOINDEX_HEADERS }
      );
    }
  }

  // Decompress or decode text
  let combinedText = "";

  if (isZip) {
    try {
      let entryCount = 0;
      let totalUncompressedBytes = 0;

      const unzipped = unzipSync(fileBuffer, {
        filter(file) {
          entryCount++;
          if (entryCount > MAX_ZIP_ENTRIES) {
            throw new Error(`Archive contains too many entries (max ${MAX_ZIP_ENTRIES})`);
          }

          if (file.originalSize > MAX_UNCOMPRESSED_BYTES) {
            throw new Error("Uncompressed content exceeds 20MB limit (zip bomb protection)");
          }

          // Accept only entries whose name ends with .txt
          // Reject (skip) any entry whose name contains "..", starts with "/" or "\", or contains a drive letter
          const hasTraversal = file.name.includes("..");
          const hasLeadingSlash = file.name.startsWith("/") || file.name.startsWith("\\");
          const hasDriveLetter = /[a-zA-Z]:/.test(file.name);
          const isTxt = file.name.toLowerCase().endsWith(".txt");

          if (hasTraversal || hasLeadingSlash || hasDriveLetter || !isTxt) {
            return false;
          }

          totalUncompressedBytes += file.originalSize;
          if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
            throw new Error("Uncompressed content exceeds 20MB limit (zip bomb protection)");
          }

          return true;
        },
      });

      for (const [, content] of Object.entries(unzipped)) {
        combinedText += new TextDecoder("utf-8").decode(content) + "\n";
      }
    } catch (err: unknown) {
      return NextResponse.json(
        { error: `Failed to unzip archive: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400, headers: NOINDEX_HEADERS }
      );
    }
  } else {
    combinedText = new TextDecoder("utf-8").decode(fileBuffer);
  }

  if (combinedText.length > MAX_UNCOMPRESSED_BYTES) {
    return NextResponse.json(
      { error: "Text exceeds 20MB limit" },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  // Parse WhatsApp export into sanitized message objects
  const { totalMessages, recentMessages } = parseWhatsAppExport(combinedText, MAX_MESSAGE_AGE_DAYS);

  const repo = getJobsRepository();
  let parsedJobs = 0;
  let added = 0;
  let duplicates = 0;
  let filtered = 0;

  for (const msg of recentMessages) {
    const candidates = parseInboundCandidates(msg.text, { source: "whatsapp" });
    if (candidates.length === 0) continue;

    parsedJobs += candidates.length;
    const ingestRes = await processAndIngestInboundCandidates(candidates, repo, {
      maxAgeDays: MAX_MESSAGE_AGE_DAYS,
    });
    added += ingestRes.added;
    duplicates += ingestRes.duplicates;
    filtered += ingestRes.filtered;
  }

  return NextResponse.json(
    {
      totalMessages,
      parsedJobs,
      added,
      duplicates,
      filtered,
    },
    { headers: NOINDEX_HEADERS }
  );
}
