import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { AllergenInsights } from '@/components/AllergenInsights';
import { FamilyCheck } from '@/components/FamilyCheck';
import { HealthDietInsights } from '@/components/HealthInsights';
import { FDA_NOTICES_URL, FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { PossiblyRelatedRecalls } from '@/components/PossiblyRelatedRecalls';
import { ProduceRecallVerdict } from '@/components/ProduceRecallVerdict';
import { RecallCard } from '@/components/RecallCard';
import { RecallRelevanceNotice } from '@/components/RecallRelevanceNotice';
import { RecentNewsSection } from '@/components/RecentNewsSection';
import {
  RecallResultPanels,
  RecallResultTabBar,
  useRecallResultSwipe,
  type RecallResultTab,
} from '@/components/RecallResultTabBar';
import { useColors } from '@/hooks/useColors';
import {
  clearOpenFoodFactsBarcodeCache,
  lookupOpenFoodFactsProduct,
  searchBarcodeFoodRecalls,
} from '@/services/recallApi';
import {
  SCAN_NO_DETECTION_LOG_DELAY_MS,
  SCAN_STEADY_HINT_DELAY_MS,
  SCANNER_BARCODE_TYPES,
  shouldLogNoDetectionWarning,
} from '@/services/barcodeScanner';
import type {
  FoodRecall,
  OpenFoodFactsProduct,
  RecallSearchResult,
} from '@/types/recall';

type ScanState = 'ready' | 'checking' | 'verdict' | 'error';
type VerdictKind = 'safe' | 'recalled' | 'not-found';
type RecallCheckStatus = 'checking' | 'available' | 'unavailable';

interface ScanVerdict {
  attemptId: number;
  kind: VerdictKind;
  barcode: string;
  product?: OpenFoodFactsProduct;
  recallResult?: RecallSearchResult;
  recallCheckStatus?: RecallCheckStatus;
}

function triggerScanSuccessHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error) => {
    console.warn('[Barcode] Haptic feedback failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export default function ScanScreen() {
  const colors = useColors();
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('checking');
  const [scanAttemptId, setScanAttemptId] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [showSteadyHint, setShowSteadyHint] = useState(false);
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scanAttemptCounter = useRef(0);
  const cameraReadyAtRef = useRef<number | null>(null);
  const scanLocked = useRef(false);
  const detectionCallbackCountRef = useRef(0);
  const noDetectionWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const clearNoDetectionWarningTimeout = useCallback(() => {
    if (noDetectionWarningTimeoutRef.current === null) return;
    clearTimeout(noDetectionWarningTimeoutRef.current);
    noDetectionWarningTimeoutRef.current = null;
  }, []);

  const startNewScanAttempt = useCallback(() => {
    clearNoDetectionWarningTimeout();
    const attemptId = scanAttemptCounter.current + 1;
    scanAttemptCounter.current = attemptId;
    scanLocked.current = false;
    detectionCallbackCountRef.current = 0;
    cameraReadyAtRef.current = null;
    setScanAttemptId(attemptId);
    setCameraReady(false);
    setShowSteadyHint(false);
    setScanState('checking');
    setVerdict(null);
    setErrorMessage(null);
    console.info('[Barcode] Scan attempt started; clearing cached barcode results', { attemptId });
    void clearOpenFoodFactsBarcodeCache()
      .then((removedCount) => {
        if (attemptId !== scanAttemptCounter.current) return;
        console.info('[Barcode] Barcode cache cleared before camera opens', {
          attemptId,
          removedCount,
        });
        setScanState('ready');
      })
      .catch((error) => {
        if (attemptId !== scanAttemptCounter.current) return;
        console.error('[Barcode] Barcode cache clearing failed; fresh lookup will bypass cache', {
          attemptId,
          error: error instanceof Error ? error.message : String(error),
        });
        setScanState('ready');
      });
  }, [clearNoDetectionWarningTimeout]);

  useFocusEffect(
    useCallback(() => {
      startNewScanAttempt();
      return () => {
        const endedAttemptId = scanAttemptCounter.current;
        scanAttemptCounter.current = endedAttemptId + 1;
        scanLocked.current = false;
        cameraReadyAtRef.current = null;
        setCameraReady(false);
        clearNoDetectionWarningTimeout();
        console.info('[Barcode] Scan attempt left', { attemptId: endedAttemptId });
      };
    }, [clearNoDetectionWarningTimeout, startNewScanAttempt]),
  );

  useEffect(() => {
    if (!permission) return;
    console.info('[Barcode] Camera permission state', {
      granted: permission.granted,
      status: permission.status,
      canAskAgain: permission.canAskAgain,
    });
  }, [permission?.granted, permission?.status, permission?.canAskAgain]);

  useEffect(() => {
    if (!isFocused || !permission?.granted || scanState !== 'ready') return;
    console.info('[Barcode] Camera view mounted; waiting for barcode', {
      attemptId: scanAttemptId,
      barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'],
    });
  }, [isFocused, permission?.granted, scanAttemptId, scanState]);

  useEffect(() => {
    if (!isFocused || !permission?.granted || scanState !== 'ready' || !cameraReady) return;
    setShowSteadyHint(false);
    const hintTimeout = setTimeout(() => {
      if (scanAttemptId !== scanAttemptCounter.current) return;
      setShowSteadyHint(true);
      console.info('[Barcode] Steadying hint displayed after no detection', {
        attemptId: scanAttemptId,
        waitMs: SCAN_STEADY_HINT_DELAY_MS,
      });
    }, SCAN_STEADY_HINT_DELAY_MS);
    noDetectionWarningTimeoutRef.current = setTimeout(() => {
      noDetectionWarningTimeoutRef.current = null;
      if (
        !shouldLogNoDetectionWarning({
          attemptId: scanAttemptId,
          activeAttemptId: scanAttemptCounter.current,
          cameraReady: cameraReadyAtRef.current !== null,
          screenFocused: isFocused,
          scanLocked: scanLocked.current,
          scanState,
        })
      ) {
        return;
      }
      console.warn('[Barcode] No barcode detected after waiting', {
        attemptId: scanAttemptId,
        waitMs: SCAN_NO_DETECTION_LOG_DELAY_MS,
        barcodeTypes: SCANNER_BARCODE_TYPES,
      });
    }, SCAN_NO_DETECTION_LOG_DELAY_MS);
    return () => {
      clearTimeout(hintTimeout);
      clearNoDetectionWarningTimeout();
    };
  }, [
    cameraReady,
    clearNoDetectionWarningTimeout,
    isFocused,
    permission?.granted,
    scanAttemptId,
    scanState,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      scanState !== 'verdict' ||
      !verdict ||
      verdict.attemptId !== scanAttemptId ||
      verdict.attemptId !== scanAttemptCounter.current
    ) {
      return;
    }
    console.info('[Barcode] Result displayed', {
      attemptId: verdict.attemptId,
      barcode: verdict.barcode,
      productName: verdict.product?.name ?? null,
      recallCheckStatus: verdict.recallCheckStatus ?? 'available',
      result: verdict.kind,
    });
  }, [isFocused, scanAttemptId, scanState, verdict]);

  const resetScan = startNewScanAttempt;

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    const { data, raw, type } = result;
    const callbackSequence = ++detectionCallbackCountRef.current;
    const cameraReadyAt = cameraReadyAtRef.current;
    console.info('[Barcode] Barcode detection callback', {
      attemptId: scanAttemptId,
      callbackSequence,
      rawBarcode: data,
      rawPayload: raw ?? null,
      format: type,
      elapsedSinceCameraReadyMs:
        cameraReadyAt === null ? null : Date.now() - cameraReadyAt,
    });
    if (scanAttemptId !== scanAttemptCounter.current) {
      console.info('[Barcode] Detection from inactive scan attempt ignored', {
        eventAttemptId: scanAttemptId,
        activeAttemptId: scanAttemptCounter.current,
        rawBarcode: data,
        format: type,
      });
      return;
    }
    clearNoDetectionWarningTimeout();
    if (typeof data !== 'string' || !data.trim()) {
      console.error('[Barcode] Empty barcode detected', {
        attemptId: scanAttemptId,
        rawBarcode: data,
        rawPayload: raw ?? null,
        format: type,
      });
      return;
    }
    if (scanLocked.current) {
      console.info('[Barcode] Duplicate barcode detection ignored', {
        attemptId: scanAttemptId,
        rawBarcode: data,
        rawPayload: raw ?? null,
        format: type,
      });
      return;
    }
    scanLocked.current = true;
    const barcode = data.trim();
    console.info('[Barcode] Barcode detected', {
      attemptId: scanAttemptId,
      rawBarcode: data,
      rawPayload: raw ?? null,
      barcode,
      format: type,
    });
    triggerScanSuccessHaptic();
    setCameraReady(false);
    setShowSteadyHint(false);
    setScanState('checking');
    setVerdict(null);
    setErrorMessage(null);

    try {
      const lookupStartedAt = Date.now();
      console.info('[Barcode] Open Food Facts lookup started', {
        attemptId: scanAttemptId,
        barcode,
      });
      const product = await lookupOpenFoodFactsProduct(barcode, { forceRefresh: true });
      if (scanAttemptId !== scanAttemptCounter.current) {
        console.info('[Barcode] Stale product lookup result ignored', {
          attemptId: scanAttemptId,
          activeAttemptId: scanAttemptCounter.current,
          barcode,
        });
        return;
      }
      console.info('[Barcode] Open Food Facts lookup completed', {
        attemptId: scanAttemptId,
        barcode,
        found: Boolean(product),
        elapsedMs: Date.now() - lookupStartedAt,
        productName: product?.name ?? null,
        brand: product?.brand ?? null,
        hasIngredients: Boolean(product?.ingredients),
        hasAllergenData: Boolean(product?.allergens),
      });
      if (!product) {
        console.info('[Barcode] Result displayed', {
          attemptId: scanAttemptId,
          barcode,
          productName: null,
          recallCheckStatus: 'not-run',
          result: 'not-found',
        });
        setVerdict({ attemptId: scanAttemptId, kind: 'not-found', barcode });
        triggerScanSuccessHaptic();
        setScanState('verdict');
        return;
      }

      setVerdict({
        attemptId: scanAttemptId,
        kind: 'safe',
        barcode,
        product,
        recallCheckStatus: 'checking',
      });
      setScanState('verdict');

      try {
        console.info('[Barcode] FDA search started', {
          attemptId: scanAttemptId,
          barcode,
          productName: product.name,
          brand: product.brand,
        });
        const recallStartedAt = Date.now();
        const recallResult = await searchBarcodeFoodRecalls(product, barcode);
        if (scanAttemptId !== scanAttemptCounter.current) {
          console.info('[Barcode] Stale FDA lookup result ignored', {
            attemptId: scanAttemptId,
            activeAttemptId: scanAttemptCounter.current,
            barcode,
          });
          return;
        }
        console.info('[Barcode] FDA search completed', {
          attemptId: scanAttemptId,
          barcode,
          productName: product.name,
          recallCount: recallResult.recalls.length,
              possiblyRelatedCount: recallResult.relatedRecalls?.length ?? 0,
          elapsedMs: Date.now() - recallStartedAt,
          fromCache: recallResult.fromCache,
        });
        setVerdict({
          attemptId: scanAttemptId,
          kind: recallResult.recalls.length > 0 ? 'recalled' : 'safe',
          barcode,
          product,
          recallResult,
          recallCheckStatus: 'available',
        });
      } catch (error) {
        if (scanAttemptId !== scanAttemptCounter.current) {
          console.info('[Barcode] Stale FDA lookup error ignored', {
            attemptId: scanAttemptId,
            activeAttemptId: scanAttemptCounter.current,
            barcode,
          });
          return;
        }
        console.info('[Barcode] FDA recall lookup failed', {
          attemptId: scanAttemptId,
          barcode,
          productName: product.name,
          brand: product.brand,
          error: error instanceof Error ? error.message : String(error),
        });
        setVerdict({
          attemptId: scanAttemptId,
          kind: 'safe',
          barcode,
          product,
          recallCheckStatus: 'unavailable',
        });
      }
      triggerScanSuccessHaptic();
    } catch (error) {
      if (scanAttemptId !== scanAttemptCounter.current) {
        console.info('[Barcode] Stale scan error ignored', {
          attemptId: scanAttemptId,
          activeAttemptId: scanAttemptCounter.current,
          barcode,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We could not look up this barcode. Please try again.',
      );
      console.error('[Barcode] Scan flow failed', {
        attemptId: scanAttemptId,
        barcode,
        stage: 'Open Food Facts lookup',
        error: error instanceof Error ? error.message : String(error),
      });
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
              console.info('[Barcode] Camera permission requested');
              void requestPermission()
                .then((result) => {
                  console.info('[Barcode] Camera permission response', {
                    granted: result.granted,
                    status: result.status,
                    canAskAgain: result.canAskAgain,
                  });
                })
                .catch((error) => {
                  console.info('[Barcode] Camera permission request failed', {
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
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
          { paddingTop: topPadding + 22, paddingBottom: 110 },
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

        {scanState === 'ready' && isFocused ? (
          <View style={styles.cameraShell}>
            <CameraView
              key={scanAttemptId}
              barcodeScannerSettings={{
                barcodeTypes: SCANNER_BARCODE_TYPES,
              }}
              autofocus="on"
              facing="back"
              onCameraReady={() => {
                if (scanAttemptId !== scanAttemptCounter.current) {
                  console.info('[Barcode] Camera ready event from inactive attempt ignored', {
                    eventAttemptId: scanAttemptId,
                    activeAttemptId: scanAttemptCounter.current,
                  });
                  return;
                }
                const cameraReadyAt = Date.now();
                cameraReadyAtRef.current = cameraReadyAt;
                clearNoDetectionWarningTimeout();
                setVerdict(null);
                setErrorMessage(null);
                setShowSteadyHint(false);
                setCameraReady(true);
                console.info('[Barcode] Camera opened; barcode scanning started', {
                  attemptId: scanAttemptId,
                  cameraReadyAt,
                  scannerEnabled: true,
                  staleResultCleared: true,
                  barcodeTypes: SCANNER_BARCODE_TYPES,
                });
              }}
              onMountError={({ message }) => {
                console.error('[Barcode] Camera mount failed', {
                  attemptId: scanAttemptId,
                  error: message,
                });
              }}
              onBarcodeScanned={handleBarcodeScanned}
              style={styles.camera}
            />
            <View pointerEvents="none" style={styles.cameraOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} />
                <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
                <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]} />
                <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]} />
              </View>
              <View style={[styles.cameraHint, { backgroundColor: colors.foreground }]}>
                <Text style={[styles.cameraHintText, { color: colors.primaryForeground }]}>
                  {showSteadyHint
                    ? 'Hold steady and keep the barcode centered'
                    : 'Point the camera at any barcode'}
                </Text>
              </View>
            </View>
          </View>
        ) : scanState === 'checking' ? (
          <CheckingState colors={colors} />
        ) : scanState === 'error' ? (
          <ErrorState
            colors={colors}
            message={errorMessage ?? 'We could not look up this barcode. Please try again.'}
            onRetry={resetScan}
          />
        ) : verdict &&
          verdict.attemptId === scanAttemptId &&
          verdict.attemptId === scanAttemptCounter.current ? (
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
  label = 'Search by product name',
  testID = 'manual-search-button',
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      testID={testID}
    >
      <Feather name="search" size={17} color={colors.primary} />
      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{label}</Text>
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
  const router = useRouter();
  const [activeResultTab, setActiveResultTab] = useState<RecallResultTab>('fda');
  const swipeHandlers = useRecallResultSwipe(activeResultTab, setActiveResultTab);
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
            We checked this barcode, but this product isn’t in our product database. Try searching by name or taking a photo of the product label.
          </Text>
          <Text style={[styles.barcodeText, { color: colors.mutedForeground }]}>Barcode: {verdict.barcode}</Text>
          <ManualSearchButton
            colors={colors}
            label="Search manually instead"
            onPress={() =>
              void router.push({
                pathname: '/',
                params: { searchPrefill: verdict.barcode },
              })
            }
            testID="search-manually-instead-button"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Open the camera or photo library to identify this product with a photo."
            onPress={() => void router.push('/photo-check')}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
            ]}
            testID="take-product-photo-instead-button"
          >
            <Feather name="camera" size={17} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              Take a photo of the product instead
            </Text>
          </Pressable>
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
        <AllergenInsights productName="" productText="" dataAvailable={false} source="barcode" colors={colors} />
        <HealthDietInsights productName="" productText="" source="barcode" colors={colors} />
        <ScanAgainButton colors={colors} onPress={onScanAgain} />
      </View>
    );
  }

  const recallResult = verdict.recallResult;
  const hasRecall = verdict.kind === 'recalled';
  const recallCheckStatus = verdict.recallCheckStatus ?? 'available';
  const recallCards: FoodRecall[] = recallResult?.recalls ?? [];
  const relatedRecalls = recallResult?.relatedRecalls ?? [];
  const produceItem = recallResult?.produceItem ?? productLabel;
  const recentNews = recallResult?.recentNews ?? [];
  const newsUnavailableRaw = recallResult?.newsUnavailable;
  const newsUnavailable = newsUnavailableRaw === true;

  if (recallResult?.isProduceSearch) {
    return (
      <View style={styles.verdictStack}>
        <BarcodeProductIdentityCard
          barcode={verdict.barcode}
          productLabel={productLabel}
          colors={colors}
        />
        <AllergenInsights
          productName={productLabel}
          productText={buildProductAllergenText(verdict.product)}
          dataAvailable={hasAllergenData(verdict.product)}
          source="barcode"
          colors={colors}
        />
        <FamilyCheck
          productName={productLabel}
          productText={buildProductAllergenText(verdict.product)}
          product={verdict.product}
        />
        <RecallResultTabBar
          activeTab={activeResultTab}
          onChangeTab={setActiveResultTab}
        />
        <RecallResultPanels
          activeTab={activeResultTab}
          source="barcode"
          swipeHandlers={swipeHandlers}
          newsArticleCount={recentNews.length}
          newsUnavailableRaw={newsUnavailableRaw}
          newsUnavailable={newsUnavailable}
          fdaSummary={
            recallCards.length > 0
              ? `${recallCards.length} FDA recall card(s)`
              : 'produce verdict: No active FDA recalls found'
          }
          newsSummary={
            recentNews.length > 0
              ? `${recentNews.length} article(s): ${recentNews.map((article) => article.title).join(' | ')}${newsUnavailable ? ' (news source unavailable)' : ''}`
              : newsUnavailable
                ? 'unavailable state: no news articles received'
                : 'empty state: No recent news found for this product'
          }
          fdaContent={
            <>
              <Text style={[styles.recallSectionTitle, { color: colors.foreground }]}>
                Official FDA Recalls
              </Text>
              <ProduceRecallVerdict item={produceItem} hasDirectRecall={recallCards.length > 0} />
              {recallCards.map((recall, index) => (
                <RecallCard
                  key={`${recall.recallNumber ?? recall.productDescription}-${index}`}
                  recall={recall}
                />
              ))}
              <PossiblyRelatedRecalls item={produceItem} recalls={relatedRecalls} />
            </>
          }
          newsContent={
            <RecentNewsSection articles={recentNews} unavailable={newsUnavailable} />
          }
        />
        <HealthDietInsights
          productName={productLabel}
          productText={`${verdict.product?.ingredients ?? ''} ${verdict.product?.allergens ?? ''}`}
          product={verdict.product}
          source="barcode"
          colors={colors}
        />
        <ScanAgainButton colors={colors} onPress={onScanAgain} />
        <SearchByNameButton colors={colors} onPress={() => void router.push('/')} />
      </View>
    );
  }

  return (
    <View style={styles.verdictStack}>
      <BarcodeProductIdentityCard
        barcode={verdict.barcode}
        productLabel={productLabel}
        colors={colors}
      />
      <AllergenInsights
        productName={productLabel}
        productText={buildProductAllergenText(verdict.product)}
        dataAvailable={hasAllergenData(verdict.product)}
        source="barcode"
        colors={colors}
      />
      <FamilyCheck
        productName={productLabel}
        productText={buildProductAllergenText(verdict.product)}
        product={verdict.product}
      />
      <RecallResultTabBar
        activeTab={activeResultTab}
        onChangeTab={setActiveResultTab}
      />
      <RecallResultPanels
        activeTab={activeResultTab}
        source="barcode"
        swipeHandlers={swipeHandlers}
        newsArticleCount={recentNews.length}
        newsUnavailableRaw={newsUnavailableRaw}
        newsUnavailable={newsUnavailable}
        fdaSummary={
          recallCheckStatus === 'checking'
            ? 'FDA recall check in progress'
            : recallCheckStatus === 'unavailable'
              ? 'FDA recall check unavailable'
              : hasRecall
                ? `${recallCards.length} FDA recall card(s)`
                : 'empty state: No active recalls for this product'
        }
        newsSummary={
          recentNews.length > 0
            ? `${recentNews.length} article(s): ${recentNews.map((article) => article.title).join(' | ')}${newsUnavailable ? ' (news source unavailable)' : ''}`
            : newsUnavailable
              ? 'unavailable state: no news articles received'
              : 'empty state: No recent news found for this product'
        }
        fdaContent={
          <>
          <Text style={[styles.recallSectionTitle, { color: colors.foreground }]}>
            Official FDA Recalls
          </Text>
          <View
            style={[
              styles.verdictCard,
              {
                backgroundColor:
                  hasRecall
                    ? colors.dangerSoft
                    : recallCheckStatus === 'unavailable' || recallCheckStatus === 'checking'
                      ? colors.blueSoft
                      : colors.successSoft,
                borderColor:
                  hasRecall
                    ? colors.destructive
                    : recallCheckStatus === 'unavailable' || recallCheckStatus === 'checking'
                      ? colors.primary
                      : colors.success,
              },
            ]}
          >
            <View
              style={[
                styles.verdictIcon,
                {
                  backgroundColor:
                    hasRecall
                      ? colors.destructive
                      : recallCheckStatus === 'unavailable' || recallCheckStatus === 'checking'
                        ? colors.primary
                        : colors.success,
                },
              ]}
            >
              {recallCheckStatus === 'checking' ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Feather
                  name={
                    hasRecall
                      ? 'alert-triangle'
                      : recallCheckStatus === 'unavailable'
                        ? 'info'
                        : 'check'
                  }
                  size={25}
                  color={colors.primaryForeground}
                />
              )}
            </View>
            <Text style={[styles.verdictTitle, { color: colors.foreground }]}>
              {recallCheckStatus === 'checking'
                ? 'Checking FDA Recalls'
                : recallCheckStatus === 'unavailable'
                  ? 'FDA Recall Check Unavailable'
                  : hasRecall
                    ? 'Recall Found'
                   : 'No Active Recalls for This Product'}
            </Text>
            <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
              {recallCheckStatus === 'checking'
                ? 'The product was found. Checking its name and brand against current FDA recall records.'
                : recallCheckStatus === 'unavailable'
                  ? 'The product was found, but FDA recall records could not be checked. This is not confirmation that the product has no recall.'
                  : hasRecall
                    ? 'This product matches an active FDA recall. Review the details below and follow the official notice.'
                    : 'No active FDA recalls were found for this product. Possibly related recalls, if any, are listed below for review.'}
            </Text>
            {recallCheckStatus === 'available' && !hasRecall ? <FdaFreshnessNotice colors={colors} /> : null}
            {recallResult?.fromCache ? (
              <View style={[styles.savedPill, { backgroundColor: colors.warningSoft }]}>
                <Feather name="wifi-off" size={13} color={colors.warning} />
                <Text style={[styles.savedPillText, { color: colors.warning }]}>Showing a saved result</Text>
              </View>
            ) : null}
          </View>

          <RecallRelevanceNotice message={recallResult?.relevanceNotice} />
          {recallCards.map((recall, index) => (
            <RecallCard
              key={`${recall.recallNumber ?? recall.productDescription}-${index}`}
              recall={recall}
            />
          ))}

          <PossiblyRelatedRecalls item={productLabel} recalls={relatedRecalls} />
          </>
        }
        newsContent={
          <RecentNewsSection articles={recentNews} unavailable={newsUnavailable} />
        }
      />
      <HealthDietInsights
        productName={productLabel}
        productText={`${verdict.product?.ingredients ?? ''} ${verdict.product?.allergens ?? ''}`}
        product={verdict.product}
        source="barcode"
        colors={colors}
      />
      <ScanAgainButton colors={colors} onPress={onScanAgain} />
      <SearchByNameButton colors={colors} onPress={() => void router.push('/')} />
    </View>
  );
}

function BarcodeProductIdentityCard({
  barcode,
  productLabel,
  colors,
}: {
  barcode: string;
  productLabel: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.productIdentityCard,
        { backgroundColor: colors.blueSoft, borderColor: colors.border },
      ]}
    >
      <Feather name="check-circle" size={22} color={colors.primary} />
      <Text style={[styles.productIdentityEyebrow, { color: colors.primary }]}>
        PRODUCT IDENTIFIED
      </Text>
      <Text style={[styles.productName, { color: colors.foreground }]}>{productLabel}</Text>
      <Text style={[styles.barcodeText, { color: colors.mutedForeground }]}>
        Barcode: {barcode}
      </Text>
    </View>
  );
}

function buildProductAllergenText(product?: OpenFoodFactsProduct) {
  return `${product?.ingredients ?? ''} ${product?.allergens ?? ''}`;
}

function hasAllergenData(product?: OpenFoodFactsProduct) {
  return Boolean(product?.ingredients?.trim() || product?.allergens?.trim());
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

function SearchByNameButton({
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
      style={({ pressed }) => [
        styles.searchByNameButton,
        { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
      ]}
      testID="search-by-name-button"
    >
      <Feather name="search" size={17} color={colors.primary} />
      <Text style={[styles.searchByNameText, { color: colors.primary }]}>Search by name</Text>
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
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
  productIdentityCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  productIdentityEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  recallSectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 2,
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
  searchByNameButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  searchByNameText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
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