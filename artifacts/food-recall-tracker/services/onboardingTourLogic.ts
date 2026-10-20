export const HAS_SEEN_TOUR_KEY = 'has_seen_tour';
export const PROFILE_SETUP_COMPLETED_KEY = 'has_completed_profile_setup';

export interface ProfileSetupSnapshot {
  healthConsentGiven: boolean;
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
  customAllergy: string;
  customHealthNote: string;
  severity: string | null;
}

export function hasCompletedProfileSetup(profile: ProfileSetupSnapshot | null) {
  return Boolean(
    profile &&
      (profile.healthConsentGiven ||
        profile.allergies.length > 0 ||
        profile.healthConditions.length > 0 ||
        profile.dietaryPreferences.length > 0 ||
        profile.customAllergy.trim() ||
        profile.customHealthNote.trim() ||
        profile.severity),
  );
}
