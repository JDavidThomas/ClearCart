const GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'] as const;
const PHOTO_SERVICE_ERROR =
  'Photo identification service is temporarily unavailable. Please type the product name instead.';
const GENERIC_LABEL_WORDS = new Set([
  'classic',
  'creamy',
  'fresh',
  'flavor',
  'great',
  'market',
  'natural',
  'original',
  'organic',
  'peanut',
  'premium',
  'sour',
  'the',
  'value',
  'vanilla',
]);
const STANDALONE_FOOD_WORDS = new Set([
  'apple',
  'apples',
  'avocado',
  'banana',
  'beef',
  'bread',
  'broccoli',
  'carrot',
  'celery',
  'cereal',
  'cheese',
  'chicken',
  'cucumber',
  'coffee',
  'garlic',
  'grape',
  'hummus',
  'icecream',
  'kale',
  'lemon',
  'lettuce',
  'lime',
  'mango',
  'milk',
  'oats',
  'onion',
  'orange',
  'pasta',
  'pear',
  'pork',
  'potato',
  'rice',
  'salmon',
  'soup',
  'spinach',
  'tomato',
  'tofu',
  'tuna',
  'yogurt',
]);
const SUSPICIOUS_END_WORDS = new Set([
  'cream',
  'creamy',
  'flavor',
  'fresh',
  'great',
  'market',
  'natural',
  'organic',
  'original',
  'peanut',
  'premium',
  'sour',
  'value',
]);
const RECOVERY_IDENTIFICATION_PROMPT =
  'Scan the image again at maximum readable detail. Prioritize package text, the brand name, product type, flavor, and the nutrition panel. Also read any shelf sign or price tag that could identify the product. Return only the scanner JSON object requested above. Copy what is visible; never guess. Use "unknown" for unreadable fields.';
const STRICT_IDENTIFICATION_PROMPT =
  'Act like a barcode scanner and package label reader. Read the ENTIRE image at maximum detail, especially the brand name, product type, flavor or variety, and the nutrition panel on the package. Return only valid JSON with exactly these fields: brand, productType, flavor, nutrition, fullName, contextText, confidence, and sourceOfIdentification. brand is the visible brand name, such as "Oreo". productType is the product type, such as "Sandwich Cookies". flavor is any visible flavor or variety, such as "Deep Fried". nutrition is a dictionary of exact per-serving nutrition facts visible on the package front or nutrition panel, preserving values and units (for example calories, saturated fat, and added sugar). fullName must combine the readable brand, product type, and flavor into one searchable string. contextText must copy useful visible shelf signs, price tags, or other surrounding product text. For every field you cannot read, return the string "unknown"; use {"unknown":"unknown"} when no nutrition facts are readable. Never guess, fill gaps from product knowledge, or silently omit a field. Set sourceOfIdentification to "product" when the package supplies the name, "sign" when surrounding text supplies it, and "unknown" when neither does. Set confidence to high, medium, or low.';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: Record<string, unknown>;
}

export type IdentificationConfidence = 'high' | 'medium' | 'low';
export type IdentificationSource = 'product' | 'sign' | 'unknown';

export interface FoodIdentification {
  brand: string;
  productType: string;
  flavor: string;
  nutrition: Record<string, string>;
  fullName: string;
  productName: string | null;
  contextText: string;
  confidence: IdentificationConfidence;
  sourceOfIdentification: IdentificationSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanScannerField(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');
  return normalized || 'unknown';
}

function cleanNutrition(value: unknown): Record<string, string> {
  if (!isRecord(value)) return { unknown: 'unknown' };

  const entries = Object.entries(value)
    .map(([key, item]) => [key.trim(), cleanScannerField(item)] as const)
    .filter(([key, item]) => key && item !== 'unknown');

  return entries.length > 0 ? Object.fromEntries(entries) : { unknown: 'unknown' };
}

function cleanProductName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');

  return isUsableProductName(normalized) ? normalized : null;
}

function cleanContextText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function cleanConfidence(value: unknown): IdentificationConfidence {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function cleanIdentificationSource(value: unknown): IdentificationSource {
  return value === 'product' || value === 'sign' ? value : 'unknown';
}

export function isUsableProductName(value: string | null | undefined): value is string {
  if (!value) return false;

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 100) return false;
  if (/^(unknown|unclear|not a food|no food|none|null)$/i.test(normalized)) return false;

  const words = normalized.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return false;
  if (words.length === 1) {
    const word = words[0];
    if (GENERIC_LABEL_WORDS.has(word)) return false;
    if (!STANDALONE_FOOD_WORDS.has(word)) return false;
  }

  return true;
}

export function isPossiblyTruncatedProductName(value: string): boolean {
  if (!isUsableProductName(value)) return false;

  const words = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length < 3 && !STANDALONE_FOOD_WORDS.has(words[words.length - 1])) {
    return true;
  }
  return SUSPICIOUS_END_WORDS.has(words[words.length - 1]);
}

function parseIdentification(text: string): FoodIdentification {
  const trimmed = text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();

  const candidates = [trimmed];
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        brand?: unknown;
        productType?: unknown;
        flavor?: unknown;
        nutrition?: unknown;
        fullName?: unknown;
        contextText?: unknown;
        confidence?: unknown;
        sourceOfIdentification?: unknown;
      };
      const fullName = cleanScannerField(parsed.fullName);
      return {
        brand: cleanScannerField(parsed.brand),
        productType: cleanScannerField(parsed.productType),
        flavor: cleanScannerField(parsed.flavor),
        nutrition: cleanNutrition(parsed.nutrition),
        fullName,
        productName: cleanProductName(fullName),
        contextText: cleanContextText(parsed.contextText),
        confidence: cleanConfidence(parsed.confidence),
        sourceOfIdentification: cleanIdentificationSource(parsed.sourceOfIdentification),
      };
    } catch {
      // Try the next JSON candidate, then preserve the previous plain-text fallback.
    }
  }

  return {
    brand: 'unknown',
    productType: 'unknown',
    flavor: 'unknown',
    nutrition: { unknown: 'unknown' },
    fullName: cleanScannerField(trimmed),
    productName: cleanProductName(trimmed),
    contextText: '',
    confidence: 'medium',
    sourceOfIdentification: 'product',
  };
}

async function fetchGemini(
  model: (typeof GEMINI_MODELS)[number],
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const estimatedImageBytes = Math.floor((imageBase64.length * 3) / 4);
  console.info('[Gemini] photo request', {
    model,
    mimeType,
    base64Characters: imageBase64.length,
    estimatedImageBytes,
    estimatedImageMegabytes: Number((estimatedImageBytes / 1024 / 1024).toFixed(2)),
    responseMode: 'application/json',
    responseSchema: false,
    timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
  });
  const request = fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      console.error('[Gemini] photo request timed out', {
        model,
        timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
        base64Characters: imageBase64.length,
        estimatedImageBytes,
      });
      reject(new Error('GEMINI_TIMEOUT'));
    }, GEMINI_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

interface IdentificationAttempt {
  identification: FoodIdentification | null;
  suspiciousCandidate: string | null;
  suspiciousIdentification: FoodIdentification | null;
  receivedIdentificationResponse: boolean;
  lastError: unknown;
}

async function identifyWithPrompt(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<IdentificationAttempt> {
  let lastError: unknown = null;
  let receivedIdentificationResponse = false;
  let suspiciousCandidate: string | null = null;
  let suspiciousIdentification: FoodIdentification | null = null;
  let identification: FoodIdentification | null = null;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetchGemini(model, apiKey, imageBase64, mimeType, prompt);
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        const detailedMessage = `Gemini ${model} returned HTTP ${response.status}: ${responseBody || 'empty error body'}`;
        console.error('[Gemini] photo request failed', {
          model,
          status: response.status,
          statusText: response.statusText,
          body: responseBody || 'empty error body',
        });
        lastError = new Error(detailedMessage);

        if (response.status === 400 || response.status === 401 || response.status === 403) break;
        continue;
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text.trim()) {
        receivedIdentificationResponse = true;
        const finishReason = payload.candidates?.[0]?.finishReason ?? 'unknown';
        console.error('[Gemini] photo response contained no text', {
          model,
          finishReason,
          usageMetadata: payload.usageMetadata,
        });
        lastError = new Error(
          `Gemini ${model} returned an empty response (finishReason=${finishReason}).`,
        );
        continue;
      }

      console.info('[Gemini] photo scanner JSON response', text);
      const parsedIdentification = parseIdentification(text);
      identification = parsedIdentification;
      if (parsedIdentification.productName) {
        if (isPossiblyTruncatedProductName(parsedIdentification.productName)) {
          suspiciousCandidate = parsedIdentification.productName;
          suspiciousIdentification = parsedIdentification;
          receivedIdentificationResponse = true;
          continue;
        }
        return { identification: parsedIdentification, suspiciousCandidate, suspiciousIdentification, receivedIdentificationResponse: true, lastError };
      }
      receivedIdentificationResponse = true;
      if (parsedIdentification.contextText) {
        return { identification: parsedIdentification, suspiciousCandidate, suspiciousIdentification, receivedIdentificationResponse: true, lastError };
      }
    } catch (error) {
      console.error('[Gemini] photo request exception', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      lastError = error;
    }
  }

  return { identification, suspiciousCandidate, suspiciousIdentification, receivedIdentificationResponse, lastError };
}

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg'): Promise<FoodIdentification> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Photo identification is not configured in this app bundle.');
  }

  const primaryAttempt = await identifyWithPrompt(apiKey, imageBase64, mimeType, STRICT_IDENTIFICATION_PROMPT);
  if (primaryAttempt.identification?.productName || primaryAttempt.identification?.contextText) {
    return primaryAttempt.identification;
  }

  if (primaryAttempt.receivedIdentificationResponse) {
    const recoveryAttempt = await identifyWithPrompt(apiKey, imageBase64, mimeType, RECOVERY_IDENTIFICATION_PROMPT);
    if (recoveryAttempt.identification?.productName || recoveryAttempt.identification?.contextText) {
      return recoveryAttempt.identification;
    }
    if (recoveryAttempt.suspiciousCandidate && recoveryAttempt.suspiciousIdentification) {
      return { ...recoveryAttempt.suspiciousIdentification, productName: recoveryAttempt.suspiciousCandidate };
    }
    if (primaryAttempt.suspiciousCandidate && primaryAttempt.suspiciousIdentification) {
      return { ...primaryAttempt.suspiciousIdentification, productName: primaryAttempt.suspiciousCandidate };
    }
    return {
      brand: 'unknown',
      productType: 'unknown',
      flavor: 'unknown',
      nutrition: { unknown: 'unknown' },
      fullName: 'unknown',
      productName: null,
      contextText: '',
      confidence: 'low',
      sourceOfIdentification: 'unknown',
    };
  }

  if (primaryAttempt.lastError instanceof Error && primaryAttempt.lastError.message === 'GEMINI_TIMEOUT') {
    throw new Error('Food photo identification timed out. Please try again.');
  }
  if (primaryAttempt.lastError instanceof Error && primaryAttempt.lastError.message.startsWith('Gemini ')) {
    throw new Error(`Photo identification failed: ${primaryAttempt.lastError.message}`);
  }
  throw new Error(PHOTO_SERVICE_ERROR);
}