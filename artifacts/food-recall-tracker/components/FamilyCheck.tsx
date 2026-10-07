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

export function FamilyCheck({ productName, productText, product = null }: FamilyCheckProps) {
  const colors = useColors();
  const { status } = useAuth();
  const familyQuery = useFamilyMembers();
  const members = familyQuery.members;
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);

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
  const expanded = expandedChoice ?? hasConflicts;

  if (status !== 'authenticated' || familyQuery.isPending) return null;

  if (familyQuery.isError) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="info" size={19} color={colors.mutedForeground} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Family Check</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Family profiles could not be loaded. Open Profile to check the connection and Supabase setup.
          </Text>
        </View>
      </View>
    );
  }

  if (members.length === 0) return null;

  const conflictCount = results.filter(familyMemberHasConflict).length;
  const summary = productQuery.isPending
    ? 'Checking family profiles…'
    : hasConflicts
      ? `${conflictCount} ${conflictCount === 1 ? 'member needs' : 'members need'} a closer look`
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
          <Text style={[styles.title, { color: colors.foreground }]}>Family Check</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{summary}</Text>
        </View>
        {productQuery.isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
        )}
      </Pressable>

      {expanded ? (
        <View style={[styles.resultList, { borderTopColor: colors.border }]}>
          {productQuery.isPending ? (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Checking available product details…
            </Text>
          ) : results.map((result) => {
            if (result.allergenMatches.length === 0 && result.healthConflictLabels.length === 0) {
              return (
                <View key={`${result.memberId}-safe`} style={styles.resultRow}>
                  <Feather name="check-circle" size={16} color={colors.success} />
                  <Text style={[styles.resultText, { color: colors.foreground }]}>Safe for {result.name}</Text>
                </View>
              );
            }

            return (
              <View key={result.memberId} style={styles.memberResults}>
                {result.allergenMatches.length > 0 ? (
                  <View style={styles.resultRow}>
                    <Feather name="alert-triangle" size={16} color={colors.warning} />
                    <Text style={[styles.resultText, { color: colors.foreground }]}>
                      Allergen: {result.name} — {result.allergenMatches.map(formatAllergen).join(', ')}
                    </Text>
                  </View>
                ) : null}
                {result.healthConflictLabels.length > 0 ? (
                  <View style={styles.resultRow}>
                    <Feather name="alert-circle" size={16} color={colors.warning} />
                    <Text style={[styles.resultText, { color: colors.foreground }]}>
                      Health conflict: {result.name} — {result.healthConflictLabels.join(', ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
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
