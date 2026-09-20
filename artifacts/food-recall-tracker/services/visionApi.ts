const GEMINI_REQUEST_TIMEOUT_MS = 30_000;
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'] as const;
const PHOTO_SERVICE_ERROR =
  'Photo identification service is temporarily unavailable. Please type the product name instead.';

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

  if (!normalized || /^(unknown|unclear|not a food|no food|none|null)$/i.test(normalized)) {
    return null;
  }
  if (normalized.length > 100) return null;
  return normalized;
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
                text: "Look at this image. Identify the food product in it. Reply with ONLY a short product name, like 'romaine lettuce', 'ground beef', 'chicken breast', or 'cheddar cheese'. Do not include any other text, explanation, or punctuation. If you cannot identify a food product, reply with 'unknown'.",
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
        lastError = new Error(`Gemini ${model} returned an empty response.`);
        continue;
      }
      return parseProductName(text);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.message === 'GEMINI_TIMEOUT') {
    throw new Error('Food photo identification timed out. Please try again.');
  }
  throw new Error(PHOTO_SERVICE_ERROR);
}