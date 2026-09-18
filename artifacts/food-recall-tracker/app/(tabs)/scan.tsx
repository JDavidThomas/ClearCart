import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FDA_NOTICES_URL, FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { RecallCard } from '@/components/RecallCard';
import { useColors } from '@/hooks/useColors';
import {
  lookupOpenFoodFactsProduct,
  searchFoodRecalls,
} from '@/services/recallApi';
import type {
  FoodRecall,
  OpenFoodFactsProduct,
  RecallSearchResult,
} from '@/types/recall';

type ScanState = 'ready' | 'checking' | 'verdict' | 'error';
type VerdictKind = 'safe' | 'recalled' | 'not-found';

interface ScanVerdict {
  kind: VerdictKind;
  barcode: string;
  product?: OpenFoodFactsProduct;
  recallResult?: RecallSearchResult;
}

export default function ScanScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('ready');
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scanLocked = useRef(false);
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const resetScan = () => {
    scanLocked.current = false;
    setScanState('ready');
    setVerdict(null);
    setErrorMessage(null);
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (!data || scanLocked.current) return;
    scanLocked.current = true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setScanState('checking');
    setErrorMessage(null);

    try {
      const product = await lookupOpenFoodFactsProduct(data);
      if (!product) {
        setVerdict({ kind: 'not-found', barcode: data });
        setScanState('verdict');
        return;
      }

      const recallResult = await searchFoodRecalls(product.name);
      setVerdict({
        kind: recallResult.recalls.length > 0 ? 'recalled' : 'safe',
        barcode: data,
        product,
        recallResult,
      });
      setScanState('verdict');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We could not look up this barcode. Please try again.',
      );
      setScanState('error');
      scanLocked.current = false;
    }
  };

  if (!permission) {
    return (
      <StatusScreen
        icon="camera"
        title="Getting the camera ready"
        body="One moment while we check camera access."
        colors={colors}
        topPadding={topPadding}
      >
        <ActivityIndicator color={colors.primary} size="small" />
      </StatusScreen>
    );
  }

  if (!permission.granted) {
    const canOpenSettings = permission.status === 'denied' && !permission.canAskAgain;
    return (
      <StatusScreen
        icon="camera-off"
        title="Camera access needed"
        body="Allow camera access to scan the barcode on a packaged food item."
        colors={colors}
        topPadding={topPadding}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (canOpenSettings && Platform.OS !== 'web') {
              void Linking.openSettings();
            } else {
              void requestPermission();
            }
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
          testID="camera-permission-button"
        >
          <Feather name={canOpenSettings ? 'settings' : 'camera'} size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            {canOpenSettings ? 'Open Settings' : 'Allow Camera Access'}
          </Text>
        </Pressable>
        <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
      </StatusScreen>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding + 22, paddingBottom: Platform.OS === 'web' ? 34 : 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>PRODUCT CHECK</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Scan a product</Text>
          </View>
          <View style={[styles.headingIcon, { backgroundColor: colors.blueSoft }]}>
            <Feather name="maximize" size={22} color={colors.primary} />
          </View>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Hold the barcode inside the frame. We’ll check Open Food Facts, then search active FDA recalls.
        </Text>

        {scanState === 'ready' ? (
          <View style={styles.cameraShell}>
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
              }}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              style={styles.camera}
            >
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame}>
                  <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]} />
                </View>
                <View style={[styles.cameraHint, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.cameraHintText, { color: colors.primaryForeground }]}>
                    Scan UPC or EAN barcode
                  </Text>
                </View>
              </View>
            </CameraView>
          </View>
        ) : scanState === 'checking' ? (
          <CheckingState colors={colors} />
        ) : scanState === 'error' ? (
          <ErrorState
            colors={colors}
            message={errorMessage ?? 'We could not look up this barcode. Please try again.'}
            onRetry={resetScan}
          />
        ) : verdict ? (
          <VerdictView verdict={verdict} colors={colors} onScanAgain={resetScan} />
        ) : null}

        {scanState === 'ready' ? (
          <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
        ) : null}
      </ScrollView>
    </View>
  );
}

interface StatusScreenProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  body: string;
  colors: ReturnType<typeof useColors>;
  topPadding: number;
  children: React.ReactNode;
}

function StatusScreen({ icon, title, body, colors, topPadding, children }: StatusScreenProps) {
  return (
    <View style={[styles.statusScreen, { backgroundColor: colors.background, paddingTop: topPadding + 52 }]}>
      <View style={[styles.statusIcon, { backgroundColor: colors.blueSoft }]}>
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.statusTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.statusBody, { color: colors.mutedForeground }]}>{body}</Text>
      <View style={styles.statusActions}>{children}</View>
    </View>
  );
}

function ManualSearchButton({
  colors,
  onPress,
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      testID="manual-search-button"
    >
      <Feather name="search" size={17} color={colors.primary} />
      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Search by product name</Text>
    </Pressable>
  );
}

function CheckingState({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.feedbackCard, { backgroundColor: colors.blueSoft }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>Checking this product</Text>
      <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
        Looking up the barcode, then checking current FDA recall records.
      </Text>
    </View>
  );
}

function ErrorState({
  colors,
  message,
  onRetry,
}: {
  colors: ReturnType<typeof useColors>;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={[styles.feedbackCard, { backgroundColor: colors.dangerSoft }]}>
      <Feather name="alert-circle" size={28} color={colors.destructive} />
      <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>Couldn’t check this barcode</Text>
      <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.inlineButton, { borderColor: colors.destructive, opacity: pressed ? 0.65 : 1 }]}
        testID="retry-barcode-button"
      >
        <Text style={[styles.inlineButtonText, { color: colors.destructive }]}>Try scanning again</Text>
      </Pressable>
    </View>
  );
}

function VerdictView({
  verdict,
  colors,
  onScanAgain,
}: {
  verdict: ScanVerdict;
  colors: ReturnType<typeof useColors>;
  onScanAgain: () => void;
}) {
  const productLabel = verdict.product
    ? `${verdict.product.brand} ${verdict.product.name}`.trim()
    : `Barcode ${verdict.barcode}`;

  if (verdict.kind === 'not-found') {
    return (
      <View style={[styles.verdictStack, { backgroundColor: colors.background }]}>
        <View style={[styles.verdictCard, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <View style={[styles.verdictIcon, { backgroundColor: colors.warning }]}>
            <Feather name="help-circle" size={25} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.verdictTitle, { color: colors.foreground }]}>Product Not Found</Text>
          <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
            This barcode is not in the Open Food Facts database. Check the product label or search the official FDA notices before eating it.
          </Text>
          <Text style={[styles.barcodeText, { color: colors.mutedForeground }]}>Barcode: {verdict.barcode}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(FDA_NOTICES_URL)}
            style={({ pressed }) => [styles.noticeLink, { opacity: pressed ? 0.65 : 1 }]}
            testID="fda-notices-link"
          >
            <Text style={[styles.noticeLinkText, { color: colors.warning }]}>Check FDA.gov notices</Text>
            <Feather name="external-link" size={15} color={colors.warning} />
          </Pressable>
        </View>
        <ScanAgainButton colors={colors} onPress={onScanAgain} />
      </View>
    );
  }

  const recallResult = verdict.recallResult;
  const hasRecall = verdict.kind === 'recalled';
  const recallCards: FoodRecall[] = recallResult?.recalls ?? [];

  return (
    <View style={styles.verdictStack}>
      <View
        style={[
          styles.verdictCard,
          {
            backgroundColor: hasRecall ? colors.dangerSoft : colors.successSoft,
            borderColor: hasRecall ? colors.destructive : colors.success,
          },
        ]}
      >
        <View
          style={[
            styles.verdictIcon,
            { backgroundColor: hasRecall ? colors.destructive : colors.success },
          ]}
        >
          <Feather name={hasRecall ? 'alert-triangle' : 'check'} size={25} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.verdictTitle, { color: colors.foreground }]}>
          {hasRecall ? 'Recall Found' : 'Safe'}
        </Text>
        <Text style={[styles.productName, { color: colors.foreground }]}>{productLabel}</Text>
        <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
          {hasRecall
            ? 'This product matches an active FDA recall. Review the details below and follow the official notice.'
            : 'No active FDA food or drug recall matched this product name.'}
        </Text>
        {!hasRecall ? <FdaFreshnessNotice colors={colors} /> : null}
        {recallResult?.fromCache ? (
          <View style={[styles.savedPill, { backgroundColor: colors.warningSoft }]}>
            <Feather name="wifi-off" size={13} color={colors.warning} />
            <Text style={[styles.savedPillText, { color: colors.warning }]}>Showing a saved result</Text>
          </View>
        ) : null}
      </View>

      {recallCards.map((recall, index) => (
        <RecallCard key={`${recall.recallNumber ?? recall.productDescription}-${index}`} recall={recall} />
      ))}

      <ScanAgainButton colors={colors} onPress={onScanAgain} />
    </View>
  );
}

function ScanAgainButton({
  colors,
  onPress,
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
      testID="scan-again-button"
    >
      <Feather name="maximize" size={18} color={colors.primaryForeground} />
      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Scan Another Product</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 14,
    paddingHorizontal: 20,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: -0.6,
    marginTop: 5,
  },
  headingIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 350,
  },
  cameraShell: {
    borderRadius: 22,
    height: 420,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scanFrame: {
    height: 150,
    position: 'relative',
    width: 280,
  },
  corner: {
    height: 28,
    position: 'absolute',
    width: 28,
  },
  cornerTopLeft: {
    borderLeftWidth: 3,
    borderTopWidth: 3,
    left: 0,
    top: 0,
  },
  cornerTopRight: {
    borderRightWidth: 3,
    borderTopWidth: 3,
    right: 0,
    top: 0,
  },
  cornerBottomLeft: {
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 0,
    left: 0,
  },
  cornerBottomRight: {
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    right: 0,
  },
  cameraHint: {
    borderRadius: 999,
    marginTop: 28,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cameraHintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  statusScreen: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 28,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  statusTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    marginTop: 22,
    textAlign: 'center',
  },
  statusBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 320,
    textAlign: 'center',
  },
  statusActions: {
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
    width: '100%',
  },
  primaryButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    width: '100%',
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  feedbackCard: {
    alignItems: 'center',
    borderRadius: 20,
    gap: 10,
    padding: 28,
  },
  feedbackTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 3,
  },
  feedbackBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 310,
    textAlign: 'center',
  },
  inlineButton: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inlineButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  verdictStack: {
    gap: 14,
  },
  verdictCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 9,
    padding: 22,
  },
  verdictIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  verdictTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    marginTop: 3,
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
  },
  verdictBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  barcodeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 4,
  },
  noticeLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    marginTop: 2,
  },
  noticeLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  savedPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  savedPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});