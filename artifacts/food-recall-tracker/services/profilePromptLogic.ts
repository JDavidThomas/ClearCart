export interface ProfilePromptNeeds {
  allergies: string[];
  customAllergy: string;
  healthConditions: string[];
  customHealthNote: string;
  dietaryPreferences: string[];
}

export interface FamilyPromptNeeds {
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
}

export function shouldShowAllergenSetupPrompt(
  profile: ProfilePromptNeeds | null | undefined,
  familyMembers: FamilyPromptNeeds[],
) {
  if (!profile) return false;

  const primaryHasNeeds =
    profile.allergies.length > 0 ||
    Boolean(profile.customAllergy.trim()) ||
    profile.healthConditions.length > 0 ||
    Boolean(profile.customHealthNote.trim()) ||
    profile.dietaryPreferences.length > 0;
  const familyHasNeeds = familyMembers.some((member) =>
    member.allergies.length > 0 ||
    member.healthConditions.length > 0 ||
    member.dietaryPreferences.length > 0,
  );

  return !primaryHasNeeds && !familyHasNeeds;
}
