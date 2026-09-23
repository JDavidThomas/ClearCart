import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OpenFoodFactsNutrition, OpenFoodFactsProduct } from '@/types/recall';

const OPEN_FOOD_FACTS_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const OPEN_FOOD_FACTS_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const CACHE_PREFIX = '@food-recall-tracker/open-food-facts/';

interface OpenFoodFactsPayload {
  status?: number;
  product?: Record<string, unknown>;
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

function parseNutrition(product: Record<string, unknown>): OpenFoodFactsNutrition | undefined {
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
    nutriScoreGrade: asString(product.nutriscore_grade) ?? asString(nutriments.nutriscore_grade),
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

function parseProduct(product: Record<string, unknown>, fallbackBarcode: string) {
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

async function fetchProductByBarcode(barcode: string) {
  const response = await fetch(`${OPEN_FOOD_FACTS_PRODUCT_URL}${encodeURIComponent(barcode)}.json`);
  if (!response.ok) throw new Error('The product database is unavailable right now.');
  const payload = (await response.json()) as OpenFoodFactsPayload;
  return payload.status === 1 && payload.product ? parseProduct(payload.product, barcode) : null;
}

async function fetchProductByName(name: string) {
  const params = new URLSearchParams({
    search_terms: name,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '1',
    fields: 'code,product_name,product_name_en,brands,ingredients_text,ingredients_text_en,allergens,allergens_tags,nutriments,nutriscore_grade,nova_group',
  });
  const response = await fetch(`${OPEN_FOOD_FACTS_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) throw new Error('The product database is unavailable right now.');
  const payload = (await response.json()) as OpenFoodFactsSearchPayload;
  const product = payload.products?.find(isRecord);
  return product ? parseProduct(product, '') : null;
}

export async function lookupOpenFoodFactsProduct(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;
  const key = cacheKey('barcode', normalizedBarcode);
  const cached = await readCachedProduct(key);
  if (cached.hit) return cached.product;
  const product = await fetchProductByBarcode(normalizedBarcode);
  await saveCachedProduct(key, product);
  return product;
}

export async function searchOpenFoodFactsProduct(name: string): Promise<OpenFoodFactsProduct | null> {
  const normalizedName = name.trim();
  if (!normalizedName) return null;
  const key = cacheKey('name', normalizedName);
  const cached = await readCachedProduct(key);
  if (cached.hit) return cached.product;
  const product = await fetchProductByName(normalizedName);
  await saveCachedProduct(key, product);
  return product;
}