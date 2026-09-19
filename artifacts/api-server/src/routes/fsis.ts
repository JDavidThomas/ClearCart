import { GetFsisRecallsResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const FSIS_RECALLS_URL =
  "https://www.fsis.usda.gov/fsis/api/recall/v/1?field_recall_type_id=23&field_year_id=685";
const FSIS_RECALLS_PAGE = "https://www.fsis.usda.gov/food-safety/recalls-public-health-alerts";
const CACHE_TTL_MS = 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const FSIS_REQUEST_TIMEOUT_MS = 15_000;

interface RawFsisRecall {
  [key: string]: unknown;
}

interface FsisCache {
  recalls: Array<{
    id: string;
    productName: string;
    companyName: string;
    reason: string;
    date: string;
    classification: string;
    summary: string;
    officialUrl: string;
    recallType: string;
    relatedToOutbreak: boolean;
  }>;
  lastUpdated: string;
  expiresAt: number;
}

let fsisCache: FsisCache | null = null;

function textValue(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isActiveRecall(value: unknown) {
  return /active/i.test(textValue(value, ""));
}

function isRelatedToOutbreak(value: unknown) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes)$/i.test(textValue(value, ""));
}

function parseRecallDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRecentRecall(date: string) {
  const parsed = parseRecallDate(date);
  if (!parsed) return false;
  const now = Date.now();
  return parsed.getTime() >= now - TWELVE_MONTHS_MS && parsed.getTime() <= now + 24 * 60 * 60 * 1000;
}

function normalizeRecall(record: RawFsisRecall, index: number) {
  const productName = textValue(record.field_title, "Product name unavailable");
  const companyName = textValue(record.field_establishment, "Company not provided");
  const reason = textValue(record.field_recall_reason, "Reason not provided");
  const date = textValue(record.field_recall_date, "Date not provided");
  const summary = stripHtml(textValue(record.field_summary, "Summary not provided"));
  const officialUrl = textValue(record.field_recall_url, FSIS_RECALLS_PAGE);
  const recallType = textValue(record.field_recall_type, "Active Recall");
  const id = textValue(
    record.nid ?? record.field_recall_number,
    `${productName}|${date}|${officialUrl}|${index}`,
  );

  return {
    id,
    productName,
    companyName,
    reason,
    date,
    classification: textValue(record.field_recall_classification, "Classification not provided"),
    summary,
    officialUrl,
    recallType,
    relatedToOutbreak: isRelatedToOutbreak(record.field_related_to_outbreak),
  };
}

async function loadFsisRecalls() {
  if (fsisCache && fsisCache.expiresAt > Date.now()) {
    logger.info({ count: fsisCache.recalls.length }, "Serving USDA FSIS recalls from memory cache");
    return fsisCache;
  }

  const response = await fetch(FSIS_RECALLS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FSIS_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`USDA FSIS returned ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const records = Array.isArray(payload) ? payload : [];
  const recalls = records
    .filter((record): record is RawFsisRecall => Boolean(record && typeof record === "object"))
    .filter((record) => isActiveRecall(record.field_recall_type))
    .map(normalizeRecall)
    .filter((recall) => isRecentRecall(recall.date));
  const lastUpdated = new Date().toISOString();
  fsisCache = {
    recalls,
    lastUpdated,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  logger.info({ count: recalls.length }, "Fetched active USDA FSIS recalls");
  return fsisCache;
}

router.get("/recalls/fsis", async (_req, res) => {
  try {
    const result = await loadFsisRecalls();
    const response = GetFsisRecallsResponse.parse({
      recalls: result.recalls,
      lastUpdated: result.lastUpdated,
    });
    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "USDA FSIS recall request failed");
    res.status(502).json({ message: "USDA FSIS recall data is unavailable right now." });
  }
});

export default router;