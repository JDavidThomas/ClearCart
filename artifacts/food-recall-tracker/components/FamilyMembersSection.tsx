import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  useFamilyMembers,
  type FamilyMember,
} from '@/services/familyMembers';

function getRelationshipLabel(relationship: FamilyMember['relationship']) {
  if (!relationship) return '';
  return relationship[0].toUpperCase() + relationship.slice(1);
}

function getMemberSummary(member: FamilyMember) {
  const parts: string[] = [];
  const allergyCount = member.allergies.filter((allergy) => allergy !== 'other').length;
  if (allergyCount > 0) parts.push(`${allergyCount} ${allergyCount === 1 ? 'allergy' : 'allergies'}`);
  if (member.healthConditions.length > 0) {
    const count = member.healthConditions.length;
    parts.push(`${count} ${count === 1 ? 'condition' : 'conditions'}`);
  }
  if (member.dietaryPreferences.length > 0) {
    const count = member.dietaryPreferences.length;
    parts.push(`${count} ${count === 1 ? 'preference' : 'preferences'}`);
  }
  if (parts.length === 0) parts.push('No health or dietary details');
  const relationship = getRelationshipLabel(member.relationship);
  return relationship ? `${relationship} · ${parts.join(', ')}` : parts.join(', ');
}

function FamilyMemberRow({
  member,
  onEdit,
  onDelete,
  deleting,
}: {
  member: FamilyMember;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const responder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderMove: (_event, gesture) => {
        const base = isOpen.current ? -88 : 0;
        translateX.setValue(Math.max(-88, Math.min(0, base + gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => {
        const base = isOpen.current ? -88 : 0;
        isOpen.current = Math.max(-88, Math.min(0, base + gesture.dx)) < -44;
        Animated.spring(translateX, {
          toValue: isOpen.current ? -88 : 0,
          useNativeDriver: true,
          speed: 22,
          bounciness: 3,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
    [translateX],
  );

  return (
    <View style={styles.rowWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${member.name}`}
        disabled={deleting}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.deleteAction,
          { backgroundColor: colors.destructive, opacity: pressed || deleting ? 0.75 : 1 },
        ]}
        testID={`delete-family-member-${member.id}`}
      >
        {deleting ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <>
            <Feather name="trash-2" size={16} color={colors.primaryForeground} />
            <Text style={[styles.deleteText, { color: colors.primaryForeground }]}>Delete</Text>
          </>
        )}
      </Pressable>
      <Animated.View
        {...responder.panHandlers}
        style={[styles.rowAnimated, { transform: [{ translateX }] }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${member.name}`}
          accessibilityHint="Swipe left to reveal the delete button."
          onPress={onEdit}
          style={({ pressed }) => [
            styles.memberRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
          testID={`family-member-${member.id}`}
        >
          <View style={[styles.memberAvatar, { backgroundColor: colors.blueSoft }]}>
            <Feather name="user" size={17} color={colors.primary} />
          </View>
          <View style={styles.memberCopy}>
            <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
            <Text style={[styles.memberSummary, { color: colors.mutedForeground }]}>{getMemberSummary(member)}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function FamilyMembersSection() {
  const colors = useColors();
  const router = useRouter();
  const family = useFamilyMembers();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Family Members</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Keep household food needs together under your account.
          </Text>
        </View>
      </View>

      {family.isPending ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : family.isError ? (
        <View style={[styles.errorBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="info" size={17} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            {family.error instanceof Error
              ? family.error.message
              : 'Family profiles could not be loaded. Check your Supabase setup and connection.'}
          </Text>
        </View>
      ) : family.members.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No family members yet. Add the people whose food needs you check for.
        </Text>
      ) : (
        <View style={styles.memberList}>
          {family.members.map((member) => (
            <FamilyMemberRow
              key={member.id}
              member={member}
              deleting={family.isDeleting}
              onEdit={() => router.push({ pathname: '/family-member', params: { id: member.id } })}
              onDelete={() => void family.deleteMember(member.id).catch(() => undefined)}
            />
          ))}
        </View>
      )}

      {family.deleteError ? (
        <Text style={[styles.mutationError, { color: colors.destructive }]}>
          {family.deleteError instanceof Error ? family.deleteError.message : 'The family member could not be deleted.'}
        </Text>
      ) : null}

      {!family.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/family-member')}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          testID="add-family-member-button"
        >
          <Feather name="plus" size={18} color={colors.primaryForeground} />
          <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Add family member</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  loading: {
    marginTop: 18,
  },
  errorBox: {
    alignItems: 'flex-start',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  memberList: {
    gap: 9,
    marginTop: 14,
  },
  rowWrapper: {
    borderRadius: 15,
    height: 72,
    overflow: 'hidden',
    position: 'relative',
  },
  deleteAction: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 88,
  },
  deleteText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  rowAnimated: {
    height: '100%',
    width: '100%',
  },
  memberRow: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    height: '100%',
    paddingHorizontal: 12,
  },
  memberAvatar: {
    alignItems: 'center',
    borderRadius: 11,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  memberCopy: {
    flex: 1,
    gap: 3,
  },
  memberName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  memberSummary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  mutationError: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  addButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
