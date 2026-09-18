import { Feather } from '@expo/vector-icons';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const FDA_URL = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const USDA_URL = 'https://www.fsis.usda.gov/food-safety/recalls-public-health-alerts';

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { backgroundColor: colors.background, paddingTop: topPadding + 28 },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.successSoft }]}>
        <Feather name="shield" size={28} color={colors.success} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>About Food Recall Tracker</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Search public recall records before you buy, cook, or serve packaged food.
      </Text>

      <View style={[styles.disclaimer, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Feather name="info" size={20} color={colors.warning} />
        <Text style={[styles.disclaimerText, { color: colors.foreground }]}>
          This app is for informational purposes only and is not a substitute for official government recall notices. Always check FDA.gov or USDA.gov for the most current information.
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Official sources</Text>
      <OfficialLink label="FDA recall notices" url={FDA_URL} colors={colors} />
      <OfficialLink label="USDA FSIS recalls" url={USDA_URL} colors={colors} />
    </ScrollView>
  );
}

interface OfficialLinkProps {
  label: string;
  url: string;
  colors: ReturnType<typeof useColors>;
}

function OfficialLink({ label, url, colors }: OfficialLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [
        styles.officialLink,
        { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
      ]}
      testID={`official-link-${label}`}
    >
      <Text style={[styles.officialLinkText, { color: colors.primary }]}>{label}</Text>
      <Feather name="arrow-up-right" size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 44,
    paddingHorizontal: 24,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginTop: 48,
    width: 72,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    marginTop: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 330,
    textAlign: 'center',
  },
  disclaimer: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 30,
    padding: 16,
  },
  disclaimerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    marginTop: 30,
    marginBottom: 10,
  },
  officialLink: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    width: '100%',
    marginTop: 10,
  },
  officialLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
