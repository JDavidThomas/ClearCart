import { Feather } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function ScanPlaceholderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topPadding + 28 },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.blueSoft }]}>
        <Feather name="maximize" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Scan a product</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Barcode scanning and label photos are coming next. For now, search by product name from Home.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 28,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginTop: 72,
    width: 72,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    marginTop: 22,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 310,
    textAlign: 'center',
  },
});
