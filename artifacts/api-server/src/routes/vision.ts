import { Router, type IRouter } from "express";
import { IdentifyFoodBody, IdentifyFoodResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash"] as const;
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;
const GEMINI_REQUEST_TIMEOUT_MS = 30_000;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function cleanProductName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");

  if (!normalized || /^(unknown|unclear|not a food|no food|none|null)$/i.test(normalized)) return null;
  if (normalized.length > 100) return null;
  return normalized;
}

function parseProductName(text: string) {
  const trimmed = text.trim().replace(/^```json/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as { productName?: unknown };
    return cleanProductName(parsed.productName);
  } catch {
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
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

router.post("/vision/identify-food", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  logger.info(
    {
      configured: Boolean(apiKey),
      models: GEMINI_MODELS,
    },
    "Gemini configuration check",
  );
  if (!apiKey) {
    logger.warn({ configured: false }, "Gemini food identification is not configured");
    res.status(503).json({ message: "Food photo identification is not configured right now." });
    return;
  }
  const parsed = IdentifyFoodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Send a base64 image and its MIME type." });
    return;
  }

  const { imageBase64, mimeType } = parsed.data;
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH || !SUPPORTED_MIME_TYPES.has(mimeType)) {
    logger.warn(
      { base64Length: imageBase64.length, mimeType, maxBase64Length: MAX_IMAGE_BASE64_LENGTH },
      "Rejected food photo before Gemini request",
    );
    res.status(400).json({ message: "That image is too large or uses an unsupported format." });
    return;
  }

  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      body: {
        imageBase64: `[redacted; ${imageBase64.length} characters]`,
        mimeType,
      },
    },
    "Received food photo request",
  );

  try {
    let response: Response | null = null;
    let modelUsed: (typeof GEMINI_MODELS)[number] = GEMINI_MODELS[0];
    let lastFailure: { model: string; status: number; statusText: string; responseBody: string } | null = null;

    for (const model of GEMINI_MODELS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
      let candidateResponse: Response;
      try {
        candidateResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
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
              generationConfig: { temperature: 0 },
            }),
          },
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (candidateResponse.ok) {
        response = candidateResponse;
        modelUsed = model;
        break;
      }

      const responseBody = await candidateResponse.text().catch(() => "");
      lastFailure = {
        model,
        status: candidateResponse.status,
        statusText: candidateResponse.statusText,
        responseBody: responseBody.slice(0, 500),
      };
      if (candidateResponse.status !== 404) break;
    }

    if (!response?.ok) {
      logger.error(
        {
          base64Length: imageBase64.length,
          mimeType,
          models: GEMINI_MODELS,
          lastFailure,
        },
        "Gemini food identification request failed",
      );
      res.status(502).json({ message: "The food photo service is unavailable right now." });
      return;
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      logger.error({ base64Length: imageBase64.length, mimeType }, "Gemini returned no food identification text");
      res.status(502).json({ message: "The food photo service returned an empty result. Please try again." });
      return;
    }
    logger.info({ model: modelUsed }, "Gemini food identification succeeded");
    const data = IdentifyFoodResponse.parse({ productName: parseProductName(text) });
    res.json(data);
  } catch (error) {
    logger.error(
      { err: error, base64Length: imageBase64.length, mimeType },
      "Gemini food identification request threw an error",
    );
    res.status(502).json({ message: "We could not identify that photo. Please try another image." });
  }
});

export default router;
