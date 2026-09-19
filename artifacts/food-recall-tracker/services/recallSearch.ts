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

function wildcardClause(word: string) {
  return `product_description:*${word}*`;
}

function singularizeWord(word: string) {
  const lowerWord = word.toLowerCase();
  if (lowerWord.endsWith('ies') && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }
  if (lowerWord.endsWith('ses') && word.length > 3) {
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

function wildcardVariants(word: string) {
  const singular = singularizeWord(word);
  const variants =
    singular === word ? [word, pluralizeWord(word)] : [word, singular];
  const uniqueVariants = [...new Set(variants)];
  return uniqueVariants.length === 1
    ? wildcardClause(uniqueVariants[0])
    : `(${uniqueVariants.map(wildcardClause).join(' OR ')})`;
}

export function buildOpenFdaSearchQuery(term: string) {
  const words = cleanRecallSearchTerm(term).split(' ').filter(Boolean);
  if (words.length === 0) return '';

  if (words.length === 1) {
    return wildcardVariants(words[0]);
  }

  const phrase = `product_description:"${words.join(' ')}"`;
  const wildcardPhrase = `product_description:*${words.join(' ')}*`;
  const allWords = words.map(wildcardVariants).join(' AND ');
  return `${phrase} OR ${wildcardPhrase} OR ${allWords}`;
}