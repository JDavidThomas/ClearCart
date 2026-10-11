import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FamilyCheck } from '@/components/FamilyCheck';
import { useColors } from '@/hooks/useColors';
import { isShoppingListCheckStale, type FrequentItem } from '@/services/shoppingList';

interface FrequentItemCardProps {
  item: FrequentItem;
  adding: boolean;
  onAddToList: () => void;
  onRemove: () => void;
}

function getRecallBadge(item: FrequentItem, colors: ReturnType<typeof useColors>) {
  const status = item.last_check_result?.recallStatus;
  if (status === 'active') {
    return { label: 'Active recall', color: colors.destructive, background: colors.dangerSoft };
  }
  if (status === 'possibly-related') {
    return { label: 'Possible recall', color: colors.warning, background: colors.warningSoft };
  }
  if (status === 'unavailable' || !status) {
    return { label: 'Recall check needed', color: colors.warning, background: colors.warningSoft };
  }
  return { label: 'No recall found', color: colors.success, background: colors.successSoft };
}

function getAllergenBadge(item: FrequentItem, colors: ReturnType<typeof useColors>) {
  const result = item.last_check_result;
  if (result?.allergenStatus === 'match' && result.allergenEvidence === 'ingredient-data') {
    return { label: 'Allergen warning', color: colors.destructive, background: colors.dangerSoft };
  }
  if (
    result?.allergenStatus === 'possible-match' ||
    (result?.allergenStatus === 'match' && result.allergenEvidence !== 'ingredient-data')
  ) {
    return { label: 'Possible allergen', color: colors.warning, background: colors.warningSoft };
  }
  if (result?.allergenStatus === 'clear') {
    return { label: 'No allergen match', color: colors.success, background: colors.successSoft };
  }
  if (result?.allergenStatus === 'not-configured') {
    return { label: 'Profile not set', color: colors.mutedForeground, background: colors.muted };
  }
  return { label: 'Allergen check needed', color: colors.warning, background: colors.warningSoft };
}

export function FrequentItemCard({ item, adding, onAddToList, onRemove }: FrequentItemCardProps) {
  const colors = useColors();
  const checkIsStale = isShoppingListCheckStale(
    item.last_checked_at,
    Date.now(),
    item.last_check_result?.checkVersion ?? null,
  );
  const recallBadge = checkIsStale
    ? { label: 'Recall check needed', color: colors.warning, background: colors.warningSoft }
    : getRecallBadge(item, colors);
  const allergenBadge = checkIsStale
    ? { label: 'Allergen check needed', color: colors.warning, background: colors.warningSoft }
    : getAllergenBadge(item, colors);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID={`frequent-item-${item.id}`}
    >
      <View style={styles.header}>
        <View style={styles.titleCopy}>
          <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
            {item.term}
          </Text>
          <View style={styles.badges}>
            {[recallBadge, allergenBadge].map((badge) => (
              <View
                key={badge.label}
                style={[styles.badge, { backgroundColor: badge.background }]}
              >
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <Pressable
          accessibilityLabel={`Remove ${item.term} from Frequently Bought`}
          accessibilityRole="button"
          onPress={onRemove}
          style={({ pressed }) => [styles.starButton, { opacity: pressed ? 0.6 : 1 }]}
          testID={`frequent-item-remove-${item.id}`}
        >
          <Ionicons name="star" size={21} color={colors.primary} />
        </Pressable>
      </View>
      <FamilyCheck productName={item.term} productText={item.term} />
      <Pressable
        accessibilityRole="button"
        disabled={adding}
        onPress={onAddToList}
        style={({ pressed }) => [
          styles.addButton,
          {
            backgroundColor: colors.primary,
            opacity: adding || pressed ? 0.65 : 1,
          },
        ]}
        testID={`frequent-item-add-${item.id}`}
      >
        <Ionicons name="add" size={18} color={colors.primaryForeground} />
        <Text style={[styles.addText, { color: colors.primaryForeground }]}>
          {adding ? 'Adding…' : 'Add to List'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 13,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  titleCopy: {
    flex: 1,
    gap: 9,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  starButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 36,
  },
  addButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  addText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
});
