import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import {
  HAS_SEEN_TOUR_KEY,
  PROFILE_SETUP_COMPLETED_KEY,
  hasCompletedProfileSetup,
} from '@/services/onboardingTourLogic';
import { fetchShoppingListItems } from '@/services/shoppingList';

const TOUR_STEPS = [
  {
    tab: 'Home',
    title: 'Search & Scan',
    description:
      "Look up any product by name, barcode, or photo. We'll check it for recalls, allergens, and health conflicts.",
  },
  {
    tab: 'Scan',
    title: 'Quick Scan',
    description:
      'Point your camera at any barcode or take a photo of a product label for instant results.',
  },
  {
    tab: 'Shopping List',
    title: 'Your Shopping List',
    description:
      "Save items you plan to buy. We'll check them for recalls and allergies before you shop.",
  },
  {
    tab: 'Profile',
    title: 'Your Profile & Family',
    description:
      'Add your allergies, health conditions, and family members so every check is personalized.',
  },
] as const;

async function markTourSeen() {
  try {
    await AsyncStorage.setItem(HAS_SEEN_TOUR_KEY, 'true');
  } catch (error) {
    console.warn('[OnboardingTour] Could not persist tour completion', error);
  }
}

export function OnboardingTour() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { status, profile } = useAuth();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const completedProfile = hasCompletedProfileSetup(profile);

  useEffect(() => {
    let cancelled = false;

    async function decideWhetherToShow() {
      if (status === 'loading') return;

      try {
        if ((await AsyncStorage.getItem(HAS_SEEN_TOUR_KEY)) === 'true') return;
        if ((await AsyncStorage.getItem(PROFILE_SETUP_COMPLETED_KEY)) === 'true') {
          await markTourSeen();
          return;
        }
      } catch (error) {
        console.warn('[OnboardingTour] Could not read tour completion', error);
        return;
      }

      if (completedProfile) {
        await markTourSeen();
        return;
      }

      if (status === 'authenticated' && profile) {
        try {
          const items = await fetchShoppingListItems(profile.id);
          if (items.length > 0) {
            await markTourSeen();
            return;
          }
        } catch (error) {
          // Don't risk showing an unwanted tour when the saved list is unavailable.
          console.warn('[OnboardingTour] Could not check saved list; skipping tour', error);
          await markTourSeen();
          return;
        }
      }

      if (!cancelled) setStepIndex(0);
    }

    void decideWhetherToShow();
    return () => {
      cancelled = true;
    };
  }, [completedProfile, profile, status]);

  useEffect(() => {
    if (stepIndex === null) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, stepIndex]);

  const finishTour = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics are optional; tour controls remain available without them.
    }
    await markTourSeen();
    setStepIndex(null);
  };

  const advance = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics are optional; tour controls remain available without them.
    }
    if (stepIndex === TOUR_STEPS.length - 1) {
      await markTourSeen();
      setStepIndex(null);
      return;
    }
    setStepIndex((current) => (current === null ? null : current + 1));
  };

  if (stepIndex === null) return null;

  const activeStep = TOUR_STEPS[stepIndex];
  const centerX = (width * (stepIndex + 0.5)) / TOUR_STEPS.length;
  const centerY = height - insets.bottom - (Platform.OS === 'web' ? 62 : 42);
  const spotlightSize = 64;
  const spotlightLeft = centerX - spotlightSize / 2;
  const spotlightTop = centerY - spotlightSize / 2;
  const panelWidth = Math.min(width - 36, 380);
  const panelLeft = Math.max(18, Math.min(centerX - panelWidth / 2, width - panelWidth - 18));
  const panelBottom = insets.bottom + 98;

  const darkMask = { backgroundColor: 'rgba(8, 18, 36, 0.68)' };
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="onboarding-tour">
      <View pointerEvents="none" style={[styles.maskTop, darkMask, { height: spotlightTop }]} />
      <View
        pointerEvents="none"
        style={[
          styles.maskLeft,
          darkMask,
          { top: spotlightTop, width: spotlightLeft, height: spotlightSize },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.maskRight,
          darkMask,
          {
            top: spotlightTop,
            left: spotlightLeft + spotlightSize,
            right: 0,
            height: spotlightSize,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.maskBottom,
          darkMask,
          { top: spotlightTop + spotlightSize, bottom: 0 },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.spotlight,
          {
            left: spotlightLeft,
            top: spotlightTop,
            borderColor: colors.primary,
            shadowColor: colors.primary,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.tooltipPosition,
          { left: panelLeft, bottom: panelBottom, width: panelWidth },
        ]}
      >
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.tooltip,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: '#10233f',
            },
          ]}
        >
          <View style={styles.topRow}>
            <Text style={[styles.progress, { color: colors.primary }]}>
              {stepIndex + 1} of {TOUR_STEPS.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding tour"
              hitSlop={10}
              onPress={() => void finishTour()}
              testID="onboarding-skip"
            >
              <Text style={[styles.skip, { color: colors.mutedForeground }]}>Skip</Text>
            </Pressable>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{activeStep.title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {activeStep.description}
          </Text>
          <View style={styles.footer}>
            <View style={styles.dots} accessibilityLabel={`Step ${stepIndex + 1} of 4`}>
              {TOUR_STEPS.map((item, index) => (
                <View
                  key={item.tab}
                  style={[
                    styles.dot,
                    { backgroundColor: index === stepIndex ? colors.primary : colors.border },
                    index === stepIndex && styles.activeDot,
                  ]}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void advance()}
              style={({ pressed }) => [
                styles.nextButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
              testID="onboarding-next"
            >
              <Text style={[styles.nextLabel, { color: colors.primaryForeground }]}>
                {stepIndex === TOUR_STEPS.length - 1 ? 'Got it' : 'Next'}
              </Text>
            </Pressable>
          </View>
        </View>
        <View
          pointerEvents="none"
          style={[styles.pointer, { borderTopColor: colors.card, left: centerX - panelLeft - 10 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  maskTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  maskLeft: { position: 'absolute', left: 0 },
  maskRight: { position: 'absolute' },
  maskBottom: { position: 'absolute', left: 0, right: 0 },
  spotlight: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
  },
  tooltipPosition: { position: 'absolute' },
  tooltip: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 17,
    paddingBottom: 16,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  skip: { fontSize: 14, fontWeight: '600', paddingVertical: 2 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700', marginTop: 12 },
  description: { fontSize: 16, lineHeight: 23, marginTop: 7 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  activeDot: { width: 20 },
  nextButton: { minWidth: 104, alignItems: 'center', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18 },
  nextLabel: { fontSize: 15, fontWeight: '700' },
  pointer: {
    position: 'absolute',
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
