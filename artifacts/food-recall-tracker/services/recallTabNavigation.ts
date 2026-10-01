export type RecallResultTab = 'fda' | 'news';

export function getRecallResultTabIndex(tab: RecallResultTab): 0 | 1 {
  return tab === 'fda' ? 0 : 1;
}

export function getRecallResultPanelContent<T>(
  activeTab: RecallResultTab,
  fdaContent: T,
  newsContent: T,
): T {
  return activeTab === 'fda' ? fdaContent : newsContent;
}

export function getRecallResultTabAfterSwipe(
  currentTab: RecallResultTab,
  horizontalDistance: number,
  threshold = 52,
): RecallResultTab {
  if (Math.abs(horizontalDistance) < threshold) return currentTab;
  return horizontalDistance < 0 ? 'news' : 'fda';
}