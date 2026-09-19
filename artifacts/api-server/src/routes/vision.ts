import { Router, type IRouter } from "express";
import { IdentifyFoodBody, IdentifyFoodResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_IMAGE_BASE64_LENGTH = 8_000_000;
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
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
    res.status(400).json({ message: "That image is too large or uses an unsupported format." });
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Identify the single packaged food product or ingredient shown in this image. Do not identify people, brands alone, or non-food objects. Return only valid JSON in exactly this shape: {"productName":"simple food name"}; if you cannot identify a food confidently, return {"productName":null}.',
                },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      res.status(502).json({ message: "The food photo service is unavailable right now." });
      return;
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const data = IdentifyFoodResponse.parse({ productName: parseProductName(text) });
    res.json(data);
  } catch {
    res.status(502).json({ message: "We could not identify that photo. Please try another image." });
  }
});

export default router;