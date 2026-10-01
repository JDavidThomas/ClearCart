import type { RecallNewsArticle } from '../types/recall';

export const RECENT_NEWS_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_RECENT_NEWS_ARTICLES = 3;

export type RecentNewsPanelState = 'articles' | 'empty' | 'unavailable';

export function getRecentNewsPanelState(
  articleCount: number,
  unavailable: boolean,
): RecentNewsPanelState {
  if (articleCount > 0) return 'articles';
  return unavailable ? 'unavailable' : 'empty';
}

export function filterRecentNews(articles: RecallNewsArticle[], now = Date.now()) {
  const cutoff = now - RECENT_NEWS_WINDOW_MS;

  return articles
    .filter((article) => {
      const publishedAt = Date.parse(article.publishedAt);
      return Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now;
    })
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, MAX_RECENT_NEWS_ARTICLES);
}