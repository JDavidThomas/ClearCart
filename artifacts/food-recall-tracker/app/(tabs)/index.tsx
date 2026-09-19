import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AllergenInsights } from '@/components/AllergenInsights';
import { FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { RecallCard } from '@/components/RecallCard';
import { useColors } from '@/hooks/useColors';
import { searchFoodRecalls } from '@/services/recallApi';
import type { RecallSearchResult } from '@/types/recall';

function formatUpdatedAt(date: string) {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'Unknown';
  return parsedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState<string>('');
  const [submittedTerm, setSubmittedTerm] = useState<string>('');
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const { data, error, isFetching, isError, refetch } = useQuery<RecallSearchResult, Error>({
    queryKey: ['food-recalls', submittedTerm],
    queryFn: () => searchFoodRecalls(submittedTerm),
    enabled: submittedTerm.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const handleSearch = async () => {
    const nextTerm = term.trim();
    if (!nextTerm) return;
    await Haptics.selectionAsync();
    if (nextTerm === submittedTerm) {
      await refetch();
      return;
    }
    setSubmittedTerm(nextTerm);
  };

  const searchButtonLabel = isFetching ? 'Searching…' : 'Search Recalls';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={data?.recalls ?? []}
        keyExtractor={(item, index) => `${item.recallNumber ?? item.productDescription}-${index}`}
        renderItem={({ item }) => <RecallCard recall={item} />}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: topPadding + 22,
                    paddingBottom: 110,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                <Feather name="shield" size={16} color={colors.primaryForeground} />
              </View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>FOOD SAFETY CHECK</Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Check a product before you eat it.</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Search live public recall records by product name or ingredient.
            </Text>

            <View style={styles.searchSection}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>What are you checking?</Text>
              <View
                style={[
                  styles.inputShell,
                  { backgroundColor: colors.card, borderColor: term.length > 0 ? colors.primary : colors.input },
                ]}
              >
                <Feather name="search" size={20} color={colors.mutedForeground} />
                <TextInput
                  accessibilityLabel="Product or ingredient"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setTerm}
                  onSubmitEditing={handleSearch}
                  placeholder="Try jalapeño, lettuce, or cheese"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  style={[styles.input, { color: colors.foreground }]}
                  testID="recall-search-input"
                  value={term}
                />
                {term.length > 0 ? (
                  <Pressable
                    accessibilityLabel="Clear search"
                    hitSlop={8}
                    onPress={() => setTerm('')}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    testID="clear-search"
                  >
                    <Feather name="x-circle" size={19} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !term.trim() || isFetching }}
                disabled={!term.trim() || isFetching}
                onPress={handleSearch}
                style={({ pressed }) => [
                  styles.searchButton,
                  { backgroundColor: colors.primary, opacity: pressed || !term.trim() || isFetching ? 0.7 : 1 },
                ]}
                testID="search-recalls-button"
              >
                {isFetching ? <ActivityIndicator color={colors.primaryForeground} /> : null}
                <Text style={[styles.searchButtonText, { color: colors.primaryForeground }]}>
                  {searchButtonLabel}
                </Text>
                {!isFetching ? <Feather name="arrow-right" size={18} color={colors.primaryForeground} /> : null}
              </Pressable>
            </View>
            <View style={styles.scanActionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/scan')}
                style={({ pressed }) => [
                  styles.scanButton,
                  { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
                testID="scan-product-button"
              >
                <View style={[styles.scanButtonIcon, { backgroundColor: colors.blueSoft }]}>
                  <Feather name="maximize" size={18} color={colors.primary} />
                </View>
                <View style={styles.scanButtonCopy}>
                  <Text style={[styles.scanButtonTitle, { color: colors.foreground }]}>Scan Product</Text>
                  <Text style={[styles.scanButtonSubtitle, { color: colors.mutedForeground }]}>
                    Check a barcode
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/photo-check')}
                style={({ pressed }) => [
                  styles.scanButton,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
                testID="take-photo-button"
              >
                <View style={[styles.scanButtonIcon, { backgroundColor: colors.successSoft }]}>
                  <Feather name="camera" size={18} color={colors.success} />
                </View>
                <View style={styles.scanButtonCopy}>
                  <Text style={[styles.scanButtonTitle, { color: colors.foreground }]}>Take a Photo</Text>
                  <Text style={[styles.scanButtonSubtitle, { color: colors.mutedForeground }]}>
                    Identify a product
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </Pressable>
            </View>

            {submittedTerm.length === 0 ? (
              <EmptySearchState colors={colors} />
            ) : isError ? (
              <ErrorState message={error?.message ?? 'Something went wrong.'} onRetry={() => refetch()} colors={colors} />
            ) : isFetching ? (
              <LoadingState colors={colors} />
            ) : data?.recalls.length === 0 ? (
              <NoResultsState term={submittedTerm} updatedAt={data.lastUpdated} colors={colors} />
            ) : (
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={[styles.resultsTitle, { color: colors.foreground }]}>
                    {data?.recalls.length} active {data?.recalls.length === 1 ? 'recall' : 'recalls'} found
                  </Text>
                  <Text style={[styles.updatedText, { color: colors.mutedForeground }]}>
                    Last updated {formatUpdatedAt(data?.lastUpdated ?? '')}
                  </Text>
                </View>
                {data?.fromCache ? (
                  <View style={[styles.cachedBadge, { backgroundColor: colors.warningSoft }]}>
                    <Feather name="wifi-off" size={13} color={colors.warning} />
                    <Text style={[styles.cachedBadgeText, { color: colors.warning }]}>Saved result</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          submittedTerm.length > 0 && data && !isFetching ? (
            <AllergenInsights productText={submittedTerm} dataAvailable={false} colors={colors} />
          ) : null
        }
        ListEmptyComponent={null}
      />
    </View>
  );
}

interface StateProps {
  colors: ReturnType<typeof useColors>;
}

function EmptySearchState({ colors }: StateProps) {
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.blueSoft }]}>
      <Feather name="search" size={22} color={colors.primary} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Search a food to get started</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
        We’ll show active recall records from the FDA database. A match does not replace the official notice.
      </Text>
    </View>
  );
}

interface ErrorStateProps extends StateProps {
  message: string;
  onRetry: () => void;
}

function ErrorState({ message, onRetry, colors }: ErrorStateProps) {
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.dangerSoft }]}>
      <Feather name="wifi-off" size={22} color={colors.destructive} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Couldn’t load recall data</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, { borderColor: colors.destructive, opacity: pressed ? 0.65 : 1 }]}
        testID="retry-search-button"
      >
        <Text style={[styles.retryText, { color: colors.destructive }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

interface NoResultsStateProps extends StateProps {
  term: string;
  updatedAt: string;
}

function NoResultsState({ term, updatedAt, colors }: NoResultsStateProps) {
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.successSoft }]}>
      <Feather name="check-circle" size={22} color={colors.success} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>No active recalls found for this product</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
        We didn’t find an active FDA food or drug recall matching “{term}”.
      </Text>
      <FdaFreshnessNotice colors={colors} />
      <Text style={[styles.updatedText, { color: colors.mutedForeground }]}>
        Last updated {formatUpdatedAt(updatedAt)}
      </Text>
    </View>
  );
}

function LoadingState({ colors }: StateProps) {
  return (
    <View style={[styles.loadingState, { borderColor: colors.border }]}>
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Checking official recall records…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    gap: 14,
    marginBottom: 8,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 9,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 31,
    letterSpacing: -0.7,
    lineHeight: 38,
    maxWidth: 355,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 345,
  },
  searchSection: {
    gap: 10,
    marginTop: 8,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 15,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    minHeight: 52,
  },
  searchButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  searchButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  scanButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 10,
  },
  scanActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scanButtonIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  scanButtonCopy: {
    flex: 1,
    gap: 3,
  },
  scanButtonTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  scanButtonSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  stateCard: {
    alignItems: 'center',
    borderRadius: 18,
    gap: 9,
    marginTop: 8,
    padding: 20,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  stateBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
    textAlign: 'center',
  },
  updatedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 42,
    gap: 12,
  },
  resultsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  cachedBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  cachedBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  loadingState: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 54,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 4,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});