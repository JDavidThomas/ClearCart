import { productTextContainsAnyKeyword } from './productNameKeywords.ts';

export const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  peanuts: ['peanut', 'peanuts', 'groundnut'],
  milk: ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'yoghurt', 'dairy', 'whey', 'casein', 'lactose'],
  eggs: ['egg', 'eggs', 'mayonnaise', 'mayo', 'albumen'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy'],
  shellfish: ['shrimp', 'crab', 'lobster', 'oyster', 'clam', 'scallop', 'shellfish', 'prawn'],
  'tree-nuts': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  wheat: ['wheat', 'bread', 'flour', 'pasta', 'barley', 'rye'],
  soy: ['soy', 'soybean', 'soya', 'tofu', 'edamame', 'lecithin'],
  sesame: ['sesame', 'tahini'],
  gluten: ['wheat', 'barley', 'rye', 'malt', 'gluten'],
  corn: ['corn', 'maize'],
  other: [],
};

export interface AllergenMatchResult {
  matches: string[];
  nameMatches: string[];
  productDataMatches: string[];
  nameOnlyMatches: string[];
}

export type AllergenVerdict =
  | 'profile-not-configured'
  | 'severe-allergen-alert'
  | 'allergen-alert'
  | 'no-matching-allergens'
  | 'allergen-data-unavailable';

export function classifyAllergenVerdict({
  matches,
  dataAvailable,
  hasProfile,
  severe,
}: {
  matches: string[];
  dataAvailable: boolean;
  hasProfile: boolean;
  severe: boolean;
}): AllergenVerdict {
  if (!hasProfile) return 'profile-not-configured';
  if (matches.length > 0) return severe ? 'severe-allergen-alert' : 'allergen-alert';
  return dataAvailable ? 'no-matching-allergens' : 'allergen-data-unavailable';
}

function findStandardMatches(allergies: string[], text: string) {
  return allergies.filter((allergen) =>
    productTextContainsAnyKeyword(text, ALLERGEN_KEYWORDS[allergen] ?? []),
  );
}

function customAllergyMatches(customAllergy: string, text: string) {
  const terms = customAllergy
    .split(/[,;/]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
  return terms.some((term) => productTextContainsAnyKeyword(text, [term]));
}

export function evaluateAllergenMatches(
  allergies: string[],
  customAllergy: string,
  productName: string,
  productDataText: string,
): AllergenMatchResult {
  const nameMatches = findStandardMatches(allergies, productName);
  const productDataMatches = findStandardMatches(allergies, productDataText);
  const customNameMatch = customAllergyMatches(customAllergy, productName);
  const customDataMatch = customAllergyMatches(customAllergy, productDataText);

  if (customNameMatch && !nameMatches.includes('other')) nameMatches.push('other');
  if (customDataMatch && !productDataMatches.includes('other')) productDataMatches.push('other');

  const matches = allergies.filter(
    (allergen) => nameMatches.includes(allergen) || productDataMatches.includes(allergen),
  );
  if ((customNameMatch || customDataMatch) && !matches.includes('other')) matches.push('other');

  return {
    matches,
    nameMatches,
    productDataMatches,
    nameOnlyMatches: nameMatches.filter((allergen) => !productDataMatches.includes(allergen)),
  };
}