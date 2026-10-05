import type { FoodRecall } from '../types/recall.ts';

export function cleanRecallSearchTerm(term: string) {
  return (
    term
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ')
      .trim() ?? ''
  );
}

export type OpenFdaSearchField =
  | 'code_info'
  | 'product_description'
  | 'reason_for_recall'
  | 'recalling_firm';

function quoteSearchTerm(field: OpenFdaSearchField, term: string) {
  const escapedTerm = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${field}:"${escapedTerm}"`;
}

const PRODUCT_DESCRIPTION_WORDS = new Set([
  'canned',
  'chopped',
  'diced',
  'dried',
  'fresh',
  'frozen',
  'large',
  'medium',
  'organic',
  'raw',
  'sliced',
  'small',
  'unsweetened',
  'whole',
]);

export function buildOpenFdaFieldSearchQueries(field: OpenFdaSearchField, term: string) {
  const normalizedTerm = cleanRecallSearchTerm(term);
  return normalizedTerm ? [quoteSearchTerm(field, normalizedTerm)] : [];
}

function mostRelevantProductWord(term: string) {
  const words = cleanRecallSearchTerm(term).split(' ').filter(Boolean);
  return (
    [...words].reverse().find((word) => !PRODUCT_DESCRIPTION_WORDS.has(word.toLowerCase())) ??
    words.at(-1) ??
    ''
  );
}

function firstSearchWord(term: string) {
  return cleanRecallSearchTerm(term).split(' ').filter(Boolean)[0] ?? '';
}

function normalizeOptionalSearchTerm(value?: string) {
  const normalized = value ? cleanRecallSearchTerm(value) : '';
  return /^(unknown|unclear|none|null)$/i.test(normalized) ? '' : normalized;
}

export function buildRecallSearchStrategies(
  term: string,
  options: { brand?: string; productType?: string } = {},
) {
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) return [];

  const productSource = normalizeOptionalSearchTerm(options.productType) || normalizedTerm;
  const brandSource = normalizeOptionalSearchTerm(options.brand) || normalizedTerm;
  const productWord = mostRelevantProductWord(productSource);
  const brandWord = firstSearchWord(brandSource);
  const candidates = [
    {
      field: 'product_description' as const,
      term: normalizedTerm,
      query: quoteSearchTerm('product_description', normalizedTerm),
    },
    ...(productWord && productWord.toLowerCase() !== normalizedTerm.toLowerCase()
      ? [
          {
            field: 'product_description' as const,
            term: productWord,
            query: `product_description:${productWord}`,
          },
        ]
      : []),
    ...(brandWord
      ? [
          {
            field: 'recalling_firm' as const,
            term: brandWord,
            query: `recalling_firm:${brandWord}`,
          },
        ]
      : []),
  ];
  const seenQueries = new Set<string>();

  return candidates.filter((strategy) => {
    const normalizedQuery = strategy.query.toLowerCase();
    if (seenQueries.has(normalizedQuery)) return false;
    seenQueries.add(normalizedQuery);
    return true;
  });
}

export function buildOpenFdaSearchQuery(term: string) {
  return buildOpenFdaFieldSearchQueries('product_description', term)[0] ?? '';
}

function getBarcodeVariants(barcode: string) {
  const digits = barcode.replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1));
  return [...variants];
}

export function buildBarcodeRecallExactSearchQueries(productName: string, barcode: string) {
  const queries = [
    ...buildOpenFdaFieldSearchQueries('product_description', productName),
    ...getBarcodeVariants(barcode).flatMap((variant) => [
      ...buildOpenFdaFieldSearchQueries('code_info', variant),
      ...buildOpenFdaFieldSearchQueries('product_description', variant),
    ]),
  ];
  return [...new Set(queries)];
}

const BARCODE_FALLBACK_GENERIC_WORDS = new Set([
  'and',
  'butter',
  'canned',
  'chopped',
  'chunky',
  'classic',
  'creamy',
  'diced',
  'dried',
  'fresh',
  'frozen',
  'great',
  'large',
  'medium',
  'natural',
  'organic',
  'original',
  'raw',
  'salted',
  'sliced',
  'small',
  'smooth',
  'spread',
  'style',
  'sweetened',
  'unsalted',
  'unsweetened',
  'value',
  'whole',
]);

export function buildBarcodeRecallFallbackSearchQueries(productName: string, brand = '') {
  const brandWords = new Set(
    cleanRecallSearchTerm(brand)
      .toLowerCase()
      .split(' ')
      .filter(Boolean),
  );
  const productWords = cleanRecallSearchTerm(productName)
    .toLowerCase()
    .split(' ')
    .filter((word) => word && !brandWords.has(word));
  const specificWords = productWords.filter(
    (word) => !BARCODE_FALLBACK_GENERIC_WORDS.has(word),
  );
  const searchWords = (specificWords.length ? specificWords : productWords).slice(0, 3);
  const queries = searchWords.flatMap((word) => [
    ...buildOpenFdaFieldSearchQueries('product_description', word),
    ...buildOpenFdaFieldSearchQueries('reason_for_recall', word),
  ]);
  return [...new Set(queries)];
}

function barcodeFieldContains(barcode: string, value: string | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  return getBarcodeVariants(barcode).some((variant) => digits.includes(variant));
}

export function isExactBarcodeRecallMatch(
  recall: FoodRecall,
  productName: string,
  barcode: string,
) {
  const normalizedName = cleanRecallSearchTerm(productName).toLowerCase();
  const normalizedDescription = cleanRecallSearchTerm(recall.productDescription).toLowerCase();
  const nameMatches =
    normalizedName.length > 0 &&
    ` ${normalizedDescription} `.includes(` ${normalizedName} `);

  return (
    nameMatches ||
    barcodeFieldContains(barcode, recall.codeInfo) ||
    barcodeFieldContains(barcode, recall.productDescription)
  );
}