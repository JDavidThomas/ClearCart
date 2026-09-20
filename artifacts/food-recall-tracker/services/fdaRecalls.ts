import type { FoodRecall } from '../types/recall';
import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from './recallSearch.ts';
import { rankAndFilterRecalls } from './recallRelevance';

const OPENFDA_ENDPOINTS = [
  'https://api.fda.gov/food/enforcement.json',
  'https://api.fda.gov/drug/enforcement.json',
] as const;
const DEFAULT_FDA_NOTICES_URL =
  'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const OPENFDA_REQUEST_TIMEOUT_MS = 15_000;
const OPENFDA_RESULT_LIMIT = 20;

/**
 * This key is intentionally exposed in the Expo app bundle. openFDA is a free
 * public API with a 120,000-request daily limit, and direct calls avoid the
 * Replit API-server URL issues that previously blocked recall searches.
 */
const OPENFDA_API_KEY = process.env.EXPO_PUBLIC_OPENFDA_API_KEY?.trim();

interface OpenFdaRecord {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  classification?: string;
  status?: string;
  url?: string;
}

interface OpenFdaResponse {
  results?: OpenFdaRecord[];
}

function valueOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeRecord(record: OpenFdaRecord): FoodRecall {
  return {
    recallNumber: record.recall_number?.trim() || undefined,
    productDescription: valueOrFallback(
      record.product_description,
      'Product description unavailable',
    ),
    reasonForRecall: valueOrFallback(record.reason_for_recall, 'Reason not provided'),
    recallingFirm: valueOrFallback(record.recalling_firm, 'Recalling firm not provided'),
    recallDate: valueOrFallback(record.report_date, 'Date not provided'),
    classification: valueOrFallback(record.classification, 'Classification not provided'),
    status: record.status?.trim() || undefined,
    officialUrl: valueOrFallback(record.url, DEFAULT_FDA_NOTICES_URL),
    source: 'FDA',
  };
}

function isActiveRecall(record: FoodRecall) {
  const status = record.status?.toLowerCase() ?? '';
  return !status.includes('terminated') && !status.includes('completed');
}

async function searchEndpoint(endpoint: string, search: string) {
  if (!OPENFDA_API_KEY) {
    throw new Error(
      'FDA API configuration is missing. EXPO_PUBLIC_OPENFDA_API_KEY is not available in the app bundle.',
    );
  }

  const params = new URLSearchParams({
    search,
    limit: String(OPENFDA_RESULT_LIMIT),
    api_key: OPENFDA_API_KEY,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENFDA_REQUEST_TIMEOUT_MS);

  try {
    const encodedParams = params.toString().replace(/\*/g, '%2A');
    const response = await fetch(`${endpoint}?${encodedParams}`, {
      signal: controller.signal,
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`FDA API returned an error (HTTP ${response.status}). Please try again.`);
    }

    try {
      const payload = (await response.json()) as OpenFdaResponse;
      return payload.results ?? [];
    } catch {
      throw new Error('FDA API returned an unreadable response. Please try again.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('FDA API ')) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('FDA API is unreachable right now. Check your connection and try again.');
    }
    throw new Error('FDA API is unreachable right now. Check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchOpenFda(search: string) {
  const responses = await Promise.allSettled(
    OPENFDA_ENDPOINTS.map((endpoint) => searchEndpoint(endpoint, search)),
  );
  const successfulResults = responses
    .filter(
      (result): result is PromiseFulfilledResult<OpenFdaRecord[]> =>
        result.status === 'fulfilled',
    )
    .flatMap((result) => result.value);

  if (successfulResults.length > 0) {
    return successfulResults;
  }

  const firstFailure = responses.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  throw firstFailure?.reason ?? new Error('FDA API returned no results.');
}

function deduplicateRecalls(records: OpenFdaRecord[]) {
  const seenRecallKeys = new Set<string>();
  return records
    .map(normalizeRecord)
    .filter(isActiveRecall)
    .filter((recall) => {
      const key =
        recall.recallNumber ??
        [recall.productDescription, recall.recallingFirm, recall.recallDate].join('|');
      if (seenRecallKeys.has(key)) return false;
      seenRecallKeys.add(key);
      return true;
    });
}

export async function searchFdaRecalls(term: string): Promise<FoodRecall[]> {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) return [];

  const primaryQuery = buildOpenFdaSearchQuery(normalizedTerm);
  let results = await searchOpenFda(primaryQuery);

  if (results.length === 0) {
    const firstWord = normalizedTerm.split(' ')[0];
    const fallbackQuery = buildOpenFdaSearchQuery(firstWord);
    if (fallbackQuery && fallbackQuery !== primaryQuery) {
      results = await searchOpenFda(fallbackQuery);
    }
  }

  return rankAndFilterRecalls(deduplicateRecalls(results), normalizedTerm);
}
