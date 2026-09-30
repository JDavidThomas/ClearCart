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

export type OpenFdaSearchField = 'recalling_firm' | 'product_description';

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