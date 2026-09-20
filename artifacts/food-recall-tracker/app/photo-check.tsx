import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { PossiblyRelatedRecalls } from '@/components/PossiblyRelatedRecalls';
import { ProduceRecallVerdict } from '@/components/ProduceRecallVerdict';
import { RecallCard } from '@/components/RecallCard';
import { RecallRelevanceNotice } from '@/components/RecallRelevanceNotice';
import { useColors } from '@/hooks/useColors';
import {
  identifyFoodFromImage,
  isPossiblyTruncatedProductName,
  isUsableProductName,
} from '@/services/visionApi';
import { searchFoodRecalls } from '@/services/recallApi';
import type { RecallSearchResult } from '@/types/recall';

type PhotoState = 'ready' | 'identifying' | 'checking' | 'confirming' | 'verdict' | 'error';
const MAX_PHOTO_WIDTH = 1024;

interface PhotoVerdict {
  productName: string | null;
  recallResult: RecallSearchResult | null;
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
  const topPadding = insets.top;

  const reset = () => {
    setPhotoState('ready');
    setVerdict(null);
    setImageUri(null);
    setErrorMessage(null);
  };

  const checkProduct = async (productName: string) => {
    setPhotoState('checking');
    const recallResult = await searchFoodRecalls(productName);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setVerdict({ productName, recallResult });
    setPhotoState('verdict');
  };

  const processAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const targetWidth = Math.min(asset.width || MAX_PHOTO_WIDTH, MAX_PHOTO_WIDTH);
    // Keep the original camera result as a URI. Resize and compress it before
    // asking the native image module to create a base64 string.
    const compressedImage = await ImageManipulator.manipulateAsync(
      asset.uri,
      asset.width > MAX_PHOTO_WIDTH ? [{ resize: { width: targetWidth } }] : [],
      {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      },
    );

    const encodedImage = await ImageManipulator.manipulateAsync(
      compressedImage.uri,
      [],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!encodedImage.base64) throw new Error('We could not read that photo. Please try again.');

    setImageUri(asset.uri);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhotoState('identifying');

    const identifiedProductName = await identifyFoodFromImage(encodedImage.base64, 'image/jpeg');
    if (!isUsableProductName(identifiedProductName)) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVerdict({ productName: null, recallResult: null });
      setPhotoState('verdict');
      return;
    }

    if (isPossiblyTruncatedProductName(identifiedProductName)) {
      setVerdict({ productName: identifiedProductName, recallResult: null });
      setPhotoState('confirming');
      return;
    }

    await checkProduct(identifiedProductName);
  };

  const confirmProduct = async () => {
    const productName = verdict?.productName;
    if (!productName) return;

    try {
      await checkProduct(productName);
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
        quality: 0.65,
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
        quality: 0.65,
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
                ? 'Sending the compressed photo securely for identification.'
                : 'Searching current FDA food and drug recall records.'}
            </Text>
          </View>
        ) : photoState === 'confirming' && verdict?.productName ? (
          <PhotoConfirmationView
            colors={colors}
            productName={verdict.productName}
            onConfirm={() => void confirmProduct()}
            onManualSearch={() => router.push('/')}
            onRetake={reset}
          />
        ) : photoState === 'error' ? (
          <View style={[styles.feedbackCard, { backgroundColor: colors.dangerSoft }]}>
            <Feather name="alert-circle" size={28} color={colors.destructive} />
            <Text style={[styles.feedbackTitle, { color: colors.foreground }]}>Couldn’t check this photo</Text>
            <Text style={[styles.feedbackBody, { color: colors.mutedForeground }]}>
              {errorMessage ?? 'Please try another photo.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              style={({ pressed }) => [
                styles.inlineButton,
                { borderColor: colors.destructive, opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text style={[styles.inlineButtonText, { color: colors.destructive }]}>Try another photo</Text>
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
}: {
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      testID="photo-manual-search-button"
    >
      <Feather name="search" size={17} color={colors.primary} />
      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Search manually instead</Text>
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
  onConfirm,
  onManualSearch,
  onRetake,
}: {
  colors: ReturnType<typeof useColors>;
  productName: string;
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
      <View style={styles.verdictStack}>
        <View style={[styles.verdictCard, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <View style={[styles.verdictIcon, { backgroundColor: colors.warning }]}>
            <Feather name="help-circle" size={25} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.verdictTitle, { color: colors.foreground }]}>Product Not Found</Text>
          <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
            We couldn’t confidently read a food product from this photo. Try a clearer image or search manually instead.
          </Text>
        </View>
        <AllergenInsights productText="" dataAvailable={false} colors={colors} />
        <ManualSearchButton colors={colors} onPress={() => router.push('/')} />
        <RetakeButton colors={colors} onPress={onRetake} />
      </View>
    );
  }

  const recalls = verdict.recallResult?.recalls ?? [];
  const hasRecall = recalls.length > 0;
  const relatedRecalls = verdict.recallResult?.relatedRecalls ?? [];
  const produceItem = verdict.recallResult?.produceItem ?? verdict.productName;

  if (verdict.recallResult?.isProduceSearch) {
    return (
      <View style={styles.verdictStack}>
        <ProduceRecallVerdict item={produceItem} hasDirectRecall={hasRecall} />
        {recalls.map((recall, index) => (
          <RecallCard key={`${recall.recallNumber ?? recall.productDescription}-${index}`} recall={recall} />
        ))}
        <PossiblyRelatedRecalls item={produceItem} recalls={relatedRecalls} />
        <AllergenInsights productText={verdict.productName} dataAvailable={Boolean(verdict.productName)} colors={colors} />
        <RetakeButton colors={colors} onPress={onRetake} />
      </View>
    );
  }

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
        <View style={[styles.verdictIcon, { backgroundColor: hasRecall ? colors.destructive : colors.success }]}>
          <Feather name={hasRecall ? 'alert-triangle' : 'check'} size={25} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.verdictTitle, { color: colors.foreground }]}>
          {hasRecall ? 'Active Recall Found' : `No Active Recalls Found for ${verdict.productName}`}
        </Text>
        <Text style={[styles.productName, { color: colors.foreground }]}>{verdict.productName}</Text>
        <Text style={[styles.verdictBody, { color: colors.mutedForeground }]}>
          {hasRecall
            ? 'This product matches an active FDA recall. Review the details below and follow the official notice.'
            : 'No active FDA food or drug recall matched this product name.'}
        </Text>
        {!hasRecall ? <FdaFreshnessNotice colors={colors} /> : null}
      </View>
      <RecallRelevanceNotice message={verdict.recallResult?.relevanceNotice} />
      {recalls.map((recall, index) => (
        <RecallCard key={`${recall.recallNumber ?? recall.productDescription}-${index}`} recall={recall} />
      ))}
        <AllergenInsights productText={verdict.productName} dataAvailable={Boolean(verdict.productName)} colors={colors} />
      <RetakeButton colors={colors} onPress={onRetake} />
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
  inlineButton: { borderRadius: 10, borderWidth: 1, marginTop: 4, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  inlineButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  verdictStack: { gap: 14 },
  verdictCard: { borderRadius: 20, borderWidth: 1, gap: 9, padding: 22 },
  verdictIcon: { alignItems: 'center', borderRadius: 999, height: 48, justifyContent: 'center', width: 48 },
  verdictTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 3 },
  productName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22 },
  verdictBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
});