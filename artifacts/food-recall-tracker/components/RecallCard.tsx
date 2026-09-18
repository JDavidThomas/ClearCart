import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { FoodRecall } from '@/types/recall';

interface RecallCardProps {
  recall: FoodRecall;
}

function formatRecallDate(date: string) {
  if (date === 'Date not provided') return date;
  const parsedDate = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

export function RecallCard({ recall }: RecallCardProps) {
  const colors = useColors();

  const openOfficialNotice = async () => {
    await Haptics.selectionAsync();
    await Linking.openURL(recall.officialUrl);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
          <Feather name="alert-triangle" size={14} color={colors.destructive} />
          <Text style={[styles.badgeText, { color: colors.destructive }]}>Active recall</Text>
        </View>
        <Text style={[styles.classification, { color: colors.destructive }]}>
          Class {recall.classification.replace(/^Class\s*/i, '')}
        </Text>
      </View>

      <Text style={[styles.description, { color: colors.foreground }]}>
        {recall.productDescription}
      </Text>

      <View style={styles.details}>
        <DetailRow label="Reason" value={recall.reasonForRecall} colors={colors} />
        <DetailRow label="Recalling firm" value={recall.recallingFirm} colors={colors} />
        <DetailRow label="Recall date" value={formatRecallDate(recall.recallDate)} colors={colors} />
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="View official FDA recall notice"
        onPress={openOfficialNotice}
        style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.65 : 1 }]}
        testID="official-recall-link"
      >
        <Text style={[styles.linkText, { color: colors.primary }]}>View official FDA notice</Text>
        <Feather name="external-link" size={15} color={colors.primary} />
      </Pressable>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}

function DetailRow({ label, value, colors }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 16,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  classification: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  description: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    lineHeight: 24,
  },
  details: {
    gap: 11,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  linkButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
  },
  linkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
