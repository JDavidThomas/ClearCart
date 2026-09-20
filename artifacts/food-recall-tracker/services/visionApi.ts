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

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
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

function parseProductName(text: string): string | null {
  const trimmed = text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();

  try {
    const parsed = JSON.parse(trimmed) as { productName?: unknown };
    return cleanProductName(parsed.productName);
  } catch {
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as { productName?: unknown };
        return cleanProductName(parsed.productName);
      } catch {
        return null;
      }
    }
    return cleanProductName(trimmed);
  }
}

async function fetchGemini(
  model: (typeof GEMINI_MODELS)[number],
  apiKey: string,
  imageBase64: string,
  mimeType: string,
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
                text: "Read the visible food package label carefully. Return ONLY one complete, coherent product name with no explanation, punctuation, or formatting. If a brand is visible, include the brand and the product type, such as 'Great Value Creamy Peanut Butter'. For a jar labeled 'Great Value Creamy Peanut Butter', return: 'Great Value Creamy Peanut Butter'. Do NOT return 'Great', 'Creamy', or 'Peanut Butter'. If the image shows unbranded produce, return the specific produce type, such as 'romaine lettuce'. Never return a partial word, an ingredient, a flavor or texture descriptor by itself, or a single fragment such as 'cre', 'creamy', or 'peanut'. If you can only read part of the label, or if the product name is ambiguous, return 'unknown' rather than guessing. It is better to return 'unknown' than to return an incomplete name. If you cannot confidently identify the complete product name, return exactly 'unknown'.",
              },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 64,
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

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Photo identification is not configured in this app bundle.');
  }

  let lastError: unknown = null;
  let receivedIdentificationResponse = false;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetchGemini(model, apiKey, imageBase64, mimeType);
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        lastError = new Error(`Gemini ${model} returned HTTP ${response.status}: ${responseBody.slice(0, 160)}`);

        if (response.status === 400 || response.status === 401 || response.status === 403) {
          break;
        }
        continue;
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text.trim()) {
        receivedIdentificationResponse = true;
        lastError = new Error(`Gemini ${model} returned an empty response.`);
        continue;
      }
      const productName = parseProductName(text);
      if (productName) return productName;
      receivedIdentificationResponse = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (receivedIdentificationResponse) return null;
  if (lastError instanceof Error && lastError.message === 'GEMINI_TIMEOUT') {
    throw new Error('Food photo identification timed out. Please try again.');
  }
  throw new Error(PHOTO_SERVICE_ERROR);
}