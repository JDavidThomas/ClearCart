const VISION_REQUEST_TIMEOUT_MS = 30_000;
const PHOTO_SERVICE_ERROR =
  'Photo identification service is temporarily unavailable. Please type the product name instead.';

function abortAfter(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), milliseconds);
  return { controller, timeoutId };
}

function getApiErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const baseUrl = getCurrentApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Photo identification server is not configured in this app bundle.');
  }

  const request = abortAfter(VISION_REQUEST_TIMEOUT_MS);
  const visionUrl = `${baseUrl}/api/vision/identify-food`;
  console.info('[PhotoCheck] Vision request', {
    method: 'POST',
    url: visionUrl,
    body: {
      base64Image: `[redacted; ${imageBase64.length} characters]`,
      mimeType,
    },
  });

  try {
    const response = await identifyFood(
      { imageBase64, mimeType },
      { signal: request.controller.signal },
    );
    const productName = response.productName?.trim() || null;
    console.info('[PhotoCheck] Vision response', {
      url: visionUrl,
      status: 'ok',
      productFound: Boolean(productName),
    });
    return productName;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Food photo identification timed out. Please try again.');
    }
    const reason = error instanceof Error ? error.message : 'unknown network error';
    console.error('[PhotoCheck] Vision request failed', { url: visionUrl, reason });
    const apiMessage = getApiErrorMessage(error);
    if (apiMessage) throw new Error(apiMessage);
    if (/failed to fetch|network request failed|fetch failed/i.test(reason)) {
      throw new Error('Photo identification server is unreachable. Check your connection and try again.');
    }
    throw new Error(PHOTO_SERVICE_ERROR);
  } finally {
    clearTimeout(request.timeoutId);
  }
}
const VISION_REQUEST_TIMEOUT_MS = 30_000;
