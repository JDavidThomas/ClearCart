const FDA_RECALL_SEARCH_URL =
  "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts";
const FDA_RECALL_REQUEST_TIMEOUT_MS = 15_000;
const FDA_RECALL_CACHE_TTL_MS = 10 * 60 * 1000;

export interface FdaRecallNotice {
  recallNumber?: string;
  productDescription: string;
  reasonForRecall: string;
  recallingFirm: string;
  recallDate: string;
  classification: string;
  status?: string;
  officialUrl: string;
}

interface CachedNotices {
  expiresAt: number;
  results: FdaRecallNotice[];
}

const noticeCache = new Map<string, CachedNotices>();

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function htmlToText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|div|li)>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function fieldMarkup(row: string, fieldName: string) {
  const cells = row.matchAll(/<td\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi);
  for (const cell of cells) {
    const classes = cell[1].split(/\s+/);
    if (classes.includes(`views-field-${fieldName}`)) return cell[2];
  }
  return "";
}

function fieldText(row: string, fieldName: string) {
  return htmlToText(fieldMarkup(row, fieldName));
}

function extractSearchTerm(searchExpression: string) {
  const words =
    searchExpression
      .replace(/\b(?:recalling_firm|product_description):/gi, " ")
      .replace(/\b(?:AND|OR|NOT)\b/gi, " ")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)].slice(0, 12).join(" ").slice(0, 120);
}

export function parseFdaRecallNoticeSearchResults(html: string): FdaRecallNotice[] {
  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  const notices: FdaRecallNotice[] = [];

  for (const rowMatch of rows) {
    const row = rowMatch[1];
    if (!row.includes("<td")) continue;

    const brand = fieldText(row, "brand-name");
    const productType = fieldText(row, "field-product-description-1");
    const productDescription = [brand, productType].filter(Boolean).join(" ").trim();
    const recallingFirm = fieldText(row, "company-name");
    if (!productDescription && !recallingFirm) continue;

    const terminationStatus = fieldText(row, "field-terminated-recall");
    if (/terminated/i.test(terminationStatus)) continue;

    const dateMarkup = fieldMarkup(row, "field-change-date-2");
    const recallDate =
      dateMarkup.match(/datetime=["']([^"']+)["']/i)?.[1] ?? htmlToText(dateMarkup);
    const relativeUrl = row.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const officialUrl = relativeUrl
      ? new URL(decodeHtmlEntities(relativeUrl), FDA_RECALL_SEARCH_URL).toString()
      : FDA_RECALL_SEARCH_URL;

    notices.push({
      productDescription: productDescription || "FDA recall notice",
      reasonForRecall:
        fieldText(row, "field-recall-reason-description-1") || "See official FDA notice",
      recallingFirm: recallingFirm || "Company not provided",
      recallDate: recallDate || "Date not provided",
      classification: "See official FDA notice",
      status: terminationStatus || undefined,
      officialUrl,
    });
  }

  return notices;
}

export async function searchFdaRecallNoticeIndex(searchExpression: string) {
  const searchTerm = extractSearchTerm(searchExpression);
  if (!searchTerm) return [];

  const cacheKey = searchTerm.toLocaleLowerCase();
  const cached = noticeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const url = new URL(FDA_RECALL_SEARCH_URL);
  url.searchParams.set("search_api_fulltext", searchTerm);
  const response = await fetch(url, {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(FDA_RECALL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`FDA recall notice search returned HTTP ${response.status}`);
  }

  const results = parseFdaRecallNoticeSearchResults(await response.text());
  noticeCache.set(cacheKey, {
    results,
    expiresAt: Date.now() + FDA_RECALL_CACHE_TTL_MS,
  });
  return results;
}