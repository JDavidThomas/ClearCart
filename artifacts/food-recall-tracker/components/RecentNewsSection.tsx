import { Feather, Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecallNewsArticle } from '@/types/recall';
import { useColors } from '@/hooks/useColors';
import {
  getRecentNewsPanelState,
  MAX_RECENT_NEWS_ARTICLES,
} from '@/services/recallNewsFilters';

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RecentNewsSection({
  articles,
  unavailable,
}: {
  articles: RecallNewsArticle[];
  unavailable?: boolean;
}) {
  const colors = useColors();
  const visibleArticles = articles.slice(0, MAX_RECENT_NEWS_ARTICLES);
  const isUnavailable = unavailable === true;
  const panelState = getRecentNewsPanelState(visibleArticles.length, isUnavailable);

  useEffect(() => {
    console.info('[RecallNewsPanel] content render', {
      unavailable: isUnavailable,
      articleCount: visibleArticles.length,
      renderedState: panelState,
      articles: visibleArticles.map(({ title, source }) => ({ title, source })),
    });
  }, [articles, isUnavailable, panelState, visibleArticles.length]);

  return (
    <View
      accessibilityLabel="Recent News and Updates"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID="recent-news-section"
    >
      <View style={styles.heading}>
        <View style={[styles.iconBox, { backgroundColor: colors.blueSoft }]}>
          <Ionicons name="newspaper-outline" size={19} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Recent News &amp; Updates
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Latest news and outbreak information related to this product
          </Text>
        </View>
      </View>

      {isUnavailable && panelState === 'articles' ? (
        <Text
          style={[styles.emptyMessage, { color: colors.mutedForeground }]}
          testID="recent-news-refresh-warning"
        >
          The news source could not be refreshed. Showing the recent articles already received.
        </Text>
      ) : null}

      {panelState === 'unavailable' ? (
        <Text
          style={[styles.emptyMessage, { color: colors.mutedForeground }]}
          testID="recent-news-unavailable"
        >
          Recent news is temporarily unavailable. Please try again later.
        </Text>
      ) : panelState === 'empty' ? (
        <Text
          style={[styles.emptyMessage, { color: colors.mutedForeground }]}
          testID="recent-news-empty"
        >
          No recent news found for this product
        </Text>
      ) : (
        <View style={styles.articleList}>
          {visibleArticles.map((article, index) => (
            <Pressable
              accessibilityHint="Opens the full news article."
              accessibilityRole="link"
              key={`${article.url}-${index}`}
              onPress={() => {
                void Linking.openURL(article.url).catch(() => {
                  console.warn('[RecallNews] Unable to open article link');
                });
              }}
              style={({ pressed }) => [
                styles.article,
                { borderTopColor: colors.border, opacity: pressed ? 0.65 : 1 },
              ]}
              testID={`recent-news-article-${index + 1}`}
            >
              <View style={styles.articleCopy}>
                <Text style={[styles.articleTitle, { color: colors.foreground }]}>
                  {article.title}
                </Text>
                <Text style={[styles.articleMeta, { color: colors.mutedForeground }]}>
                  {article.source} · {formatPublishedDate(article.publishedAt)}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={16} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
        These are news articles, not official FDA announcements. Verify with the source.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headingCopy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 2,
  },
  articleList: {
    marginTop: -4,
  },
  article: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  articleCopy: {
    flex: 1,
    gap: 5,
  },
  articleTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 20,
  },
  articleMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  disclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
});