import type { OpenFoodFactsProduct } from '@/types/recall';

export interface OpenFoodFactsSearchStrategy {
  strategy: 'exact-product-name' | 'brand-and-product-type' | 'product-type';
  searchTerm: string;
}

function cleanSearchValue(value: string) {
  const normalized = value.trim();
  return /^(unknown|unclear|none|null|not readable)$/i.test(normalized) ? '' : normalized;
}

function normalizeSearchTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function inferProductType(name: string, brand: string) {
  if (!brand) return name;
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutLeadingBrand = name.replace(new RegExp(`^${escapedBrand}[\\s,:-]*`, 'i'), '').trim();
  return withoutLeadingBrand || name;
}

export function buildOpenFoodFactsSearchStrategies(
  productName: string,
  brand = '',
  productType = '',
): OpenFoodFactsSearchStrategy[] {
  const name = cleanSearchValue(productName);
  const cleanedBrand = cleanSearchValue(brand);
  const cleanedProductType = cleanSearchValue(productType) || inferProductType(name, cleanedBrand);
  if (!name) return [];

  const candidates: OpenFoodFactsSearchStrategy[] = [
    { strategy: 'exact-product-name', searchTerm: name },
  ];
  if (cleanedBrand && cleanedProductType) {
    candidates.push({
      strategy: 'brand-and-product-type',
      searchTerm: `${cleanedBrand} ${cleanedProductType}`,
    });
  }
  if (cleanedProductType) {
    candidates.push({ strategy: 'product-type', searchTerm: cleanedProductType });
  }

  const seen = new Set<string>();
  return candidates.filter(({ searchTerm }) => {
    const key = normalizeSearchTerm(searchTerm);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasIngredientOrAllergenData(
  product: Pick<OpenFoodFactsProduct, 'ingredients' | 'allergens'> | null | undefined,
) {
  return Boolean(product?.ingredients?.trim() || product?.allergens?.trim());
}