import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ALLERGEN_OPTIONS } from '@/components/AllergenInsights';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { searchOpenFoodFactsProduct } from '@/services/openFoodFacts';
import {
  evaluateFamilyMember,
  familyMemberHasConflict,
  getFamilyMemberSafetyMessages,
} from '@/services/familyCheckLogic';
import { useFamilyMembers } from '@/services/familyMembers';
import type { OpenFoodFactsProduct } from '@/types/recall';

interface FamilyCheckProps {
  productName: string;
  productText: string;
  product?: OpenFoodFactsProduct | null;
}

function formatAllergen(id: string) {
  return ALLERGEN_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

function hasProductSafetyDetails(product: OpenFoodFactsProduct | null) {
  if (!product) return false;
  if (product.ingredients?.trim() || product.allergens?.trim()) return true;
  return Boolean(
    product.nutrition &&
      Object.values(product.nutrition).some((value) => typeof value === 'number' && Number.isFinite(value)),
  );
}

export function FamilyCheck({ productName, productText, product = null }: FamilyCheckProps) {
  const colors = useColors();
  const { status } = useAuth();
  const familyQuery = useFamilyMembers();
  const members = familyQuery.members;
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const [retryingFamilyProfiles, setRetryingFamilyProfiles] = useState(false);

  const retryFamilyCheck = () => {
    setRetryingFamilyProfiles(true);
    void familyQuery.refetch().finally(() => setRetryingFamilyProfiles(false));
  };

  useEffect(() => {
    setExpandedChoice(null);
  }, [productName]);

  const productQuery = useQuery({
    queryKey: ['family-check-product', productName.trim().toLowerCase()],
    queryFn: () => searchOpenFoodFactsProduct(productName),
    enabled: status === 'authenticated' && members.length > 0 && !product && Boolean(productName.trim()),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const productForCheck = product ?? productQuery.data ?? null;
  const productDetailsAvailable = hasProductSafetyDetails(productForCheck);
  const results = useMemo(
    () => members.map((member) =>
      evaluateFamilyMember(
        member,
        productName,
        productText,
        productForCheck,
      ),
    ),
    [members, productForCheck, productName, productText],
  );
  const hasConflicts = results.some(familyMemberHasConflict);
  const expanded = expandedChoice ?? (hasConflicts || !productDetailsAvailable);

  useEffect(() => {
    if (status !== 'authenticated' || familyQuery.isPending || familyQuery.isError || members.length === 0) return;
    console.info('[FamilyCheck] Family check runs', {
      productName,
      familyMemberCount: members.length,
      productDetailsAvailable,
      conflictingMembers: results.filter(familyMemberHasConflict).map((result) => result.name),
    });
    console.info('[FamilyCheck] Result rendered', {
      productName,
      familyMemberCount: members.length,
      conflictingMembers: results.filter(familyMemberHasConflict).map((result) => result.name),
      productLookupStatus: productQuery.isPending
        ? 'pending'
        : productQuery.isError
          ? 'unavailable'
          : 'resolved',
    });
  }, [
    familyQuery.isError,
    familyQuery.isPending,
    members,
    productForCheck,
    productDetailsAvailable,
    productName,
    productQuery.isError,
    productQuery.isPending,
    results,
    status,
  ]);

  if (status !== 'authenticated') return null;

  if (
    familyQuery.isError ||
    retryingFamilyProfiles ||
    (familyQuery.isPending && familyQuery.fetchStatus === 'idle')
  ) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="info" size={19} color={colors.mutedForeground} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Household Safety Check</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Unable to load family profiles. Household check unavailable — verify manually.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry household safety check"
            accessibilityState={{ busy: retryingFamilyProfiles, disabled: retryingFamilyProfiles }}
            disabled={retryingFamilyProfiles}
            onPress={retryFamilyCheck}
            style={styles.retryButton}
            testID="family-check-retry"
          >
            {retryingFamilyProfiles ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={14} color={colors.primary} />
            )}
            <Text style={[styles.retryText, { color: colors.primary }]}>
              {retryingFamilyProfiles ? 'Retrying…' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (familyQuery.isPending) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="users" size={19} color={colors.primary} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Household Safety Check</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Checking family profiles…
          </Text>
        </View>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (members.length === 0) return null;

  const conflictCount = results.filter(familyMemberHasConflict).length;
  const summary = hasConflicts
    ? `${conflictCount} ${conflictCount === 1 ? 'member needs' : 'members need'} a closer look`
    : productQuery.isPending || productQuery.isError || !productDetailsAvailable
      ? 'No name-based conflict found — verify manually'
      : 'Safe for everyone';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpandedChoice((current) => !(current ?? hasConflicts))}
        style={styles.header}
        testID="family-check-toggle"
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
          <Feather name="users" size={17} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Household Safety Check</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Based on each family member&apos;s saved profile
          </Text>
          <Text style={[styles.summary, { color: colors.mutedForeground }]}>{summary}</Text>
        </View>
        <View style={styles.headerAction}>
          {productQuery.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
          )}
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.resultList, { borderTopColor: colors.border }]}>
          {productQuery.isPending || !productDetailsAvailable ? (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Household results include a name-based check. Verify the package label if product details are unavailable.
            </Text>
          ) : null}
          {results.map((result) => (
            <View key={result.memberId} style={styles.memberResults}>
              {getFamilyMemberSafetyMessages(result, formatAllergen).map((message, index) => (
                <View key={`${result.memberId}-${message.kind}-${index}`} style={styles.resultRow}>
                  <Feather
                    name={message.kind === 'safe' ? 'check-circle' : 'alert-triangle'}
                    size={16}
                    color={message.kind === 'safe' ? colors.success : colors.warning}
                  />
                  <Text style={[styles.resultText, { color: colors.foreground }]}>
                    {message.text}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 40,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    marginTop: 7,
    minHeight: 36,
    paddingHorizontal: 4,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  summary: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  resultList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 11,
    marginTop: 14,
    paddingTop: 13,
  },
  memberResults: {
    gap: 8,
  },
  resultRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  resultText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
});
