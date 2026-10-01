import { Feather, Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  getRecallResultPanelContent,
  getRecallResultTabIndex,
  getRecallResultTabAfterSwipe,
  type RecallResultTab,
} from '@/services/recallTabNavigation';

export type { RecallResultTab } from '@/services/recallTabNavigation';

export function useRecallResultSwipe(
  activeTab: RecallResultTab,
  onChangeTab: (tab: RecallResultTab) => void,
) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 20 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          const nextTab = getRecallResultTabAfterSwipe(activeTab, gesture.dx);
          if (nextTab !== activeTab) onChangeTab(nextTab);
        },
      }).panHandlers,
    [activeTab, onChangeTab],
  );
}

export function RecallResultTabBar({
  activeTab,
  onChangeTab,
}: {
  activeTab: RecallResultTab;
  onChangeTab: (tab: RecallResultTab) => void;
}) {
  const colors = useColors();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID="recall-result-tabs"
    >
      <Pressable
        accessibilityHint="Swipe left to show News & Updates."
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'fda' }}
        onPress={() => onChangeTab('fda')}
        style={({ pressed }) => [
          styles.tab,
          activeTab === 'fda'
            ? { backgroundColor: colors.primary }
            : { backgroundColor: 'transparent' },
          { opacity: pressed ? 0.75 : 1 },
        ]}
        testID="fda-recalls-tab"
      >
        <Feather
          name="shield"
          size={16}
          color={activeTab === 'fda' ? colors.primaryForeground : colors.mutedForeground}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: activeTab === 'fda' ? colors.primaryForeground : colors.mutedForeground },
          ]}
        >
          FDA Recalls
        </Text>
      </Pressable>

      <Pressable
        accessibilityHint="Swipe right to show FDA Recalls."
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'news' }}
        onPress={() => onChangeTab('news')}
        style={({ pressed }) => [
          styles.tab,
          activeTab === 'news'
            ? { backgroundColor: colors.primary }
            : { backgroundColor: 'transparent' },
          { opacity: pressed ? 0.75 : 1 },
        ]}
        testID="news-updates-tab"
      >
        <Ionicons
          name="newspaper-outline"
          size={17}
          color={activeTab === 'news' ? colors.primaryForeground : colors.mutedForeground}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: activeTab === 'news' ? colors.primaryForeground : colors.mutedForeground },
          ]}
        >
          News & Updates
        </Text>
      </Pressable>
    </View>
  );
}

export function RecallResultPanels({
  activeTab,
  source,
  fdaSummary,
  newsSummary,
  fdaContent,
  newsContent,
  swipeHandlers,
}: {
  activeTab: RecallResultTab;
  source: 'search' | 'photo' | 'barcode';
  fdaSummary: string;
  newsSummary: string;
  fdaContent: ReactNode;
  newsContent: ReactNode;
  swipeHandlers: ReturnType<typeof useRecallResultSwipe>;
}) {
  const activeIndex = getRecallResultTabIndex(activeTab);
  const renderedSummary = getRecallResultPanelContent(activeTab, fdaSummary, newsSummary);
  const renderedContent = getRecallResultPanelContent(activeTab, fdaContent, newsContent);

  useEffect(() => {
    console.info('[RecallResultTabs] panel render', {
      source,
      activeIndex,
      activeTab,
      fdaPanel: fdaSummary,
      newsPanel: newsSummary,
      renderedPanel: activeTab === 'fda' ? 'FDA Recalls' : 'News & Updates',
      renderedContent: renderedSummary,
    });
  }, [activeIndex, activeTab, fdaSummary, newsSummary, renderedSummary, source]);

  return (
    <View
      {...swipeHandlers}
      accessibilityLabel={`${activeTab === 'fda' ? 'FDA Recalls' : 'News & Updates'} panel`}
      style={styles.panel}
      testID={activeTab === 'fda' ? 'fda-recalls-panel' : 'news-updates-panel'}
    >
      {renderedContent}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 7,
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  panel: {
    gap: 12,
  },
});