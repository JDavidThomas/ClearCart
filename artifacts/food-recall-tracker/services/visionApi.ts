import { healthCheck, identifyFood } from '@workspace/api-client-react';
import { getCurrentApiBaseUrl } from './apiConnection';

const API_HEALTH_TIMEOUT_MS = 5_000;
const VISION_REQUEST_TIMEOUT_MS = 30_000;
const API_HEALTH_PATH = '/api/health';
const VISION_PATH = '/api/vision/identify-food';

function abortAfter(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), milliseconds);
  return { controller, timeoutId };
}

function requestBodySummary(imageBase64: string, mimeType: string) {
  return {
    imageBase64: `[redacted; ${imageBase64.length} characters]`,
    mimeType,
  };
}

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const baseUrl = getCurrentApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Photo service URL is not configured in this app bundle.');
  }

  const healthUrl = `${baseUrl}${API_HEALTH_PATH}`;
  const visionUrl = `${baseUrl}${VISION_PATH}`;
  const healthRequest = abortAfter(API_HEALTH_TIMEOUT_MS);
  try {
    console.info('[PhotoCheck] API health request', { url: healthUrl });
    await healthCheck({ signal: healthRequest.controller.signal });
    console.info('[PhotoCheck] API health response', { url: healthUrl, status: 'ok' });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : error instanceof Error
          ? error.message
          : 'unknown network error';
    console.error('[PhotoCheck] API health request failed', { url: healthUrl, reason });
    throw new Error(`Photo service is unreachable at ${healthUrl}. ${reason}`);
  } finally {
    clearTimeout(healthRequest.timeoutId);
  }

  const visionRequest = abortAfter(VISION_REQUEST_TIMEOUT_MS);
  console.info('[PhotoCheck] Vision request', {
    method: 'POST',
    url: visionUrl,
    body: requestBodySummary(imageBase64, mimeType),
  });

  try {
    const response = await identifyFood(
      { imageBase64, mimeType },
      { signal: visionRequest.controller.signal },
    );
    console.info('[PhotoCheck] Vision response', { url: visionUrl, status: 'ok' });
    return response.productName?.trim() || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Food photo identification timed out. Please try again.');
    }
    const reason = error instanceof Error ? error.message : 'unknown network error';
    console.error('[PhotoCheck] Vision request failed', { url: visionUrl, reason });
    if (/failed to fetch|network request failed|fetch failed/i.test(reason)) {
      throw new Error(`Photo service request failed at ${visionUrl}. Check the phone connection and try again.`);
    }
    throw error;
  } finally {
    clearTimeout(visionRequest.timeoutId);
  }
}