export const GNEWS_RESULT_LIMIT = 10;
const RECENT_NEWS_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

export interface RecallNewsDateRange {
  from: string;
  to: string;
}

interface GNewsArticle {
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

export function buildGNewsQuery(term: string) {
  const phrase = term.includes(" ") ? `"${term}"` : term;
  return `${phrase} recall`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeGNewsArticles(
  value: unknown,
  from: string,
  to: string,
) {
  if (!Array.isArray(value)) return [];

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);

  return value
    .filter(isRecord)
    .map((article) => article as GNewsArticle)
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
    .slice(0, GNEWS_RESULT_LIMIT);
}