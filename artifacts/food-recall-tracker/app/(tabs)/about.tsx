import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const FDA_URL = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';
const USDA_URL = 'https://www.fsis.usda.gov/food-safety/recalls-public-health-alerts';

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>How it works</Text>
        <HowItWorksStep
          number="1"
          title="Search, scan, or photograph"
          body="Search by product name or ingredient, scan a packaged food barcode, or use AI photo identification for a food package."
          colors={colors}
        />
        <HowItWorksStep
          number="2"
          title="Check public records"
          body="The app checks Open Food Facts for scanned products and searches current FDA food recall records."
          colors={colors}
        />
        <HowItWorksStep
          number="3"
          title="Review the notice"
          body="Read the match details, then open the official notice for the latest guidance."
          colors={colors}
          isLast
        />
      </View>

      <View style={[styles.aiNotice, { backgroundColor: colors.blueSoft, borderColor: colors.primary }]}>
        <Feather name="cpu" size={20} color={colors.primary} />
        <Text style={[styles.aiNoticeText, { color: colors.foreground }]}>
          Photo identification uses AI and may not be 100% accurate. Confirm the identified product name before relying on the recall results.
        </Text>
      </View>

      <View style={[styles.disclaimer, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Feather name="info" size={20} color={colors.warning} />
        <Text style={[styles.disclaimerText, { color: colors.foreground }]}>
          This app is for informational purposes only and is not a substitute for official government recall notices. Always check FDA.gov or USDA.gov for the most current information.
        </Text>
      </View>

      <View style={styles.sourcesSection}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Official sources</Text>
      </View>
      <OfficialLink label="FDA recall notices" url={FDA_URL} colors={colors} />
      <OfficialLink label="USDA FSIS recalls" url={USDA_URL} colors={colors} />

      <View style={[styles.versionRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.versionLabel, { color: colors.mutedForeground }]}>App version</Text>
        <Text style={[styles.versionValue, { color: colors.foreground }]}>{appVersion}</Text>
      </View>
    </ScrollView>
  );
}

interface HowItWorksStepProps {
  number: string;
  title: string;
  body: string;
  colors: ReturnType<typeof useColors>;
  isLast?: boolean;
}

function HowItWorksStep({ number, title, body, colors, isLast = false }: HowItWorksStepProps) {
  return (
    <View style={[styles.step, !isLast && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
      <View style={[styles.stepNumber, { backgroundColor: colors.blueSoft }]}>
        <Text style={[styles.stepNumberText, { color: colors.primary }]}>{number}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{body}</Text>
      </View>
    </View>
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
    paddingBottom: 110,
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
  section: {
    alignSelf: 'stretch',
    marginTop: 30,
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
  aiNotice: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    padding: 16,
  },
  aiNoticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    marginBottom: 10,
  },
  step: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  stepNumber: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepNumberText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  stepCopy: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  stepBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  sourcesSection: {
    alignSelf: 'stretch',
    marginTop: 30,
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
  versionRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    paddingTop: 16,
    width: '100%',
  },
  versionLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  versionValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
});
