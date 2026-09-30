export const NEWS_API_RESULT_LIMIT = 10;
const RECENT_NEWS_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

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

export function buildNewsQuery(term: string) {
  const terms = normalizeNewsSearchTerm(term)
    .split(" ")
    .map((word) => word.toLowerCase())
    .filter((word) => word && !/^(recall|recalls)$/i.test(word));

  if (terms.length === 0) return "recall";
  if (terms.length <= 3) return `${terms.join(" ")} AND recall`;

  const brand = terms.slice(0, 2).join(" ");
  const product = terms.slice(-3).map((word) => {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) {
      return word.slice(0, -1);
    }
    return word;
  }).join(" ");

  return `("${brand}" OR "${product}") AND recall`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeNewsArticles(
  value: unknown,
  from: string,
  to: string,
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
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, NEWS_API_RESULT_LIMIT);
}