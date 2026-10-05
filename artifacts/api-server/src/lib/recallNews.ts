export const NEWS_API_RESULT_LIMIT = 10;
const RECENT_NEWS_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const NON_DIRECT_NEWS_HOSTS = ["biztoc.com", "alltoc.com"] as const;
const NON_DIRECT_NEWS_SOURCE_PREFIXES = ["biztoc", "alltoc"] as const;
const PRODUCT_DESCRIPTOR_WORDS = new Set([
  "chopped",
  "chunky",
  "classic",
  "creamy",
  "diced",
  "fat",
  "frozen",
  "fresh",
  "grated",
  "large",
  "light",
  "low",
  "natural",
  "organic",
  "original",
  "raw",
  "reduced",
  "ready",
  "salted",
  "shredded",
  "sliced",
  "small",
  "smooth",
  "style",
  "unsalted",
  "whole",
]);

export function isNewsApiAllowed(
  nodeEnvironment: string | undefined,
  allowNonDevelopment: string | undefined,
) {
  return (
    nodeEnvironment === "development" ||
    nodeEnvironment === "test" ||
    allowNonDevelopment === "true"
  );
}

export interface RecallNewsDateRange {
  from: string;
  to: string;
}

export interface RecallNewsProductContext {
  brand?: string;
  productName?: string;
}

interface NewsApiArticle {
  title?: unknown;
  description?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  source?: unknown;
}

export function getNewsDateRange(now = new Date()): RecallNewsDateRange {
  return {
    from: new Date(now.getTime() - RECENT_NEWS_WINDOW_MS).toISOString(),
    to: now.toISOString(),
  };
}

export function normalizeNewsSearchTerm(term: string) {
  return term
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNewsWord(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

function getSpecificProductTerms(productName: string, brand?: string) {
  const brandWords = new Set(
    normalizeNewsSearchTerm(brand ?? "").toLowerCase().split(" ").filter(Boolean),
  );

  return normalizeNewsSearchTerm(productName)
    .toLowerCase()
    .split(" ")
    .filter(
      (word) =>
        word &&
        !brandWords.has(word) &&
        !PRODUCT_DESCRIPTOR_WORDS.has(word) &&
        !/^(?:and|of|the|to)$/i.test(word),
    )
    .map(normalizeNewsWord);
}

function isRelevantNewsArticle(
  article: { title: string; description?: string },
  term: string,
  productContext?: RecallNewsProductContext,
) {
  const text = normalizeNewsSearchTerm(
    `${article.title} ${article.description ?? ""}`,
  ).toLowerCase();
  const hasRecallContext =
    /\b(?:recalls?|recalled|withdraw(?:al|n)?|warning|advisory|safety alert|outbreaks?|contaminat\w*|illness(?:es)?|sickened|hospitali[sz]\w*|foodborne|listeria|salmonella|e coli|botulism|foreign object|plastic|undeclared allergen|food poisoning)\b/i.test(text);
  if (!hasRecallContext) return false;

  if (productContext?.productName) {
    const productTerms = getSpecificProductTerms(
      productContext.productName,
      productContext.brand,
    );
    if (productTerms.length === 0) return false;

    const articleWords = new Set(text.split(" ").map(normalizeNewsWord));
    const matchingTerms = productTerms.filter((word) => articleWords.has(word)).length;
    const minimumMatches =
      productTerms.length === 1 ? 1 : Math.min(2, productTerms.length);
    return matchingTerms >= minimumMatches;
  }

  const terms = normalizeNewsSearchTerm(term)
    .toLowerCase()
    .split(" ")
    .filter((word) => word && !/^(recall|recalls)$/i.test(word))
    .map(normalizeNewsWord);
  if (terms.length === 0) return false;

  const articleWords = new Set(text.split(" ").map(normalizeNewsWord));
  if (terms.length >= 4) {
    const brandPhrase = terms.slice(0, 2).join(" ");
    const productPhrase = terms.slice(-3).join(" ");
    if (text.includes(brandPhrase) || text.includes(productPhrase)) return true;
  }

  const matchingTerms = terms.filter((word) => articleWords.has(word)).length;
  const minimumMatches = terms.length === 1 ? 1 : Math.min(2, terms.length);
  return matchingTerms >= minimumMatches;
}

export function buildNewsQuery(
  term: string,
  productContext?: RecallNewsProductContext,
) {
  const productName = normalizeNewsSearchTerm(productContext?.productName ?? "");
  if (productName) {
    const brand = normalizeNewsSearchTerm(productContext?.brand ?? "").toLowerCase();
    const normalizedProductName = productName.toLowerCase();
    const brandWords = new Set(brand.split(" ").filter(Boolean));
    const productNameWithoutBrand = normalizedProductName
      .split(" ")
      .filter((word) => !brandWords.has(word))
      .join(" ");
    const productTerms = getSpecificProductTerms(productNameWithoutBrand, brand);
    const productPhrase =
      productTerms.length > 0
        ? productTerms.join(" ")
        : productNameWithoutBrand || normalizedProductName;
    const fullProductIdentity = [brand, productNameWithoutBrand || normalizedProductName]
      .filter(Boolean)
      .join(" ");
    const brandProductPhrase = [brand, productPhrase].filter(Boolean).join(" ");
    const clauses = [
      fullProductIdentity ? `"${fullProductIdentity}"` : "",
      brandProductPhrase ? `"${brandProductPhrase}"` : "",
      `(${productPhrase} AND recall)`,
    ];

    return [...new Set(clauses.filter(Boolean))].join(" OR ");
  }

  const terms = normalizeNewsSearchTerm(term)
    .split(" ")
    .map((word) => word.toLowerCase())
    .filter((word) => word && !/^(recall|recalls)$/i.test(word));

  if (terms.length === 0) return "recall";
  if (terms.length <= 3) return `${terms.join(" ")} AND recall`;

  const brand = terms.slice(0, 2).join(" ");
  const product = terms.slice(-3).map(normalizeNewsWord).join(" ");

  return `("${brand}" OR "${product}") AND recall`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isKnownNonDirectNewsSource(url: URL, source: string) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const normalizedSource = source.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    NON_DIRECT_NEWS_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    ) ||
    NON_DIRECT_NEWS_SOURCE_PREFIXES.some((prefix) =>
      normalizedSource.startsWith(prefix),
    )
  );
}

export function normalizeNewsArticles(
  value: unknown,
  from: string,
  to: string,
  term?: string,
  productContext?: RecallNewsProductContext,
) {
  if (!Array.isArray(value)) return [];

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);

  return value
    .filter(isRecord)
    .map((article) => article as NewsApiArticle)
    .flatMap((article) => {
      if (
        typeof article.title !== "string" ||
        !article.title.trim() ||
        typeof article.url !== "string" ||
        typeof article.publishedAt !== "string"
      ) {
        return [];
      }

      const publishedAt = Date.parse(article.publishedAt);
      if (
        !Number.isFinite(publishedAt) ||
        publishedAt < fromTime ||
        publishedAt > toTime
      ) {
        return [];
      }

      let url: URL;
      try {
        url = new URL(article.url);
      } catch {
        return [];
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];

      const source = isRecord(article.source) ? article.source.name : undefined;
      if (typeof source !== "string" || !source.trim()) return [];
      if (isKnownNonDirectNewsSource(url, source)) return [];

      return [{
        title: article.title.trim(),
        ...(typeof article.description === "string" && article.description.trim()
          ? { description: article.description.trim() }
          : {}),
        url: url.toString(),
        publishedAt: new Date(publishedAt).toISOString(),
        source: source.trim(),
      }];
    })
    .filter((article) =>
      !term || isRelevantNewsArticle(article, term, productContext),
    )
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, NEWS_API_RESULT_LIMIT);
}