const GEMINI_SMOKE_TEST_MODEL = 'gemini-2.5-flash';
const GEMINI_SMOKE_TEST_TIMEOUT_MS = 15_000;

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export async function runGeminiHelloSmokeTest() {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_SMOKE_TEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SMOKE_TEST_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with exactly: hello' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 16 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as GeminiTextResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    console.info('[GeminiSmokeTest] success', {
      model: GEMINI_SMOKE_TEST_MODEL,
      response: text.slice(0, 80),
    });
    return text;
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : error instanceof Error
          ? error.message
          : 'unknown network error';
    console.error('[GeminiSmokeTest] failed', { reason });
    throw new Error(`Gemini hello test failed: ${reason}`);
  } finally {
    clearTimeout(timeoutId);
  }
}