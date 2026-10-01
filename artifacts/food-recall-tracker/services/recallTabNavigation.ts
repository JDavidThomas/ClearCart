export type RecallResultTab = 'fda' | 'news';

export function getRecallResultTabAfterSwipe(
  currentTab: RecallResultTab,
  horizontalDistance: number,
  threshold = 52,
): RecallResultTab {
  if (Math.abs(horizontalDistance) < threshold) return currentTab;
  return horizontalDistance < 0 ? 'news' : 'fda';
}