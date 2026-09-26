function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function productTextContainsKeyword(text: string, keyword: string) {
  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedText || !normalizedKeyword) return false;

  const expression = normalizedKeyword
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${expression}(?:s|es)?(?=$|[^a-z0-9])`, 'i').test(normalizedText);
}

export function productTextContainsAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => productTextContainsKeyword(text, keyword));
}