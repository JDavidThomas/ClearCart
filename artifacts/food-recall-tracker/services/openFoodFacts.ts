import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OpenFoodFactsNutrition, OpenFoodFactsProduct } from '@/types/recall';
import {
  buildOpenFoodFactsSearchStrategies,
  hasIngredientOrAllergenData,
} from './openFoodFactsSearch.ts';

const OPEN_FOOD_FACTS_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const OPEN_FOOD_FACTS_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const CACHE_PREFIX = '@food-recall-tracker/open-food-facts/';
const OPEN_FOOD_FACTS_USER_AGENT = 'Safe Cart/1.0 (contact@safecart.app)';
const OPEN_FOOD_FACTS_RESPONSE_LOG_LIMIT = 4_000;
const OPEN_FOOD_FACTS_REQUEST_TIMEOUT_MS = 5_000;
const OPEN_FOOD_FACTS_HEADERS = {
  'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
  'X-User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
  Accept: 'application/json',
};

async function fetchOpenFoodFacts(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Open Food Facts lookup timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface OpenFoodFactsSearchPayload {
  products?: Record<string, unknown>[];
}

interface CachedProduct {
  product: OpenFoodFactsProduct | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function cacheKey(kind: 'barcode' | 'name', value: string) {
  return `${CACHE_PREFIX}${kind}/${encodeURIComponent(value.trim().toLowerCase())}`;
}

export function getOpenFoodFactsBarcodeCacheKeys(keys: readonly string[]) {
  const barcodePrefix = `${CACHE_PREFIX}barcode/`;
  return keys.filter((key) => key.startsWith(barcodePrefix));
}

export async function clearOpenFoodFactsBarcodeCache() {
  const keys = await AsyncStorage.getAllKeys();
  const barcodeKeys = getOpenFoodFactsBarcodeCacheKeys(keys);
  if (barcodeKeys.length > 0) await AsyncStorage.multiRemove(barcodeKeys);
  return barcodeKeys.length;
}

async function readCachedProduct(key: string): Promise<{ hit: boolean; product: OpenFoodFactsProduct | null }> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return { hit: false, product: null };
    const parsed = JSON.parse(cached) as CachedProduct;
    return { hit: true, product: parsed.product ?? null };
  } catch {
    return { hit: false, product: null };
  }
}

async function saveCachedProduct(key: string, product: OpenFoodFactsProduct | null) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ product } satisfies CachedProduct));
  } catch {
    // A local cache failure should never block a live Open Food Facts lookup.
  }
}

function parseNutriScoreGrade(value: unknown) {
  const grade = asString(value)?.toLowerCase();
  return grade && /^[a-e]$/.test(grade) ? grade : undefined;
}

export function parseNutrition(product: Record<string, unknown>): OpenFoodFactsNutrition | undefined {
  const nutriments = isRecord(product.nutriments) ? product.nutriments : {};
  const sodiumGrams = firstNumber(nutriments, 'sodium_100g', 'sodium_100');
  const potassiumGrams = firstNumber(nutriments, 'potassium_100g', 'potassium_100');
  const nutrition: OpenFoodFactsNutrition = {
    sugars100g: firstNumber(nutriments, 'sugars_100g', 'sugar_100g'),
    sodium100g: sodiumGrams === undefined ? undefined : sodiumGrams * 1000,
    saturatedFat100g: firstNumber(nutriments, 'saturated-fat_100g', 'saturated_fat_100g'),
    carbohydrates100g: firstNumber(nutriments, 'carbohydrates_100g', 'carbohydrate_100g'),
    fiber100g: firstNumber(nutriments, 'fiber_100g', 'fibers_100g'),
    proteins100g: firstNumber(nutriments, 'proteins_100g', 'protein_100g'),
    fat100g: firstNumber(nutriments, 'fat_100g'),
    energyKcal100g: firstNumber(nutriments, 'energy-kcal_100g', 'energy_kcal_100g'),
    potassium100g: potassiumGrams === undefined ? undefined : potassiumGrams * 1000,
    nutriScoreGrade: parseNutriScoreGrade(product.nutriscore_grade) ?? parseNutriScoreGrade(nutriments.nutriscore_grade),
    novaGroup: firstNumber(product, 'nova_group'),
  };

  return Object.values(nutrition).some((value) => value !== undefined) ? nutrition : undefined;
}

function parseAllergens(product: Record<string, unknown>) {
  const labels = asString(product.allergens);
  if (labels) return labels;
  return Array.isArray(product.allergens_tags)
    ? product.allergens_tags.filter((value): value is string => typeof value === 'string').join(', ')
    : undefined;
}

function parseProduct(product: Record<string, unknown>, fallbackBarcode: string): OpenFoodFactsProduct | null {
  const name = asString(product.product_name) ?? asString(product.product_name_en);
  if (!name) return null;

  const code = asString(product.code) ?? fallbackBarcode;
  return {
    barcode: code,
    name,
    brand: asString(product.brands)?.split(',')[0]?.trim() || 'Brand not listed',
    ingredients: asString(product.ingredients_text) ?? asString(product.ingredients_text_en),
    allergens: parseAllergens(product),
    nutrition: parseNutrition(product),
  } satisfies OpenFoodFactsProduct;
}

export function buildOpenFoodFactsBarcodeUrl(barcode: string) {
  return `${OPEN_FOOD_FACTS_PRODUCT_URL}${encodeURIComponent(barcode.trim())}.json`;
}

export function parseOpenFoodFactsBarcodeResponse(
  httpStatus: number,
  responseBody: string,
  barcode: string,
): OpenFoodFactsProduct | null {
  let payload: unknown;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    throw new Error(`Open Food Facts returned invalid JSON (HTTP ${httpStatus}).`);
  }

  if (!isRecord(payload)) {
    throw new Error(`Open Food Facts returned an unexpected response (HTTP ${httpStatus}).`);
  }

  const isSuccessfulHttpStatus = httpStatus >= 200 && httpStatus < 300;
  if (
    payload.status === 0 &&
    (httpStatus === 404 || isSuccessfulHttpStatus)
  ) {
    return null;
  }

  if (!isSuccessfulHttpStatus) {
    throw new Error('The product database is unavailable right now.');
  }
  if (payload.status !== 1 || !isRecord(payload.product)) {
    throw new Error('Open Food Facts returned an unexpected product response.');
  }

  const product = parseProduct(payload.product, barcode);
  if (!product) {
    throw new Error('Open Food Facts returned a product record without a usable name.');
  }
  return product;
}

async function fetchProductByBarcode(barcode: string) {
  const url = buildOpenFoodFactsBarcodeUrl(barcode);
  console.info('[OpenFoodFacts] Barcode request started', { barcode, url });

  let response: Response;
  try {
    response = await fetchOpenFoodFacts(url, { headers: OPEN_FOOD_FACTS_HEADERS });
  } catch (error) {
    console.error('[OpenFoodFacts] Barcode network request failed', {
      barcode,
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('The product database is unavailable right now.');
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error) {
    console.error('[OpenFoodFacts] Barcode response body read failed', {
      barcode,
      url,
      httpStatus: response.status,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('The product database response could not be read.');
  }

  const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
  const responseBodyForLog = isDevelopment
    ? responseBody.slice(0, OPEN_FOOD_FACTS_RESPONSE_LOG_LIMIT)
    : undefined;
  const responseBodyTruncated =
    isDevelopment && responseBody.length > OPEN_FOOD_FACTS_RESPONSE_LOG_LIMIT;
  console.info('[OpenFoodFacts] Barcode HTTP response', {
    barcode,
    url,
    httpStatus: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    responseBody: responseBodyForLog,
    responseBodyLength: responseBody.length,
    responseBodyTruncated,
  });

  try {
    const product = parseOpenFoodFactsBarcodeResponse(response.status, responseBody, barcode);
    console.info('[OpenFoodFacts] Barcode response parsed', {
      barcode,
      url,
      httpStatus: response.status,
      found: Boolean(product),
      productName: product?.name ?? null,
    });
    return product;
  } catch (error) {
    console.error('[OpenFoodFacts] Barcode response parse failed', {
      barcode,
      url,
      httpStatus: response.status,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function fetchProductsBySearchTerm(name: string) {
  const params = new URLSearchParams({
    search_terms: name,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '5',
    fields: 'code,product_name,product_name_en,brands,ingredients_text,ingredients_text_en,allergens,allergens_tags,nutriments,nutriscore_grade,nova_group',
  });
  const response = await fetchOpenFoodFacts(`${OPEN_FOOD_FACTS_SEARCH_URL}?${params.toString()}`, {
    headers: OPEN_FOOD_FACTS_HEADERS,
  });
  if (!response.ok) throw new Error('The product database is unavailable right now.');
  const payload = (await response.json()) as OpenFoodFactsSearchPayload;
  return (payload.products ?? [])
    .filter(isRecord)
    .map((product) => parseProduct(product, ''))
    .filter((product): product is OpenFoodFactsProduct => Boolean(product));
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

function scoreProduct(product: OpenFoodFactsProduct, targetName: string, brand: string) {
  const targetWords = new Set(normalizedWords(targetName));
  const productWords = new Set(normalizedWords(product.name));
  const brandWords = normalizedWords(brand);
  const productBrandWords = new Set(normalizedWords(product.brand));
  const nameOverlap = [...targetWords].filter((word) => productWords.has(word)).length;
  const brandOverlap = brandWords.filter((word) => productBrandWords.has(word)).length;
  const exactName = product.name.toLowerCase() === targetName.toLowerCase() ? 100 : 0;
  return exactName + nameOverlap * 4 + brandOverlap * 8;
}

function selectClosestProduct(products: OpenFoodFactsProduct[], targetName: string, brand: string) {
  return [...products].sort(
    (left, right) => scoreProduct(right, targetName, brand) - scoreProduct(left, targetName, brand),
  )[0] ?? null;
}

export async function lookupOpenFoodFactsProduct(
  barcode: string,
  options: { forceRefresh?: boolean } = {},
): Promise<OpenFoodFactsProduct | null> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) {
    console.error('[OpenFoodFacts] Barcode lookup skipped because the barcode is empty', {
      rawBarcode: barcode,
    });
    return null;
  }
  const key = cacheKey('barcode', normalizedBarcode);
  if (!options.forceRefresh) {
    const cached = await readCachedProduct(key);
    if (cached.hit) {
      console.info('[OpenFoodFacts] Barcode cache hit', {
        barcode: normalizedBarcode,
        found: Boolean(cached.product),
      });
      return cached.product;
    }
    console.info('[OpenFoodFacts] Barcode cache miss', { barcode: normalizedBarcode });
  } else {
    console.info('[OpenFoodFacts] Barcode cache bypassed for a fresh scan', {
      barcode: normalizedBarcode,
    });
  }
  const product = await fetchProductByBarcode(normalizedBarcode);
  await saveCachedProduct(key, product);
  return product;
}

async function searchOpenFoodFactsProductWithStrategies(
  name: string,
  brand = '',
  barcode = '',
  productType = '',
  options: { forceRefresh?: boolean } = {},
): Promise<OpenFoodFactsProduct | null> {
  const normalizedName = name.trim();
  if (!normalizedName) return null;
  const normalizedBrand = /^(unknown|unclear|none|null|not readable)$/i.test(brand.trim()) ? '' : brand.trim();
  const normalizedProductType = /^(unknown|unclear|none|null|not readable)$/i.test(productType.trim())
    ? ''
    : productType.trim();
  const normalizedBarcode = barcode.trim();
  let barcodeProduct: OpenFoodFactsProduct | null = null;
  if (normalizedBarcode) {
    try {
      barcodeProduct = await lookupOpenFoodFactsProduct(normalizedBarcode, {
        forceRefresh: options.forceRefresh,
      });
      console.info('[OpenFoodFacts] Photo barcode lookup completed', {
        barcode: normalizedBarcode,
        found: Boolean(barcodeProduct),
        hasIngredientOrAllergenData: hasIngredientOrAllergenData(barcodeProduct),
      });
      if (hasIngredientOrAllergenData(barcodeProduct)) return barcodeProduct;
    } catch (error) {
      console.info('[OpenFoodFacts] Photo barcode lookup failed; trying name searches', {
        barcode: normalizedBarcode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const strategies = buildOpenFoodFactsSearchStrategies(
    normalizedName,
    normalizedBrand,
    normalizedProductType,
  );
  const key = cacheKey(
    'name',
    `v2|${JSON.stringify([normalizedName, normalizedBrand, normalizedProductType])}`,
  );
  const cached = options.forceRefresh ? { hit: false, product: null } : await readCachedProduct(key);
  if (cached.hit && hasIngredientOrAllergenData(cached.product)) {
    console.info('[OpenFoodFacts] Name search cache hit', {
      productName: normalizedName,
      hasIngredientOrAllergenData: true,
    });
    return cached.product;
  }

  let firstCandidate: OpenFoodFactsProduct | null = null;
  let successfulSearches = 0;
  let lastError: unknown;
  for (const { strategy, searchTerm } of strategies) {
    console.info('[OpenFoodFacts] Name search attempt', {
      productName: normalizedName,
      strategy,
      searchTerm,
    });
    try {
      const products = await fetchProductsBySearchTerm(searchTerm);
      successfulSearches += 1;
      const productsWithAllergenData = products.filter(hasIngredientOrAllergenData);
      const closestWithData = selectClosestProduct(
        productsWithAllergenData,
        normalizedName,
        normalizedBrand,
      );
      console.info('[OpenFoodFacts] Name search result', {
        productName: normalizedName,
        strategy,
        resultCount: products.length,
        resultsWithIngredientOrAllergenData: productsWithAllergenData.length,
        selectedProductName: closestWithData?.name ?? null,
      });

      if (!firstCandidate && products.length > 0) {
        firstCandidate = selectClosestProduct(products, normalizedName, normalizedBrand);
      }
      if (closestWithData) {
        await saveCachedProduct(key, closestWithData);
        console.info('[OpenFoodFacts] Product data selected', {
          productName: normalizedName,
          strategy,
          hasIngredientOrAllergenData: true,
        });
        return closestWithData;
      }
    } catch (error) {
      lastError = error;
      console.info('[OpenFoodFacts] Name search attempt failed', {
        productName: normalizedName,
        strategy,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (successfulSearches === 0 && !barcodeProduct && lastError) throw lastError;
  const fallbackProduct = barcodeProduct ?? firstCandidate;
  console.info('[OpenFoodFacts] Name search exhausted without ingredient or allergen data', {
    productName: normalizedName,
    returnedProduct: Boolean(fallbackProduct),
    nameBasedFallbackRecommended: !hasIngredientOrAllergenData(fallbackProduct),
  });
  return fallbackProduct;
}

export async function searchOpenFoodFactsProduct(
  name: string,
  brand = '',
  barcode = '',
  productType = '',
  options: { forceRefresh?: boolean } = {},
): Promise<OpenFoodFactsProduct | null> {
  const timeoutMs = OPEN_FOOD_FACTS_REQUEST_TIMEOUT_MS;
  console.info('[OpenFoodFacts] Lookup starts', { productName: name, timeoutMs });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      searchOpenFoodFactsProductWithStrategies(name, brand, barcode, productType, options),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Open Food Facts lookup timed out.')),
          timeoutMs,
        );
      }),
    ]);
    console.info('[OpenFoodFacts] Lookup resolves', {
      productName: name,
      found: Boolean(result),
    });
    return result;
  } catch (error) {
    console.info('[OpenFoodFacts] Lookup resolves with fallback', {
      productName: name,
      found: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
