import { Feather } from '@expo/vector-icons';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export const FDA_NOTICES_URL =
  'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';

const FDA_INFO_MESSAGE =
  "The FDA's official API updates weekly. Recent recall announcements may not appear in the API right away.";

export function FdaFreshnessNotice({
  colors,
}: {
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.messageRow}>
        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          Recent recalls announced in the last 1–2 weeks may not yet be in the API database. This is not a guarantee that a product is safe.
        </Text>
        <Pressable
          accessibilityLabel="Why recent recalls may be missing"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => Alert.alert('Why recent recalls may be missing', FDA_INFO_MESSAGE)}
          style={({ pressed }) => [
            styles.infoButton,
            { backgroundColor: colors.blueSoft, opacity: pressed ? 0.65 : 1 },
          ]}
          testID="recall-freshness-info"
        >
          <Feather name="info" size={16} color={colors.primary} />
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="Check FDA.gov for Latest Recalls"
        accessibilityRole="button"
        onPress={() => void Linking.openURL(FDA_NOTICES_URL)}
        style={({ pressed }) => [
          styles.fdaButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
        ]}
        testID="check-fda-latest-recalls"
      >
        <Text style={[styles.fdaButtonText, { color: colors.primaryForeground }]}>
          Check FDA.gov for Latest Recalls
        </Text>
        <Feather name="external-link" size={16} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 11,
    width: '100%',
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  message: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  infoButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  fdaButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    width: '100%',
  },
  fdaButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
});