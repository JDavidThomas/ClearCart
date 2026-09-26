import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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
import { AllergenInsights } from '@/components/AllergenInsights';
import { HealthDietInsights } from '@/components/HealthInsights';
import { FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { PossiblyRelatedRecalls } from '@/components/PossiblyRelatedRecalls';
import { RecallCard } from '@/components/RecallCard';
import { RecallRelevanceNotice } from '@/components/RecallRelevanceNotice';
import { useColors } from '@/hooks/useColors';
import {
  type FoodIdentification,
  identifyFoodFromImage,
  isPossiblyTruncatedProductName,
  isUsableProductName,
} from '@/services/visionApi';
import { searchFoodRecalls } from '@/services/recallApi';
import { searchOpenFoodFactsProduct } from '@/services/openFoodFacts';
import type { OpenFoodFactsNutrition, OpenFoodFactsProduct, RecallSearchResult } from '@/types/recall';

type PhotoState = 'ready' | 'identifying' | 'checking' | 'confirming' | 'verdict' | 'error';
type RecallCheckStatus = 'checking' | 'available' | 'unavailable';
const GEMINI_IMAGE_LONGEST_SIDE = 1568;
const FDA_NOTICES_URL = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts';

interface PhotoVerdict extends FoodIdentification {
  recallResult: RecallSearchResult | null;
  recallCheckStatus: RecallCheckStatus;
  nutritionProduct: OpenFoodFactsProduct;
  nutritionSource: 'open-food-facts' | 'photo' | 'none';
}

export default function PhotoCheckScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [photoState, setPhotoState] = useState<PhotoState>('ready');
  const [verdict, setVerdict] = useState<PhotoVerdict | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const photoRequestId = useRef(0);
  const topPadding = insets.top;

  const reset = () => {
    photoRequestId.current += 1;
    setPhotoState('ready');
    setVerdict(null);
    setImageUri(null);
    setErrorMessage(null);
  };

  const checkProduct = (productName: string, identification: FoodIdentification) => {
    const requestId = ++photoRequestId.current;
    const fallbackNutritionProduct = buildPhotoNutritionProduct(productName, identification);
    const updateVerdict = (update: Partial<PhotoVerdict>) => {
      if (photoRequestId.current !== requestId) return;
      setVerdict((current) => (current ? { ...current, ...update } : current));
    };

    setVerdict({
      ...identification,
      productName,
      recallResult: null,
      recallCheckStatus: 'checking',
      nutritionProduct: fallbackNutritionProduct,
      nutritionSource: hasNutritionData(fallbackNutritionProduct) ? 'photo' : 'none',
    });
    setPhotoState('verdict');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    console.info('[Photo] Open Food Facts lookup attempt', {
      productName,
      brand: identification.brand,
      productType: identification.productType,
      barcodeAvailable: Boolean(identification.barcode),
    });
    void searchOpenFoodFactsProduct(
      productName,
      identification.brand,
      identification.barcode ?? '',
      identification.productType,
    )
      .then((nutritionProduct) => {
        const resolvedProduct = nutritionProduct ?? fallbackNutritionProduct;
        const hasOpenFoodFactsNutrition = Boolean(nutritionProduct && hasNutritionData(nutritionProduct));
        const hasOpenFoodFactsAllergenData = hasAllergenData(nutritionProduct);
        console.info('[Photo] Open Food Facts nutrition lookup', {
          productName,
          apiCallSucceeded: true,
          returnedProduct: Boolean(nutritionProduct),
          returnedNutritionData: hasOpenFoodFactsNutrition,
          returnedAllergenData: hasOpenFoodFactsAllergenData,
          nameBasedAllergenFallbackNeeded: !hasOpenFoodFactsAllergenData,
        });
        updateVerdict({
          nutritionProduct: resolvedProduct,
          nutritionSource: hasOpenFoodFactsNutrition
            ? 'open-food-facts'
            : hasNutritionData(resolvedProduct)
              ? 'photo'
              : 'none',
        });
      })
      .catch((error) => {
        console.info('[Photo] Open Food Facts nutrition lookup failed', {
          productName,
          apiCallSucceeded: false,
          returnedNutritionData: false,
          error: error instanceof Error ? error.message : String(error),
        });
        updateVerdict({
          nutritionProduct: fallbackNutritionProduct,
          nutritionSource: hasNutritionData(fallbackNutritionProduct) ? 'photo' : 'none',
        });
      });

    void searchFoodRecalls(productName, {
      brand: identification.brand,
      productType: identification.productType,
    })
      .then((recallResult) => {
        console.info('[Photo] FDA recall check', {
          productName,
          apiCallSucceeded: true,
          returnedResults: recallResult.recalls.length > 0,
          recallCount: recallResult.recalls.length,
        });
        updateVerdict({ recallResult, recallCheckStatus: 'available' });
      })
      .catch((error) => {
        console.info('[Photo] FDA recall check failed', {
          productName,
          apiCallSucceeded: false,
          returnedResults: false,
          error: error instanceof Error ? error.message : String(error),
        });
        updateVerdict({ recallResult: null, recallCheckStatus: 'unavailable' });
      });
  };

  const processAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const sourceWidth = asset.width || GEMINI_IMAGE_LONGEST_SIDE;
    const sourceHeight = asset.height || GEMINI_IMAGE_LONGEST_SIDE;
    const resizeAction =
      Math.max(sourceWidth, sourceHeight) === GEMINI_IMAGE_LONGEST_SIDE
        ? []
        : [
            {
              resize:
                sourceWidth >= sourceHeight
                  ? { width: GEMINI_IMAGE_LONGEST_SIDE }
                  : { height: GEMINI_IMAGE_LONGEST_SIDE },
            },
          ];
    // Keep enough pixels for small package text. The target is applied in both
    // directions so smaller gallery images are upscaled rather than sent blurry.
    const encodedImage = await ImageManipulator.manipulateAsync(
      asset.uri,
      resizeAction,
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!encodedImage.base64) throw new Error('We could not read that photo. Please try again.');

    setImageUri(asset.uri);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhotoState('identifying');

    const identification = await identifyFoodFromImage(encodedImage.base64, 'image/jpeg');
    console.info('[Gemini] normalized photo scanner JSON', JSON.stringify(identification, null, 2));
    console.info('[Photo] Product identification result', {
      productName: identification.fullName,
      brand: identification.brand,
      productType: identification.productType,
      barcodeAvailable: Boolean(identification.barcode && identification.barcode !== 'unknown'),
      confidence: identification.confidence,
      sourceOfIdentification: identification.sourceOfIdentification,
    });
    const identifiedProductName = isUsableProductName(identification.fullName)
      ? identification.fullName
      : null;
    const contextSearchTerm = isUsableContextText(identification.contextText)
      ? identification.contextText.trim()
      : null;
    const searchTerm = identifiedProductName || contextSearchTerm || null;
    console.info('[Photo] Gemini identification', {
      identifiedProduct: Boolean(identifiedProductName),
      productName: identifiedProductName,
      contextTextAvailable: Boolean(contextSearchTerm),
    });

    if (!searchTerm) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVerdict({
        ...identification,
        productName: null,
        recallResult: null,
        recallCheckStatus: 'unavailable',
        nutritionProduct: buildPhotoNutritionProduct('unknown', identification),
        nutritionSource: 'none',
      });
      setPhotoState('verdict');
      return;
    }

    if (identifiedProductName && isPossiblyTruncatedProductName(identifiedProductName)) {
      setVerdict({
        ...identification,
        productName: identifiedProductName,
        recallResult: null,
        recallCheckStatus: 'checking',
        nutritionProduct: buildPhotoNutritionProduct(identifiedProductName, identification),
        nutritionSource: hasNutritionData(buildPhotoNutritionProduct(identifiedProductName, identification))
          ? 'photo'
          : 'none',
      });
      setPhotoState('confirming');
      return;
    }

    await checkProduct(searchTerm, identification);
  };

  const confirmProduct = async () => {
    const productName = verdict?.productName;
    if (!productName) return;

    try {
      await checkProduct(productName, verdict);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not check that product. Please try again.');
      setPhotoState('error');
    }
  };

  const takePhoto = async () => {
    setErrorMessage(null);
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setErrorMessage(
          result.canAskAgain
            ? 'Camera access is needed to take a photo. You can choose an existing image from your gallery instead.'
            : 'Camera access is off. Choose an image from your gallery or enable camera access in Settings.',
        );
        setPhotoState('error');
      }
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        base64: false,
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('We could not read that photo. Please try again.');
      await processAsset(asset);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'We could not check that photo. Please try again.',
      );
      setPhotoState('error');
    }
  };

  const chooseFromGallery = async () => {
    setErrorMessage(null);
    if (!libraryPermission?.granted) {
      const result = await requestLibraryPermission();
      if (!result.granted) {
        setErrorMessage('Photo library access is needed to choose an image. You can take a new photo instead.');
        setPhotoState('error');
      }
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: false,
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('We could not read that photo. Please try again.');
      await processAsset(asset);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'We could not check that photo. Please try again.',
      );
      setPhotoState('error');
    }
  };

  if (!cameraPermission) {
    return (
      <StatusScreen
        colors={colors}
        topPadding={topPadding}
        icon="camera"
        title="Getting the camera ready"
        body="One moment while we check camera access."
      >
        <ActivityIndicator color={colors.primary} size="small" />
      </StatusScreen>
    );
  }

  if (!cameraPermission.granted) {
    const canOpenSettings = cameraPermission.status === 'denied' && !cameraPermission.canAskAgain;
    return (
      <StatusScreen
        colors={colors}
        topPadding={topPadding}
        icon="camera-off"
        title="Camera access needed"
        body="Allow camera access to take a product photo. Recall searching and barcode scanning remain available."
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (canOpenSettings && Platform.OS !== 'web') void Linking.openSettings();
            else void takePhoto();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
          testID="photo-permission-button"
        >
          <Feather name={canOpenSettings ? 'settings' : 'camera'} size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            {canOpenSettings ? 'Open Settings' : 'Allow Camera Access'}
          </Text>
        </Pressable>
        <GalleryButton colors={colors} onPress={() => void chooseFromGallery()} />
        <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
      </StatusScreen>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPadding + 22, paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>PRODUCT CHECK</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Take a photo</Text>
          </View>
          <View style={[styles.headingIcon, { backgroundColor: colors.successSoft }]}>
            <Feather name="camera" size={22} color={colors.success} />
          </View>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Photograph the front of a food product. We’ll identify it, then check current FDA recall records.
        </Text>

        {photoState === 'ready' ? (
          <View style={[styles.readyCard, { backgroundColor: colors.blueSoft }]}>
            <View style={[styles.readyIcon, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={26} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>Ready when you are</Text>
            <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
              Keep the package label visible and use good lighting for the best product match.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void takePhoto()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
              ]}
              testID="take-photo-now-button"
            >
              <Feather name="camera" size={18} color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Take a Photo</Text>
            </Pressable>
            <GalleryButton colors={colors} onPress={() => void chooseFromGallery()} />
          </View>
        ) : photoState === 'identifying' || photoState === 'checking' ? (
          <View style={[styles.feedbackCard, { backgroundColor: colors.blueSoft }]}>
            {imageUri ? (
              <View style={[styles.photoBadge, { backgroundColor: colors.primary }]}>
                <Feather name="image" size={18} color={colors.primaryForeground} />
              </View>
            ) : null}
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>
              {photoState === 'identifying' ? 'Processing photo…' : 'Checking this product'}
            </Text>
            <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
              {photoState === 'identifying'
                ? 'Sending a high-resolution photo securely for identification.'
                : 'Searching current FDA food and drug recall records.'}
            </Text>
          </View>
        ) : photoState === 'confirming' && verdict?.productName ? (
          <PhotoConfirmationView
            colors={colors}
            productName={verdict.productName}
            sourceOfIdentification={verdict.sourceOfIdentification}
            onConfirm={() => void confirmProduct()}
            onManualSearch={() => router.push('/')}
            onRetake={reset}
          />
        ) : photoState === 'error' ? (
          <View style={[styles.feedbackCard, { backgroundColor: colors.blueSoft, borderColor: colors.border, borderWidth: 1 }]}>
            <Feather name="info" size={28} color={colors.primary} />
            <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>We couldn’t process that photo</Text>
            <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
              {errorMessage ?? 'Please try another photo.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              style={({ pressed }) => [
                styles.inlineButton,
                { borderColor: colors.primary, opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text style={[styles.inlineButtonText, { color: colors.primary }]}>Try another photo</Text>
            </Pressable>
            <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
          </View>
        ) : verdict ? (
          <PhotoVerdictView verdict={verdict} colors={colors} onRetake={reset} />
        ) : null}

        {photoState === 'ready' ? (
          <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatusScreen({
  colors,
  topPadding,
  icon,
  title,
  body,
  children,
}: {
  colors: ReturnType<typeof useColors>;
  topPadding: number;
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  body: string;
  children: React.ReactNode;
}) {
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
  label = 'Search manually instead',
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      testID="photo-manual-search-button"
    >
      <Feather name="search" size={17} color={colors.primary} />
      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function GalleryButton({
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
        styles.secondaryButton,
        { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
      ]}
      testID="choose-photo-button"
    >
      <Feather name="image" size={17} color={colors.primary} />
      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Choose from Gallery</Text>
    </Pressable>
  );
}

function PhotoConfirmationView({
  colors,
  productName,
  sourceOfIdentification,
  onConfirm,
  onManualSearch,
  onRetake,
}: {
  colors: ReturnType<typeof useColors>;
  productName: string;
  sourceOfIdentification: FoodIdentification['sourceOfIdentification'];
  onConfirm: () => void;
  onManualSearch: () => void;
  onRetake: () => void;
}) {
  return (
    <View style={[styles.feedbackCard, { backgroundColor: colors.warningSoft }]}>
      <View style={[styles.verdictIcon, { backgroundColor: colors.warning }]}>
        <Feather name="help-circle" size={25} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>Check this product name</Text>
      <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
        We identified this as:
      </Text>
      <Text style={[styles.confirmedProductName, { color: colors.foreground }]}>{productName}</Text>
      <IdentificationBadge source={sourceOfIdentification} colors={colors} />
      <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
        Confirm it before we search FDA recall records.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
        ]}
        testID="confirm-product-button"
      >
        <Feather name="check" size={18} color={colors.primaryForeground} />
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Yes, check recalls</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onManualSearch}
        style={({ pressed }) => [
          styles.secondaryButton,
          { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
        ]}
        testID="manual-search-from-confirmation-button"
      >
        <Feather name="search" size={17} color={colors.primary} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>No, search manually</Text>
      </Pressable>
      <RetakeButton colors={colors} onPress={onRetake} />
    </View>
  );
}

function PhotoVerdictView({
  verdict,
  colors,
  onRetake,
}: {
  verdict: PhotoVerdict;
  colors: ReturnType<typeof useColors>;
  onRetake: () => void;
}) {
  const router = useRouter();
  if (!verdict.productName) {
    return (
      <PhotoSuggestionView
        colors={colors}
        onManualSearch={() => router.push('/')}
        onRetake={onRetake}
      />
    );
  }

  const recalls = verdict.recallResult?.recalls ?? [];
  const relatedRecalls = verdict.recallResult?.relatedRecalls ?? [];
  const produceItem = verdict.recallResult?.produceItem ?? verdict.productName;

  return (
    <View style={styles.verdictStack}>
      <ProductIdentityCard verdict={verdict} colors={colors} />
      <AllergenInsights
        productName={verdict.productName}
        productText={`${verdict.nutritionProduct.ingredients ?? ''} ${verdict.nutritionProduct.allergens ?? ''}`}
        dataAvailable={hasAllergenData(verdict.nutritionProduct)}
        source="photo"
        colors={colors}
      />
      <HealthDietInsights
        productName={verdict.productName}
        productText={`${verdict.nutritionProduct.ingredients ?? ''} ${verdict.nutritionProduct.allergens ?? ''}`}
        product={verdict.nutritionProduct}
        source="photo"
        colors={colors}
      />
      <PhotoFdaRecallCard verdict={verdict} colors={colors} />
      {recalls.length > 0 ? <RecallRelevanceNotice message={verdict.recallResult?.relevanceNotice} /> : null}
      {recalls.map((recall, index) => (
        <RecallCard key={`${recall.recallNumber ?? recall.productDescription}-${index}`} recall={recall} />
      ))}
      {verdict.recallCheckStatus === 'available' ? (
        <PossiblyRelatedRecalls item={produceItem} recalls={relatedRecalls} />
      ) : null}
      <RetakeButton colors={colors} onPress={onRetake} />
    </View>
  );
}

function ProductIdentityCard({
  verdict,
  colors,
}: {
  verdict: PhotoVerdict;
  colors: ReturnType<typeof useColors>;
}) {
  const nutritionAvailable = hasNutritionData(verdict.nutritionProduct);
  return (
    <View style={[styles.identityCard, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
      <View style={[styles.verdictIcon, { backgroundColor: colors.primary }]}>
        <Feather name="check" size={25} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.identityEyebrow, { color: colors.primary }]}>PRODUCT IDENTIFIED</Text>
      <Text style={[styles.identityName, { color: colors.foreground }]}>{verdict.productName}</Text>
      <View style={styles.identityDetails}>
        {verdict.brand !== 'unknown' ? (
          <Text style={[styles.identityDetail, { color: colors.mutedForeground }]}>
            Brand: {verdict.brand}
          </Text>
        ) : null}
        {verdict.productType !== 'unknown' ? (
          <Text style={[styles.identityDetail, { color: colors.mutedForeground }]}>
            Type: {verdict.productType}
          </Text>
        ) : null}
        {verdict.flavor !== 'unknown' ? (
          <Text style={[styles.identityDetail, { color: colors.mutedForeground }]}>
            Flavor: {verdict.flavor}
          </Text>
        ) : null}
      </View>
        <IdentificationBadge source={verdict.sourceOfIdentification} colors={colors} />
      {nutritionAvailable && verdict.recallCheckStatus === 'unavailable' ? (
        <Text style={[styles.photoDisclaimer, { color: colors.mutedForeground }]}>
          {verdict.nutritionSource === 'open-food-facts'
            ? 'Product identified from photo. Nutrition data from Open Food Facts. This is not medical advice.'
            : 'Product identified from photo. Nutrition data read from the package. This is not medical advice.'}
        </Text>
      ) : null}
    </View>
  );
}

function PhotoFdaRecallCard({
  verdict,
  colors,
}: {
  verdict: PhotoVerdict;
  colors: ReturnType<typeof useColors>;
}) {
  if (verdict.recallCheckStatus === 'checking') {
    return (
      <View style={[styles.fdaStatusCard, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} size="small" />
        <View style={styles.fdaStatusCopy}>
          <Text style={[styles.fdaStatusTitle, { color: colors.foreground }]}>Checking FDA recalls</Text>
          <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
            Searching the current FDA recall database separately from product identification.
          </Text>
        </View>
      </View>
    );
  }

  if (verdict.recallCheckStatus === 'unavailable') {
    return (
      <View style={[styles.fdaStatusCard, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
        <Feather name="info" size={24} color={colors.primary} />
        <View style={styles.fdaStatusCopy}>
          <Text style={[styles.fdaStatusTitle, { color: colors.foreground }]}>
            FDA recall check unavailable
          </Text>
          <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
            ℹ️ We couldn&apos;t reach the FDA recall database right now. You can still review the product&apos;s nutrition info below, or check FDA.gov directly.
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(FDA_NOTICES_URL)}
            style={({ pressed }) => [
              styles.fdaInfoButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
            ]}
            testID="photo-check-fda-button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Check FDA.gov</Text>
            <Feather name="external-link" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
    );
  }

  const recalls = verdict.recallResult?.recalls ?? [];
  const hasRecall = recalls.length > 0;
  return (
    <View
      style={[
        styles.verdictCard,
        {
          backgroundColor: hasRecall ? colors.dangerSoft : colors.successSoft,
          borderColor: hasRecall ? colors.destructive : colors.success,
        },
      ]}
    >
      <View style={[styles.verdictIcon, { backgroundColor: hasRecall ? colors.destructive : colors.success }]}>
        <Feather name={hasRecall ? 'alert-triangle' : 'check'} size={25} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.verdictTitle, { color: colors.foreground }]}>
        {hasRecall ? '⚠️ Active FDA recall found' : '✓ No active FDA recalls found for this product'}
      </Text>
      <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
        {hasRecall
          ? 'This product matches an active FDA recall. Review the details below and follow the official notice.'
          : 'No active FDA food or drug recall matched this product name.'}
      </Text>
      {!hasRecall ? <FdaFreshnessNotice colors={colors} /> : null}
    </View>
  );
}

function hasNutritionData(product: OpenFoodFactsProduct | null | undefined) {
  return Boolean(
    product &&
      (Object.values(product.nutrition ?? {}).some((value) => value !== undefined) ||
        product.ingredients ||
        product.allergens),
  );
}

function hasAllergenData(product: OpenFoodFactsProduct | null | undefined) {
  return Boolean(product?.ingredients?.trim() || product?.allergens?.trim());
}

function isUsableContextText(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && !/^(unknown|unclear|none|null|not readable)$/i.test(normalized);
}

function parsePhotoNutritionNumber(value: string | undefined, unit: 'g' | 'mg' | 'kcal') {
  if (!value || value.toLowerCase() === 'unknown') return undefined;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  if (!Number.isFinite(number)) return undefined;
  const normalized = value.toLowerCase();
  if (unit === 'mg' && normalized.includes('g') && !normalized.includes('mg')) return number * 1000;
  if (unit === 'g' && normalized.includes('mg')) return number / 1000;
  return number;
}

function findPhotoNutritionValue(entries: ReadonlyArray<readonly [string, string]>, terms: string[]) {
  return entries.find(([key]) => terms.some((term) => key.includes(term)))?.[1];
}

function buildPhotoNutritionProduct(productName: string, identification: FoodIdentification): OpenFoodFactsProduct {
  const entries = Object.entries(identification.nutrition)
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .filter(([, value]) => value !== 'unknown');
  const nutrition: OpenFoodFactsNutrition = {
    sugars100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['sugar', 'sugars']), 'g'),
    sodium100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['sodium']), 'mg'),
    saturatedFat100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['saturated fat', 'sat fat']), 'g'),
    carbohydrates100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['carbohydrate', 'carbs']), 'g'),
    fiber100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['fiber', 'fibre']), 'g'),
    proteins100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['protein']), 'g'),
    fat100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['total fat', 'fat']), 'g'),
    energyKcal100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['calorie', 'energy']), 'kcal'),
    potassium100g: parsePhotoNutritionNumber(findPhotoNutritionValue(entries, ['potassium']), 'mg'),
  };
  const ingredients = findPhotoNutritionValue(entries, ['ingredient', 'contains']);
  const allergens = findPhotoNutritionValue(entries, ['allergen', 'gluten', 'wheat']);
  const parsedNutrition = Object.fromEntries(
    Object.entries(nutrition).filter(([, value]) => value !== undefined),
  ) as OpenFoodFactsNutrition;

  return {
    barcode: 'photo',
    name: productName,
    brand: identification.brand === 'unknown' ? 'Photo identification' : identification.brand,
    ingredients,
    allergens,
    nutrition: Object.keys(parsedNutrition).length > 0 ? parsedNutrition : undefined,
  };
}

function IdentificationBadge({
  source,
  colors,
}: {
  source: FoodIdentification['sourceOfIdentification'];
  colors: ReturnType<typeof useColors>;
}) {
  if (source === 'unknown') return null;
  return (
    <View style={[styles.identificationBadge, { backgroundColor: colors.blueSoft }]}>
      <Feather name={source === 'sign' ? 'tag' : 'check-circle'} size={13} color={colors.primary} />
      <Text style={[styles.identificationBadgeText, { color: colors.primary }]}>
        {source === 'sign' ? 'Identified from shelf sign' : 'Identified from product'}
      </Text>
    </View>
  );
}

function PhotoSuggestionView({
  colors,
  onRetake,
  onManualSearch,
}: {
  colors: ReturnType<typeof useColors>;
  onRetake: () => void;
  onManualSearch: () => void;
}) {
  const tips = [
    'Try photographing just one item instead of a whole shelf.',
    'Get closer so the product fills the frame.',
    'Tilt the package slightly or move away from bright lights.',
    'Pick up one piece of produce and hold it in your hand.',
    'Make sure the brand name is facing the camera.',
  ];

  return (
    <View style={styles.verdictStack}>
      <View style={[styles.suggestionCard, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <View style={[styles.verdictIcon, { backgroundColor: colors.warning }]}>
          <Feather name="help-circle" size={25} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.verdictTitle, { color: colors.foreground }]}>Let&apos;s try that again</Text>
        <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
          Some photos are hard for the AI to read. Here are a few tips that usually help:
        </Text>
        <View style={styles.tipList}>
          {tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Text style={[styles.tipBullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.tipText, { color: colors.foreground }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>
      <RetakeButton colors={colors} onPress={onRetake} />
      <ManualSearchButton colors={colors} onPress={onManualSearch} label="Search by Name Instead" />
    </View>
  );
}

function RetakeButton({ colors, onPress }: { colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
      ]}
      testID="take-another-photo-button"
    >
      <Feather name="camera" size={18} color={colors.primaryForeground} />
      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Take Another Photo</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 20 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.6, marginTop: 5 },
  headingIcon: { alignItems: 'center', borderRadius: 14, height: 52, justifyContent: 'center', width: 52 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, maxWidth: 350 },
  readyCard: { alignItems: 'center', borderRadius: 20, gap: 10, padding: 26 },
  readyIcon: { alignItems: 'center', borderRadius: 999, height: 58, justifyContent: 'center', width: 58 },
  photoBadge: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  statusScreen: { alignItems: 'center', flex: 1, paddingHorizontal: 28 },
  statusIcon: { alignItems: 'center', borderRadius: 999, height: 76, justifyContent: 'center', width: 76 },
  statusTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 22, textAlign: 'center' },
  statusBody: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 320, textAlign: 'center' },
  statusActions: { alignItems: 'center', gap: 12, marginTop: 28, width: '100%' },
  primaryButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 54, paddingHorizontal: 18, width: '100%' },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  secondaryButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: 16, width: '100%' },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  feedbackCard: { alignItems: 'center', borderRadius: 20, gap: 10, padding: 28 },
  feedbackTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 3 },
  feedbackBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, maxWidth: 310, textAlign: 'center' },
  confirmedProductName: { fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 27, maxWidth: 320, textAlign: 'center' },
  identityCard: { borderRadius: 20, borderWidth: 1, gap: 9, padding: 22 },
  identityEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4, marginTop: 2 },
  identityName: { fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 31 },
  identityDetails: { gap: 3 },
  identityDetail: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  photoDisclaimer: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  identificationBadge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  identificationBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  inlineButton: { borderRadius: 10, borderWidth: 1, marginTop: 4, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  inlineButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  verdictStack: { gap: 14 },
  verdictCard: { borderRadius: 20, borderWidth: 1, gap: 9, padding: 22 },
  fdaStatusCard: { alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 18 },
  fdaStatusCopy: { flex: 1, gap: 9 },
  fdaStatusTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 22 },
  fdaInfoButton: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 },
  suggestionCard: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 22 },
  tipList: { alignSelf: 'stretch', gap: 10, marginTop: 4 },
  tipRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  tipBullet: { fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 21 },
  tipText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  verdictIcon: { alignItems: 'center', borderRadius: 999, height: 48, justifyContent: 'center', width: 48 },
  verdictTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 3 },
  productName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22 },
  verdictBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
});