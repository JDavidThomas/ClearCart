import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HAS_SEEN_TOUR_KEY,
  PROFILE_SETUP_COMPLETED_KEY,
  hasCompletedProfileSetup,
} from '../services/onboardingTourLogic.ts';

const emptyProfile = {
  healthConsentGiven: false,
  allergies: [],
  healthConditions: [],
  dietaryPreferences: [],
  customAllergy: '',
  customHealthNote: '',
  severity: null,
};

test('onboarding flags use the persisted key names', () => {
  assert.equal(HAS_SEEN_TOUR_KEY, 'has_seen_tour');
  assert.equal(PROFILE_SETUP_COMPLETED_KEY, 'has_completed_profile_setup');
});

test('empty profiles remain eligible, while completed personalization suppresses the tour', () => {
  assert.equal(hasCompletedProfileSetup(null), false);
  assert.equal(hasCompletedProfileSetup(emptyProfile), false);
  assert.equal(
    hasCompletedProfileSetup({ ...emptyProfile, healthConsentGiven: true }),
    true,
  );
  assert.equal(
    hasCompletedProfileSetup({ ...emptyProfile, allergies: ['peanut'] }),
    true,
  );
});
