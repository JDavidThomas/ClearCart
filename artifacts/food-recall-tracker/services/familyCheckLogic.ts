import type { OpenFoodFactsProduct } from '@/types/recall';
import { ALLERGEN_KEYWORDS, evaluateAllergenMatches } from './allergenMatching';
import { productTextContainsAnyKeyword } from './productNameKeywords.ts';
import { buildConflicts } from './nutritionInsights';

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

  return {
    memberId: member.id,
    name: member.name,
    allergenMatches: [...new Set([...standardMatches, ...customMatches])],
    healthConflictLabels: [...new Set(healthConflicts.map((conflict) =>
      conflict.label === 'Gluten-Free' ? 'Gluten' : conflict.label,
    ))],
  };
}

export function familyMemberHasConflict(result: FamilyMemberCheckResult) {
  return result.allergenMatches.length > 0 || result.healthConflictLabels.length > 0;
}
