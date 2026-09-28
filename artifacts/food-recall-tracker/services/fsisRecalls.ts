import { Platform } from 'react-native';
import type { FoodRecall } from '../types/recall.ts';
import { getFsisRecalls } from '@workspace/api-client-react';
import { normalizeFsisRecallRecords } from './fsisRecallData.ts';
import type { FsisRecallSearchResult } from './recallSourceResults.ts';

const FSIS_RECALLS_URL =
  'https://www.fsis.usda.gov/fsis/api/recall/v/1?field_recall_type_id=23';
const FSIS_REQUEST_TIMEOUT_MS = 15_000;
const FSIS_PUBLIC_PROXIES = [
  {
    name: 'corsproxy.io',
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  },
  {
    name: 'AllOrigins',
    buildUrl: (url: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
] as const;

function toFoodRecall(recall: {
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
}): FoodRecall {
  return {
    recallNumber: recall.id,
    productDescription: recall.productName,
    reasonForRecall: recall.reason,
    recallingFirm: recall.companyName,
    recallDate: recall.date,
    classification: recall.classification,
    status: recall.recallType,
    officialUrl: recall.officialUrl,
    source: 'USDA FSIS',
    summary: recall.summary,
    recallType: recall.recallType,
    relatedToOutbreak: recall.relatedToOutbreak,
  };
}

async function fetchFsisFeed(url: string, source: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FSIS_REQUEST_TIMEOUT_MS);

  try {
    console.info('[FSIS] requesting recall feed', { source });
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${source} returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error(`${source} returned an invalid recall feed.`);
    }
    const records = normalizeFsisRecallRecords(payload);
    console.info('[FSIS] recall feed request succeeded', {
      source,
      resultCount: records.length,
    });
    return records.map(toFoodRecall);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPublicProxyRecalls(): Promise<FoodRecall[] | null> {
  for (const proxy of FSIS_PUBLIC_PROXIES) {
    try {
      return await fetchFsisFeed(proxy.buildUrl(FSIS_RECALLS_URL), proxy.name);
    } catch (error) {
      console.warn('[FSIS] public proxy failed', {
        source: proxy.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

export async function searchFsisRecalls(): Promise<FsisRecallSearchResult> {
  if (Platform.OS !== 'web') {
    try {
      return {
        recalls: await fetchFsisFeed(FSIS_RECALLS_URL, 'official native request'),
      };
    } catch (error) {
      console.warn('[FSIS] direct native request failed; trying public proxies', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const proxyRecalls = await fetchPublicProxyRecalls();
  if (proxyRecalls) {
    return { recalls: proxyRecalls };
  }

  try {
    console.info('[FSIS] trying the API server fallback');
    const response = await getFsisRecalls();
    if (!response || !Array.isArray(response.recalls)) {
      throw new Error('USDA FSIS API server returned an invalid response.');
    }
    console.info('[FSIS] API server request succeeded', {
      resultCount: response.recalls.length,
    });
    return { recalls: response.recalls.map(toFoodRecall) };
  } catch (error) {
    console.error('[FSIS] API server request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { recalls: [], sourceUnavailable: 'fsis' };
  }
}