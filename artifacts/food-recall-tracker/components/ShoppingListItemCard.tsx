import { Feather } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { isShoppingListCheckStale, type ShoppingListItem } from '@/services/shoppingList';

const FDA_RECALLS_URL = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';

interface ShoppingListItemCardProps {
  item: ShoppingListItem;
  checking: boolean;
  onToggleChecked: () => void;
  onRecheck: () => void;
  onRemove: () => void;
  onViewDetails: () => void;
}

function formatAllergenName(value: string) {
  if (value === 'other') return 'Other';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCheckedAt(value: string | null) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not checked yet';
  return `Checked ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function StatusRow({
  icon,
  label,
  color,
  backgroundColor,
  onPress,
  expanded,
  accessibilityHint,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  color: string;
  backgroundColor: string;
  onPress?: () => void;
  expanded?: boolean;
  accessibilityHint?: string;
}) {
  const content = (
    <>
      <View style={[styles.statusIcon, { backgroundColor }]}>
        <Feather name={icon} size={14} color={color} />
      </View>
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
      {onPress ? (
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={color}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.statusRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ expanded: Boolean(expanded) }}
      onPress={onPress}
      style={({ pressed }) => [styles.statusRow, { opacity: pressed ? 0.68 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function ShoppingListItemCard({
  item,
  checking,
  onToggleChecked,
  onRecheck,
  onRemove,
  onViewDetails,
}: ShoppingListItemCardProps) {
  const colors = useColors();
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [showNewsDetails, setShowNewsDetails] = useState(false);
  const result = item.last_check_result;
  const isStale = isShoppingListCheckStale(item.last_checked_at);

  const recallColor =
    result?.recallStatus === 'active'
      ? colors.destructive
      : result?.recallStatus === 'possibly-related' || result?.recallStatus === 'unavailable'
        ? colors.warning
        : colors.success;
  const allergenColor =
    result?.allergenStatus === 'match'
      ? colors.destructive
      : result?.allergenStatus === 'clear'
        ? colors.success
        : colors.warning;
  const healthColor =
    result?.healthStatus === 'conflicts'
      ? colors.warning
      : result?.healthStatus === 'clear'
        ? colors.success
        : colors.mutedForeground;
  const newsColor =
    result && result.newsArticleCount > 0
      ? colors.primary
      : result?.newsUnavailable
        ? colors.warning
        : colors.success;

  const recallLabel = !result
    ? 'Recall check pending'
    : result.recallStatus === 'active'
      ? `Active recall${result.recallCount > 1 ? ` · ${result.recallCount}` : ''}`
      : result.recallStatus === 'possibly-related'
        ? `Possibly related recall${result.recallCount > 1 ? ` · ${result.recallCount}` : ''}`
      : result.recallStatus === 'unavailable'
        ? 'Check FDA.gov'
        : 'No recalls found';
  const allergenLabel = !result
    ? 'Allergen check pending'
    : result.allergenStatus === 'match'
      ? `Contains your allergens: ${result.allergenMatches.map(formatAllergenName).join(', ')}`
      : result.allergenStatus === 'clear'
        ? 'No allergen matches'
        : result.allergenStatus === 'unavailable'
          ? 'Allergen data unavailable'
          : 'Allergy profile not set up';
  const healthLabel = !result
    ? 'Health check pending'
    : result.healthStatus === 'conflicts'
      ? `${result.healthConflicts.length} health ${result.healthConflicts.length === 1 ? 'conflict' : 'conflicts'}`
      : result.healthStatus === 'clear'
        ? 'No health conflicts found'
        : result.healthStatus === 'unavailable'
          ? 'Health data unavailable'
          : 'Health profile not set up';
  const newsLabel = !result
    ? 'News check pending'
    : result.newsArticleCount > 0
      ? `${result.newsArticleCount} related ${result.newsArticleCount === 1 ? 'article' : 'articles'}`
      : result.newsUnavailable
        ? 'News unavailable'
        : 'No recent news';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: item.is_checked ? 0.72 : 1,
        },
      ]}
      testID={`shopping-list-item-${item.id}`}
    >
      <View style={styles.headerRow}>
        <Pressable
          accessibilityHint="Long press to remove this item"
          accessibilityLabel={`${item.term}. ${formatCheckedAt(item.last_checked_at)}`}
          accessibilityRole="button"
          onLongPress={onRemove}
          style={({ pressed }) => [styles.itemHeading, { opacity: pressed ? 0.72 : 1 }]}
          testID={`shopping-list-item-title-${item.id}`}
        >
          <Text
            numberOfLines={2}
            style={[
              styles.itemTitle,
              {
                color: colors.foreground,
                textDecorationLine: item.is_checked ? 'line-through' : 'none',
              },
            ]}
          >
            {item.term}
          </Text>
          <Text style={[styles.checkedAt, { color: colors.mutedForeground }]}>
            {formatCheckedAt(item.last_checked_at)}
            {isStale && item.last_checked_at ? ' · Recheck recommended' : ''}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={item.is_checked ? `Mark ${item.term} as active` : `Mark ${item.term} complete`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.is_checked }}
          hitSlop={8}
          onPress={onToggleChecked}
          style={({ pressed }) => [styles.checkButton, { opacity: pressed ? 0.65 : 1 }]}
          testID={`shopping-list-check-${item.id}`}
        >
          <Feather
            name={item.is_checked ? 'check-square' : 'square'}
            size={23}
            color={item.is_checked ? colors.success : colors.mutedForeground}
          />
        </Pressable>
      </View>

      <View style={styles.statusList}>
        {result?.recallStatus === 'unavailable' ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(FDA_RECALLS_URL)}
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <StatusRow
              icon="alert-triangle"
              label={recallLabel}
              color={recallColor}
              backgroundColor={colors.warningSoft}
            />
          </Pressable>
        ) : (
          <StatusRow
            icon={
              result?.recallStatus === 'active'
                ? 'alert-circle'
                : result?.recallStatus === 'possibly-related'
                  ? 'alert-triangle'
                  : 'check-circle'
            }
            label={recallLabel}
            color={recallColor}
            backgroundColor={
              result?.recallStatus === 'active'
                ? colors.dangerSoft
                : result?.recallStatus === 'possibly-related'
                  ? colors.warningSoft
                  : colors.successSoft
            }
          />
        )}
        <StatusRow
          icon={
            result?.allergenStatus === 'match'
              ? 'alert-circle'
              : result?.allergenStatus === 'clear'
                ? 'check-circle'
                : 'info'
          }
          label={allergenLabel}
          color={allergenColor}
          backgroundColor={
            result?.allergenStatus === 'match'
              ? colors.dangerSoft
              : result?.allergenStatus === 'clear'
                ? colors.successSoft
                : colors.warningSoft
          }
        />
        <StatusRow
          icon={result?.healthStatus === 'conflicts' ? 'heart' : 'activity'}
          label={healthLabel}
          color={healthColor}
          backgroundColor={
            result?.healthStatus === 'conflicts' ? colors.warningSoft : colors.muted
          }
          onPress={
            result?.healthConflicts.length
              ? () => setShowHealthDetails((current) => !current)
              : undefined
          }
          expanded={showHealthDetails}
          accessibilityHint="Expand health conflict details"
        />
        {showHealthDetails && result?.healthConflicts.length ? (
          <View style={[styles.detailPanel, { backgroundColor: colors.warningSoft }]}>
            {result.healthConflicts.map((conflict, index) => (
              <View key={`${conflict.label}-${index}`} style={styles.detailItem}>
                <Text style={[styles.detailTitle, { color: colors.foreground }]}>
                  {conflict.label}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  {conflict.detail}
                </Text>
              </View>
            ))}
            <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
              Check the product label and consult a qualified health professional for personal
              guidance.
            </Text>
          </View>
        ) : null}
        <StatusRow
          icon="file-text"
          label={newsLabel}
          color={newsColor}
          backgroundColor={
            result && result.newsArticleCount > 0
              ? colors.blueSoft
              : result?.newsUnavailable
                ? colors.warningSoft
                : colors.successSoft
          }
          onPress={
            result?.newsArticleCount
              ? () => setShowNewsDetails((current) => !current)
              : undefined
          }
          expanded={showNewsDetails}
          accessibilityHint="Expand related news articles"
        />
        {showNewsDetails && result?.newsArticles.length ? (
          <View style={[styles.detailPanel, { backgroundColor: colors.blueSoft }]}>
            {result.newsArticles.map((article, index) => (
              <Pressable
                accessibilityRole="link"
                key={`${article.url}-${index}`}
                onPress={() => void Linking.openURL(article.url)}
                style={({ pressed }) => [
                  styles.articleLink,
                  { opacity: pressed ? 0.68 : 1 },
                ]}
              >
                <Text style={[styles.articleTitle, { color: colors.primary }]}>
                  {article.title}
                </Text>
                <Text style={[styles.articleMeta, { color: colors.mutedForeground }]}>
                  {article.source} · {new Date(article.publishedAt).toLocaleDateString()}
                </Text>
                {article.description ? (
                  <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                    {article.description}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          disabled={checking}
          onPress={onRecheck}
          style={({ pressed }) => [
            styles.secondaryAction,
            {
              backgroundColor: colors.secondary,
              opacity: checking || pressed ? 0.65 : 1,
            },
          ]}
          testID={`shopping-list-recheck-${item.id}`}
        >
          {checking ? (
            <Feather name="loader" size={15} color={colors.secondaryForeground} />
          ) : (
            <Feather name="refresh-cw" size={15} color={colors.secondaryForeground} />
          )}
          <Text style={[styles.actionText, { color: colors.secondaryForeground }]}>
            {checking ? 'Checking' : 'Recheck'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onViewDetails}
          style={({ pressed }) => [
            styles.secondaryAction,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 },
          ]}
          testID={`shopping-list-details-${item.id}`}
        >
          <Feather name="external-link" size={15} color={colors.secondaryForeground} />
          <Text style={[styles.actionText, { color: colors.secondaryForeground }]}>
            View details
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityHint="You can also long press the item name to remove it"
        accessibilityRole="button"
        onPress={onRemove}
        style={({ pressed }) => [
          styles.removeAction,
          { opacity: pressed ? 0.62 : 1 },
        ]}
        testID={`shopping-list-remove-${item.id}`}
      >
        <Feather name="trash-2" size={14} color={colors.destructive} />
        <Text style={[styles.removeText, { color: colors.destructive }]}>Remove from list</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 13,
    padding: 15,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  itemHeading: {
    flex: 1,
    gap: 5,
  },
  itemTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 23,
  },
  checkedAt: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  checkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  statusList: {
    gap: 8,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 7,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  statusLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  detailPanel: {
    borderRadius: 12,
    gap: 12,
    marginLeft: 33,
    padding: 12,
  },
  detailItem: {
    gap: 4,
  },
  detailTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  detailText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  disclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  articleLink: {
    gap: 4,
  },
  articleTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
  articleMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  actions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 8,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  removeAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 35,
    paddingHorizontal: 4,
  },
  removeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
