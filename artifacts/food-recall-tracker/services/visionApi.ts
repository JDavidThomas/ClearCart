const GEMINI_REQUEST_TIMEOUT_MS = 30_000;
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
  "Look carefully at the entire image a second time. Read any visible package text, shelf labels, handwritten signs, price tags, or other scene context. Identify the most likely food item or complete product name that is visibly present. Pay special attention to unbranded produce and simple foods: if the image shows a tomato, return 'tomato'; if it shows another single food, return that specific food. For a packaged product, combine the visible brand and product type when readable. Return the same structured JSON fields. Use sourceOfIdentification 'sign' when a sign or shelf label supplies the product name. Return productName 'unknown' and an empty contextText only if the image does not contain an identifiable food or useful text.";
const IDENTIFICATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    productName: { type: 'STRING' },
    contextText: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    sourceOfIdentification: { type: 'STRING', enum: ['product', 'sign', 'unknown'] },
  },
  required: ['productName', 'contextText', 'confidence', 'sourceOfIdentification'],
} as const;
const STRICT_IDENTIFICATION_PROMPT =
  "Read the ENTIRE image, not only the package. Identify the complete food product name using the product itself and any surrounding scene text such as shelf signs, handwritten signs, shelf labels, price tags, or other visible context. Include every readable brand and product word; combine words across line breaks. For unbranded produce, return the specific produce type. If a sign identifies the food, use that sign context even when the product itself is not packaged. Return only the requested JSON object. Use productName 'unknown' when the product cannot be identified confidently. Copy any useful visible sign, shelf-label, or price-tag text into contextText, otherwise use an empty string. Set sourceOfIdentification to 'product' when the item/package supplies the name, 'sign' when surrounding text supplies it, and 'unknown' when neither does.";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export type IdentificationConfidence = 'high' | 'medium' | 'low';
export type IdentificationSource = 'product' | 'sign' | 'unknown';

export interface FoodIdentification {
  productName: string | null;
  contextText: string;
  confidence: IdentificationConfidence;
  sourceOfIdentification: IdentificationSource;
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
        productName?: unknown;
        contextText?: unknown;
        confidence?: unknown;
        sourceOfIdentification?: unknown;
      };
      return {
        productName: cleanProductName(parsed.productName),
        contextText: cleanContextText(parsed.contextText),
        confidence: cleanConfidence(parsed.confidence),
        sourceOfIdentification: cleanIdentificationSource(parsed.sourceOfIdentification),
      };
    } catch {
      // Try the next JSON candidate, then preserve the previous plain-text fallback.
    }
  }

  return {
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
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
          responseSchema: IDENTIFICATION_RESPONSE_SCHEMA,
        },
      }),
    },
  );

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
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
        lastError = new Error(`Gemini ${model} returned HTTP ${response.status}: ${responseBody.slice(0, 160)}`);

        if (response.status === 400 || response.status === 401 || response.status === 403) break;
        continue;
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text.trim()) {
        receivedIdentificationResponse = true;
        lastError = new Error(`Gemini ${model} returned an empty response.`);
        continue;
      }

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
      productName: null,
      contextText: '',
      confidence: 'low',
      sourceOfIdentification: 'unknown',
    };
  }

  if (primaryAttempt.lastError instanceof Error && primaryAttempt.lastError.message === 'GEMINI_TIMEOUT') {
    throw new Error('Food photo identification timed out. Please try again.');
  }
  throw new Error(PHOTO_SERVICE_ERROR);
}