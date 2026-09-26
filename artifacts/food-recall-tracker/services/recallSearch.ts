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

function singularizeWord(word: string) {
  const lowerWord = word.toLowerCase();
  if (lowerWord.endsWith('ies') && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }
  if (lowerWord.endsWith('oes') && word.length > 3) {
    return word.slice(0, -2);
  }
  if (
    lowerWord.endsWith('s') &&
    word.length > 1 &&
    !lowerWord.endsWith('ss') &&
    !lowerWord.endsWith('us') &&
    !lowerWord.endsWith('is') &&
    !lowerWord.endsWith('se')
  ) {
    return word.slice(0, -1);
  }
  return word;
}

function pluralizeWord(word: string) {
  const lowerWord = word.toLowerCase();
  if (lowerWord.endsWith('y') && word.length > 1 && !/[aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}

function wordVariants(word: string) {
  const singular = singularizeWord(word);
  const variants = singular === word ? [word, pluralizeWord(word)] : [word, singular];
  return [...new Set(variants)];
}

export type OpenFdaSearchField = 'recalling_firm' | 'product_description';

function quoteSearchTerm(field: OpenFdaSearchField, term: string) {
  const escapedTerm = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${field}:"${escapedTerm}"`;
}

function buildQuotedAlternatives(field: OpenFdaSearchField, terms: string[]) {
  return [...new Set(terms.filter(Boolean).map((term) => quoteSearchTerm(field, term)))].join(
    ' OR ',
  );
}

export function buildOpenFdaFieldSearchQueries(field: OpenFdaSearchField, term: string) {
  const words = cleanRecallSearchTerm(term).split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const phrase = buildQuotedAlternatives(field, [words.join(' ')]);
  const flexibleWords =
    field === 'product_description'
      ? [...new Set(words.flatMap(wordVariants))]
      : words;
  const flexible = buildQuotedAlternatives(field, flexibleWords);

  return [...new Set([phrase, flexible])];
}

export function buildRecallSearchStrategies(
  term: string,
  options: { brand?: string; productType?: string } = {},
) {
  const normalizeOptional = (value: string | undefined) => {
    const normalized = value ? cleanRecallSearchTerm(value) : '';
    return /^(unknown|unclear|none|null)$/i.test(normalized) ? '' : normalized;
  };
  const normalizedTerm = cleanRecallSearchTerm(term);
  if (!normalizedTerm) return [];

  const brand = normalizeOptional(options.brand);
  const productType = normalizeOptional(options.productType);
  const firmTerms = [...new Set([brand, normalizedTerm].filter(Boolean))];
  const descriptionTerms = [...new Set([productType, normalizedTerm, brand].filter(Boolean))];
  const strategies: Array<{
    field: OpenFdaSearchField;
    term: string;
    query: string;
  }> = [];

  for (const [field, terms] of [
    ['recalling_firm', firmTerms],
    ['product_description', descriptionTerms],
  ] as const) {
    for (const searchTerm of terms) {
      for (const query of buildOpenFdaFieldSearchQueries(field, searchTerm)) {
        strategies.push({ field, term: searchTerm, query });
      }
    }
  }

  return strategies;
}

export function buildOpenFdaSearchQuery(term: string) {
  const words = cleanRecallSearchTerm(term).split(' ').filter(Boolean);
  if (words.length === 0) return '';

  return buildQuotedAlternatives('product_description', [
    words.join(' '),
    ...words.flatMap(wordVariants),
  ]);
}