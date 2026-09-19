export function cleanRecallSearchTerm(term: string) {
  return (
    term
      .normalize('NFKC')
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
  if (lowerWord.endsWith('s') && word.length > 1) {
    return word.slice(0, -1);
  }
  return word;
}

function wildcardVariants(word: string) {
  const singular = singularizeWord(word);
  return singular === word
    ? wildcardClause(word)
    : `(${wildcardClause(word)} OR ${wildcardClause(singular)})`;
}

export function buildOpenFdaSearchQuery(term: string) {
  const words = cleanRecallSearchTerm(term).split(' ').filter(Boolean);
  if (words.length === 0) return '';

  if (words.length === 1) {
    const word = words[0];
    const clauses = [wildcardClause(word)];
    if (word.toLowerCase().endsWith('s') && word.length > 1) {
      clauses.push(wildcardClause(word.slice(0, -1)));
    }
    return clauses.join(' OR ');
  }

  const phrase = `product_description:"${words.join(' ')}"`;
  const wildcardPhrase = `product_description:*${words.join(' ')}*`;
  const allWords = words.map(wildcardVariants).join(' AND ');
  return `${phrase} OR ${wildcardPhrase} OR ${allWords}`;
}