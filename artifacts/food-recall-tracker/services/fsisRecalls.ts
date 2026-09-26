import { Platform } from 'react-native';
import type { FoodRecall } from '../types/recall.ts';
import { getFsisRecalls } from '@workspace/api-client-react';
import { normalizeFsisRecallRecords } from './fsisRecallData.ts';

const FSIS_RECALLS_URL =
  'https://www.fsis.usda.gov/fsis/api/recall/v/1?field_recall_type_id=23';
const FSIS_REQUEST_TIMEOUT_MS = 15_000;

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

async function fetchFsisRecallsDirectly() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FSIS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FSIS_RECALLS_URL, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`USDA FSIS returned HTTP ${response.status}`);
    }
    return normalizeFsisRecallRecords((await response.json()) as unknown);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchFsisRecalls(): Promise<FoodRecall[]> {
  try {
    const response = await getFsisRecalls();
    return response.recalls.map(toFoodRecall);
  } catch (proxyError) {
    if (Platform.OS === 'web') throw proxyError;

    try {
      const recalls = await fetchFsisRecallsDirectly();
      return recalls.map(toFoodRecall);
    } catch {
      throw proxyError;
    }
  }
}