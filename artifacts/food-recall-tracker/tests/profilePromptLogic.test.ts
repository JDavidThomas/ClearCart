import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowAllergenSetupPrompt } from '../services/profilePromptLogic.ts';

const emptyProfile = {
  allergies: [] as string[],
  customAllergy: '',
  healthConditions: [] as string[],
  customHealthNote: '',
  dietaryPreferences: [] as string[],
};

const familyMember = (updates: Partial<{
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
}> = {}) => ({
  allergies: [],
  healthConditions: [],
  dietaryPreferences: [],
  ...updates,
});

test('hides setup prompt when primary user has allergies, even with family profiles', () => {
  assert.equal(
    shouldShowAllergenSetupPrompt(
      { ...emptyProfile, allergies: ['milk', 'peanuts'] },
      [familyMember({ allergies: ['peanuts'] })],
    ),
    false,
  );
});

test('shows setup prompt only when neither primary nor family has saved needs', () => {
  assert.equal(shouldShowAllergenSetupPrompt(emptyProfile, []), true);
});

test('hides setup prompt when family members have needs and primary profile is empty', () => {
  assert.equal(
    shouldShowAllergenSetupPrompt(
      emptyProfile,
      [familyMember({ allergies: ['peanuts'] })],
    ),
    false,
  );
  assert.equal(
    shouldShowAllergenSetupPrompt(
      emptyProfile,
      [familyMember({ healthConditions: ['diabetes'] })],
    ),
    false,
  );
  assert.equal(
    shouldShowAllergenSetupPrompt(
      emptyProfile,
      [familyMember({ dietaryPreferences: ['vegan'] })],
    ),
    false,
  );
});

test('health conditions and dietary preferences also count as primary profile needs', () => {
  assert.equal(
    shouldShowAllergenSetupPrompt(
      { ...emptyProfile, healthConditions: ['diabetes'] },
      [],
    ),
    false,
  );
  assert.equal(
    shouldShowAllergenSetupPrompt(
      { ...emptyProfile, dietaryPreferences: ['vegan'] },
      [],
    ),
    false,
  );
});
