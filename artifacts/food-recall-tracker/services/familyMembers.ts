import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  getSupabaseErrorDetails,
  logSupabaseDiagnostic,
  supabase,
} from '@/lib/supabase';

export type FamilyRelationship = 'spouse' | 'child' | 'parent' | 'other';

export interface FamilyMember {
  id: string;
  ownerId: string;
  name: string;
  relationship: FamilyRelationship | null;
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
  customNote: string;
  createdAt: string;
}

export interface FamilyMemberValues {
  name: string;
  relationship: FamilyRelationship | null;
  allergies: string[];
  healthConditions: string[];
  dietaryPreferences: string[];
  customNote: string;
}

export interface SaveFamilyMemberInput extends FamilyMemberValues {
  id?: string;
}

interface FamilyMemberRow {
  id: string;
  owner_id: string;
  name: string;
  relationship: FamilyRelationship | null;
  allergies: string[] | null;
  health_conditions: string[] | null;
  dietary_preferences: string[] | null;
  custom_note: string | null;
  created_at: string;
}

const FAMILY_MEMBERS_QUERY_KEY = 'family-members';

function toFamilyMember(row: FamilyMemberRow): FamilyMember {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    relationship: row.relationship,
    allergies: row.allergies ?? [],
    healthConditions: row.health_conditions ?? [],
    dietaryPreferences: row.dietary_preferences ?? [],
    customNote: row.custom_note ?? '',
    createdAt: row.created_at,
  };
}

function getFamilyMemberError(error: unknown, operation: string) {
  const details = getSupabaseErrorDetails(error);
  logSupabaseDiagnostic(`family-members.${operation}.failed`, error);

  if (
    details.code === '42P01' ||
    details.code === 'PGRST205' ||
    /family_members.*(not found|schema cache|does not exist)/i.test(details.message) ||
    /does not exist.*family_members/i.test(details.message)
  ) {
    return new Error('Family profiles are not set up yet. Run supabase/family-members.sql in your Supabase project.');
  }
  if (details.code === '42501') {
    return new Error('Supabase blocked this family profile request. Check the family_members row-level security policies.');
  }
  const action = operation === 'select' ? 'loaded' : operation === 'delete' ? 'deleted' : 'saved';
  return new Error(`Family profiles could not be ${action}. ${details.message}`);
}

export async function listFamilyMembers(ownerId: string) {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) throw getFamilyMemberError(error, 'select');
  return (data as FamilyMemberRow[]).map(toFamilyMember);
}

export async function saveFamilyMember(ownerId: string, input: SaveFamilyMemberInput) {
  const values = {
    owner_id: ownerId,
    name: input.name.trim(),
    relationship: input.relationship,
    allergies: input.allergies,
    health_conditions: input.healthConditions,
    dietary_preferences: input.dietaryPreferences,
    custom_note: input.customNote.trim() || null,
  };
  const query = input.id
    ? supabase.from('family_members').update(values).eq('id', input.id).eq('owner_id', ownerId)
    : supabase.from('family_members').insert(values);
  const { data, error } = await query.select('*').single();
  if (error) throw getFamilyMemberError(error, input.id ? 'update' : 'insert');
  return toFamilyMember(data as FamilyMemberRow);
}

export async function deleteFamilyMember(ownerId: string, id: string) {
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);
  if (error) throw getFamilyMemberError(error, 'delete');
}

export function useFamilyMembers() {
  const { status, profile } = useAuth();
  const ownerId = status === 'authenticated' ? profile?.id : undefined;
  const queryClient = useQueryClient();
  const queryKey = [FAMILY_MEMBERS_QUERY_KEY, ownerId];
  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!ownerId) throw new Error('Log in to view family profiles.');
      return listFamilyMembers(ownerId);
    },
    enabled: Boolean(ownerId),
    staleTime: 60_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (input: SaveFamilyMemberInput) => {
      if (!ownerId) throw new Error('Log in to save family profiles.');
      return saveFamilyMember(ownerId, input);
    },
    onSuccess: (savedMember) => {
      queryClient.setQueryData<FamilyMember[]>(queryKey, (current = []) => {
        const alreadyExists = current.some((member) => member.id === savedMember.id);
        return alreadyExists
          ? current.map((member) => member.id === savedMember.id ? savedMember : member)
          : [...current, savedMember].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!ownerId) throw new Error('Log in to delete family profiles.');
      return deleteFamilyMember(ownerId, id);
    },
    onSuccess: (_result, deletedId) => {
      queryClient.setQueryData<FamilyMember[]>(queryKey, (current = []) =>
        current.filter((member) => member.id !== deletedId),
      );
    },
  });

  return {
    ...query,
    members: query.data ?? [],
    saveMember: saveMutation.mutateAsync,
    deleteMember: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    saveError: saveMutation.error,
    deleteError: deleteMutation.error,
  };
}
