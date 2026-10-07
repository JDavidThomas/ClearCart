import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateFamilyMember,
  familyMemberHasConflict,
  type FamilyCheckMember,
} from '../services/familyCheckLogic.ts';

const member = (updates: Partial<FamilyCheckMember> = {}): FamilyCheckMember => ({
  id: 'member-1',
  name: 'Emma',
  allergies: [],
  healthConditions: [],
  dietaryPreferences: [],
  ...updates,
});

test('family allergen checks use the product-name matching rules', () => {
  const result = evaluateFamilyMember(
    member({ allergies: ['peanuts'] }),
    'peanut butter',
    '',
  );

  assert.deepEqual(result.allergenMatches, ['peanuts']);
  assert.deepEqual(result.healthConflictLabels, []);
  assert.equal(familyMemberHasConflict(result), true);
});

test('family allergen checks also inspect available ingredient data', () => {
  const result = evaluateFamilyMember(
    member({ allergies: ['peanuts'] }),
    'crunchy spread',
    'Ingredients: roasted peanuts, salt',
  );

  assert.deepEqual(result.allergenMatches, ['peanuts']);
});

test('Gluten-Free family members get a name-based conflict for whole wheat bread', () => {
  const result = evaluateFamilyMember(
    member({ name: 'David', dietaryPreferences: ['gluten-free'] }),
    'whole wheat bread',
    '',
  );

  assert.deepEqual(result.healthConflictLabels, ['Gluten']);
  assert.equal(familyMemberHasConflict(result), true);
});

test('a banana is safe for a family member without matching needs', () => {
  const result = evaluateFamilyMember(member(), 'banana', '');

  assert.deepEqual(result.allergenMatches, []);
  assert.deepEqual(result.healthConflictLabels, []);
  assert.equal(familyMemberHasConflict(result), false);
});
