import { identifyFood } from '@workspace/api-client-react';

const VISION_REQUEST_TIMEOUT_MS = 30_000;

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_REQUEST_TIMEOUT_MS);

  try {
    const response = await identifyFood(
      { imageBase64, mimeType },
      { signal: controller.signal },
    );
    return response.productName?.trim() || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Food photo identification timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}