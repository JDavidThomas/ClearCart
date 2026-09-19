import { identifyFood } from '@workspace/api-client-react';

export async function identifyFoodFromImage(imageBase64: string, mimeType = 'image/jpeg') {
  const response = await identifyFood({ imageBase64, mimeType });
  return response.productName?.trim() || null;
}