const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_DEMO_KEY = 'helloworld';
const OCR_REQUEST_TIMEOUT_MS = 30_000;
const PHOTO_SERVICE_ERROR =
  'Photo identification service is temporarily unavailable. Please type the product name instead.';

interface OcrResponse {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: Array<{
    ParsedText?: string;
  }>;
}

function abortAfter(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), milliseconds);
  return { controller, timeoutId };
}

function getErrorMessage(payload: OcrResponse) {
  if (Array.isArray(payload.ErrorMessage)) return payload.ErrorMessage.join(' ');
  return typeof payload.ErrorMessage === 'string' ? payload.ErrorMessage : 'OCR processing failed.';
}

function isUsefulProductLabel(value: string) {
  const normalized = value
    .replace(/[|_]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s&'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length < 3 || normalized.length > 80) return false;
  if (normalized.split(/\s+/).length > 10) return false;
  if ((normalized.match(/\d/g) ?? []).length > 3) return false;

  return !/^(food|product|ingredients?|nutrition facts?|serving size|calories?|amount per serving|best before|use by|net weight|contents?)$/i.test(
    normalized,
  );
}

function extractProductLabel(payload: OcrResponse) {
  const text =
    payload.ParsedResults?.map((result) => result.ParsedText ?? '')
      .join('\n')
      .trim() ?? '';
  if (!text) return null;

  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isUsefulProductLabel);

  return candidates[0] ?? null;
}

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const request = abortAfter(OCR_REQUEST_TIMEOUT_MS);
  const requestBody = {
    base64Image: `data:${mimeType};base64,${imageBase64}`,
    language: 'eng',
    isOverlayRequired: false,
    detectOrientation: true,
    scale: true,
    OCREngine: 1,
  };

  console.info('[PhotoCheck] OCR request', {
    method: 'POST',
    url: OCR_ENDPOINT,
    body: {
      base64Image: `[redacted; ${imageBase64.length} characters]`,
      language: requestBody.language,
      OCREngine: requestBody.OCREngine,
    },
  });

  try {
    const response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: OCR_DEMO_KEY,
      },
      body: JSON.stringify(requestBody),
      signal: request.controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OCR service returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as OcrResponse;
    if (payload.IsErroredOnProcessing) {
      throw new Error(getErrorMessage(payload));
    }

    const productName = extractProductLabel(payload);
    console.info('[PhotoCheck] OCR response', {
      url: OCR_ENDPOINT,
      status: 'ok',
      productFound: Boolean(productName),
    });
    return productName;
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : error instanceof Error
          ? error.message
          : 'unknown network error';
    console.error('[PhotoCheck] OCR request failed', { url: OCR_ENDPOINT, reason });
    throw new Error(PHOTO_SERVICE_ERROR);
  } finally {
    clearTimeout(request.timeoutId);
  }
}