import type { OpenFoodFactsProduct } from '@/types/recall';
import { ALLERGEN_KEYWORDS, evaluateAllergenMatches } from './allergenMatching.ts';
import { productTextContainsAnyKeyword } from './productNameKeywords.ts';
import { buildConflicts } from './nutritionInsights.ts';

export interface FamilyCheckMember {
  id: string;
  name: string;
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
}

export interface FamilyMemberCheckResult {
  memberId: string;
  name: string;
  allergenMatches: string[];
  healthConflictLabels: string[];
  healthConflictDetails: { label: string; detail: string }[];
}

export interface FamilyMemberSafetyMessage {
  kind: 'allergen' | 'health' | 'safe';
  text: string;
}

export function getFamilyMemberSafetyMessages(
  result: FamilyMemberCheckResult,
  formatAllergen: (id: string) => string = (id) => id,
): FamilyMemberSafetyMessage[] {
  const messages: FamilyMemberSafetyMessage[] = [];

  if (result.allergenMatches.length > 0) {
    const allergens = result.allergenMatches.map(formatAllergen).join(', ');
    messages.push({
      kind: 'allergen',
      text: `${result.name} is allergic to ${allergens} — this product contains ${allergens}`,
    });
  }

  for (const conflict of result.healthConflictDetails) {
    messages.push({
      kind: 'health',
      text: conflict.label === 'Gluten'
        ? `${result.name} avoids Gluten — this product contains Gluten`
        : `${result.name} has a ${conflict.label} conflict — ${conflict.detail}`,
    });
  }

  if (messages.length === 0) {
    messages.push({ kind: 'safe', text: `Safe for ${result.name}` });
  }

  return messages;
}

function evaluateCustomAllergenMatches(customTerms: string[], productName: string, productText: string) {
  return customTerms.filter((term) =>
    productTextContainsAnyKeyword(productName, [term]) ||
    productTextContainsAnyKeyword(productText, [term]),
  );
}

export function evaluateFamilyMember(
  member: FamilyCheckMember,
  productName: string,
  productText: string,
  product: OpenFoodFactsProduct | null = null,
): FamilyMemberCheckResult {
  const standardAllergies = member.allergies.filter((allergy) =>
    Object.prototype.hasOwnProperty.call(ALLERGEN_KEYWORDS, allergy),
  );
  const customAllergies = member.allergies.filter((allergy) =>
    !Object.prototype.hasOwnProperty.call(ALLERGEN_KEYWORDS, allergy) && allergy.trim().length > 1,
  );
  const allergenEvaluation = evaluateAllergenMatches(
    standardAllergies,
    customAllergies.join(','),
    productName,
    productText,
  );
  const standardMatches = allergenEvaluation.matches.filter((match) => match !== 'other');
  const customMatches = evaluateCustomAllergenMatches(customAllergies, productName, productText);
  const healthConflicts = buildConflicts(
    product,
    member.healthConditions,
    member.dietaryPreferences,
    productName,
  );
  const healthConflictDetails = healthConflicts.map((conflict) => ({
    label: conflict.label === 'Gluten-Free' || conflict.label === 'Celiac Disease'
      ? 'Gluten'
      : conflict.label,
    detail: conflict.detail,
  }));

  return {
    memberId: member.id,
    name: member.name,
    allergenMatches: [...new Set([...standardMatches, ...customMatches])],
    healthConflictLabels: [...new Set(healthConflictDetails.map((conflict) => conflict.label))],
    healthConflictDetails,
  };
}

export function familyMemberHasConflict(result: FamilyMemberCheckResult) {
  return result.allergenMatches.length > 0 || result.healthConflictLabels.length > 0;
}
