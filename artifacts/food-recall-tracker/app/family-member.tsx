import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALLERGEN_OPTIONS } from '@/components/AllergenInsights';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  DIETARY_PREFERENCE_OPTIONS,
  HEALTH_CONDITION_OPTIONS,
} from '@/components/HealthInsights';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import {
  useFamilyMembers,
  type FamilyMember,
  type FamilyMemberValues,
  type FamilyRelationship,
} from '@/services/familyMembers';

const RELATIONSHIPS: { value: FamilyRelationship; label: string }[] = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other' },
];

const STANDARD_ALLERGEN_IDS: Set<string> = new Set(ALLERGEN_OPTIONS.map((option) => option.id));

export default function FamilyMemberScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const family = useFamilyMembers();
  const { status } = useAuth();
  const memberId = Array.isArray(params.id) ? params.id[0] : params.id;
  const member = memberId ? family.members.find((item) => item.id === memberId) : null;

  if (status !== 'authenticated') {
    return (
      <FormMessage
        title="Log in to manage family profiles"
        message="Family members are saved under your account."
        onBack={() => router.back()}
      />
    );
  }

  if (family.isError) {
    return (
      <FormMessage
        title="Family profiles are unavailable"
        message={family.error instanceof Error ? family.error.message : 'Check your Supabase setup and try again.'}
        onBack={() => router.back()}
      />
    );
  }

  if (family.isPending || (memberId && !member)) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        {family.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FormMessage
            title="Family member not found"
            message="This profile may have been deleted."
            onBack={() => router.back()}
          />
        )}
      </View>
    );
  }

  return <FamilyMemberForm key={member?.id ?? 'new-family-member'} member={member ?? null} />;
}

function FormMessage({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.messageScreen, { backgroundColor: colors.background }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={styles.backButton}
        testID="family-member-back-button"
      >
        <Feather name="arrow-left" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.messageTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.messageBody, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

function FamilyMemberForm({ member }: { member: FamilyMember | null }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const family = useFamilyMembers();
  const knownAllergies = member?.allergies.filter((id) => STANDARD_ALLERGEN_IDS.has(id)) ?? [];
  const customAllergies = member?.allergies.filter((id) => !STANDARD_ALLERGEN_IDS.has(id)) ?? [];
  const [name, setName] = useState<string>(member?.name ?? '');
  const [relationship, setRelationship] = useState<FamilyRelationship | null>(member?.relationship ?? null);
  const [relationshipOpen, setRelationshipOpen] = useState<boolean>(false);
  const [allergies, setAllergies] = useState<string[]>(knownAllergies);
  const [customAllergyText, setCustomAllergyText] = useState<string>(customAllergies.join(', '));
  const [healthConditions, setHealthConditions] = useState<string[]>(member?.healthConditions ?? []);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(member?.dietaryPreferences ?? []);
  const [customNote, setCustomNote] = useState<string>(member?.customNote ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const toggleSelection = (
    current: string[],
    setCurrent: Dispatch<SetStateAction<string[]>>,
    value: string,
  ) => {
    setCurrent((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    );
  };

  const save = async () => {
    if (!name.trim()) {
      setFormError('Enter a name to save this family member.');
      return;
    }
    setFormError(null);
    const customAllergyValues = customAllergyText
      .split(/[,;/]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 1);
    const values: FamilyMemberValues = {
      name: name.trim(),
      relationship,
      allergies: [...new Set([...allergies, ...customAllergyValues])],
      healthConditions,
      dietaryPreferences,
      customNote: customNote.trim(),
    };

    try {
      await family.saveMember({ ...values, ...(member ? { id: member.id } : {}) });
      router.back();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'The family member could not be saved.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        bottomOffset={76}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + 10, paddingBottom: bottomInset + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            testID="family-member-back-button"
          >
            <Feather name="arrow-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>FAMILY PROFILE</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {member ? 'Edit family member' : 'Add family member'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Add the food needs you want ClearCart to check.
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <FieldLabel label="Name" required />
          <TextInput
            accessibilityLabel="Family member name"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            testID="family-member-name-input"
            value={name}
          />

          <FieldLabel label="Relationship" />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: relationshipOpen }}
            onPress={() => setRelationshipOpen((open) => !open)}
            style={({ pressed }) => [
              styles.dropdown,
              { backgroundColor: colors.card, borderColor: colors.input, opacity: pressed ? 0.75 : 1 },
            ]}
            testID="family-member-relationship-dropdown"
          >
            <Text style={[styles.dropdownText, { color: relationship ? colors.foreground : colors.mutedForeground }]}>
              {RELATIONSHIPS.find((option) => option.value === relationship)?.label ?? 'Choose relationship'}
            </Text>
            <Feather name={relationshipOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
          </Pressable>
          {relationshipOpen ? (
            <View style={[styles.dropdownOptions, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {RELATIONSHIPS.map((option) => {
                const selected = relationship === option.value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.value}
                    onPress={() => {
                      setRelationship((current) => current === option.value ? null : option.value);
                      setRelationshipOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      { backgroundColor: selected ? colors.blueSoft : 'transparent', opacity: pressed ? 0.72 : 1 },
                    ]}
                    testID={`family-member-relationship-${option.value}`}
                  >
                    <Text style={[styles.dropdownOptionText, { color: selected ? colors.primary : colors.foreground }]}>
                      {option.label}
                    </Text>
                    {selected ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <OptionGroup
            title="Allergies"
            description="Choose all that apply."
            options={ALLERGEN_OPTIONS}
            selected={allergies}
            onToggle={(id) => toggleSelection(allergies, setAllergies, id)}
            colors={colors}
            testIDPrefix="family-allergy"
          />
          {allergies.includes('other') ? (
            <TextInput
              accessibilityLabel="Other family member allergies"
              autoCapitalize="sentences"
              onChangeText={setCustomAllergyText}
              placeholder="Other allergies, separated by commas"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
              testID="family-member-custom-allergy-input"
              value={customAllergyText}
            />
          ) : null}

          <OptionGroup
            title="Health conditions"
            description="Optional health reminders."
            options={HEALTH_CONDITION_OPTIONS}
            selected={healthConditions}
            onToggle={(id) => toggleSelection(healthConditions, setHealthConditions, id)}
            colors={colors}
            testIDPrefix="family-health"
          />

          <OptionGroup
            title="Dietary preferences"
            description="Optional food preferences."
            options={DIETARY_PREFERENCE_OPTIONS}
            selected={dietaryPreferences}
            onToggle={(id) => toggleSelection(dietaryPreferences, setDietaryPreferences, id)}
            colors={colors}
            testIDPrefix="family-diet"
          />

          <View style={styles.noteGroup}>
            <FieldLabel label="Note (optional)" />
            <TextInput
              accessibilityLabel="Optional note"
              multiline
              onChangeText={setCustomNote}
              placeholder="Anything else to remember"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.noteInput,
                { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
              ]}
              testID="family-member-note-input"
              textAlignVertical="top"
              value={customNote}
            />
          </View>
        </View>

        {formError ? (
          <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive }]}>{formError}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={family.isSaving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary, opacity: pressed || family.isSaving ? 0.72 : 1 },
          ]}
          testID="save-family-member-button"
        >
          {family.isSaving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Feather name="check" size={18} color={colors.primaryForeground} />
          )}
          <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>
            {family.isSaving ? 'Saving…' : 'Save family member'}
          </Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
      {label}{required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
    </Text>
  );
}

function OptionGroup({
  title,
  description,
  options,
  selected,
  onToggle,
  colors,
  testIDPrefix,
}: {
  title: string;
  description: string;
  options: readonly { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  colors: ReturnType<typeof useColors>;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.optionGroup}>
      <View style={styles.groupHeading}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.groupDescription, { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      <View style={styles.optionsGrid}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              key={option.id}
              onPress={() => onToggle(option.id)}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  backgroundColor: active ? colors.blueSoft : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
              testID={`${testIDPrefix}-${option.id}`}
            >
              <Feather
                name={active ? 'check-circle' : 'circle'}
                size={16}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.optionText, { color: colors.foreground }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
  },
  messageScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  messageTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    marginTop: 16,
  },
  messageBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    paddingTop: 3,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    letterSpacing: -0.4,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  form: {
    gap: 9,
    marginTop: 24,
  },
  fieldLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 49,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  dropdown: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 49,
    paddingHorizontal: 13,
  },
  dropdownText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  dropdownOptions: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 13,
  },
  dropdownOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  optionGroup: {
    gap: 11,
    marginTop: 14,
  },
  groupHeading: {
    gap: 3,
  },
  groupDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  optionChip: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 9,
    width: '48%',
  },
  optionText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  noteGroup: {
    gap: 10,
    marginTop: 9,
  },
  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 92,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 15,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  saveButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
});
