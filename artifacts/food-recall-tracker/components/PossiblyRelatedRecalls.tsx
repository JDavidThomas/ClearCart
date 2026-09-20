import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RecallCard } from '@/components/RecallCard';
import { useColors } from '@/hooks/useColors';
import type { FoodRecall } from '@/types/recall';

interface PossiblyRelatedRecallsProps {
  item: string;
  recalls: FoodRecall[];
}

export function PossiblyRelatedRecalls({ item, recalls }: PossiblyRelatedRecallsProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  if (recalls.length === 0) return null;

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.toggle,
          { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        ]}
        testID="possibly-related-recalls-toggle"
      >
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleTitle, { color: colors.foreground }]}>
            Possibly related recalls ({recalls.length})
          </Text>
          <Text style={[styles.toggleSubtitle, { color: colors.mutedForeground }]}>
            Mentions of {item} in other products
          </Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primary} />
      </Pressable>

      {expanded ? (
        <View style={styles.expandedContent}>
          <View style={[styles.disclaimer, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
            <Feather name="alert-circle" size={17} color={colors.warning} />
            <Text style={[styles.disclaimerText, { color: colors.foreground }]}>
              These recalls mention &quot;{item}&quot; but may not be the same product. Review details carefully.
            </Text>
          </View>
          {recalls.map((recall, index) => (
            <RecallCard
              key={`${recall.recallNumber ?? recall.productDescription}-${index}`}
              recall={recall}
              deemphasized
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  toggle: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  toggleSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  expandedContent: {
    gap: 10,
  },
  disclaimer: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 13,
  },
  disclaimerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
});