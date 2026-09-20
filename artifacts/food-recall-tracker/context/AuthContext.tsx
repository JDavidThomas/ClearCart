import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAuthRedirectUrl, getSupabaseErrorDetails, supabase } from '@/lib/supabase';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | null;

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  allergies: string[];
  customAllergy: string;
  severity: AllergySeverity;
}

type AuthStatus = 'loading' | 'guest' | 'authenticated';

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  allergies: string[] | null;
  custom_allergy: string | null;
  severity: AllergySeverity;
  created_at?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  profile: UserProfile | null;
  authNotice: string | null;
  guestPromptDismissed: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  continueAsGuest: () => void;
  updateProfile: (updates: {
    displayName?: string;
    allergies?: string[];
    customAllergy?: string;
    severity?: AllergySeverity;
    avatarUrl?: string | null;
  }) => Promise<void>;
  uploadAvatar: (uri: string) => Promise<string>;
  dismissGuestPrompt: () => void;
}

export const ACCESS_TOKEN_KEY = '@food-recall-tracker/access-token';

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email: string) {
  const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!localPart) return 'Food safety member';
  return localPart.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toUserProfile(row: ProfileRow, email: string): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || displayNameFromEmail(email),
    email,
    avatarUrl: row.avatar_url,
    allergies: row.allergies ?? [],
    customAllergy: row.custom_allergy ?? '',
    severity: row.severity ?? null,
  };
}

function authErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export async function getStoredAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [guestPromptDismissed, setGuestPromptDismissed] = useState(false);

  const enterGuestMode = (notice?: string) => {
    setProfile(null);
    setStatus('guest');
    if (notice) setAuthNotice(notice);
  };

  const loadProfile = async (user: { id: string; email?: string | null }) => {
    const email = user.email ?? '';
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      console.error('[Supabase] profiles select failed', getSupabaseErrorDetails(error));
      throw error;
    }

    if (data) {
      setProfile(toUserProfile(data as ProfileRow, email));
      return;
    }

    const initialProfile = {
      id: user.id,
      display_name: displayNameFromEmail(email),
      avatar_url: null,
      allergies: [],
      custom_allergy: null,
      severity: null,
    };
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert(initialProfile, { onConflict: 'id' })
      .select('*')
      .single();
    if (insertError) {
      console.error('[Supabase] profiles upsert failed', getSupabaseErrorDetails(insertError));
      throw insertError;
    }
    setProfile(toUserProfile(inserted as ProfileRow, email));
  };

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!data.session?.user) {
          setStatus('guest');
          return;
        }
        await loadProfile(data.session.user);
        if (mounted) {
          setAuthNotice(null);
          setStatus('authenticated');
        }
      } catch (error) {
        console.error('[Supabase] session restore failed', getSupabaseErrorDetails(error));
        if (mounted) {
          await supabase.auth.signOut().catch(() => undefined);
          enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
        }
      }
    };

    void restoreSession();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || event === 'INITIAL_SESSION') return;
      if (!session?.user) {
        enterGuestMode();
        return;
      }
      void loadProfile(session.user)
        .then(() => {
          if (mounted) {
            setAuthNotice(null);
            setStatus('authenticated');
          }
        })
        .catch((error) => {
          console.error('[Supabase] auth state profile load failed', getSupabaseErrorDetails(error));
          if (mounted) enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
        });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Use a password with at least 6 characters.');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) throw new Error(authErrorMessage(error, 'We could not create your account.'));
      if (!data.session || !data.user) {
        throw new Error('Check your email to confirm your account, then log in.');
      }

      await loadProfile(data.user);
      setAuthNotice(null);
      setStatus('authenticated');
      setGuestPromptDismissed(false);
    } catch (error) {
      const details = getSupabaseErrorDetails(error);
      console.error('[Supabase] signUp failed', details);
      if (error instanceof Error && error.message.startsWith('Check your email')) throw error;
      if (error instanceof Error && /already registered|already exists|invalid/i.test(error.message)) throw error;
      enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error(`Supabase sign-up failed: ${details.message}`);
    }
  };

  const logIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@') || password.length < 6) {
      throw new Error('Enter the email and password for your profile.');
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw new Error(authErrorMessage(error, 'We could not log you in.'));
      if (!data.user) throw new Error('We could not load your account.');

      await loadProfile(data.user);
      setAuthNotice(null);
      setStatus('authenticated');
      setGuestPromptDismissed(false);
    } catch (error) {
      const details = getSupabaseErrorDetails(error);
      console.error('[Supabase] logIn failed', details);
      if (error instanceof Error && /invalid login|invalid credentials|email not confirmed/i.test(error.message)) {
        throw error;
      }
      enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error(`Supabase login failed: ${details.message}`);
    }
  };

  const sendPasswordReset = async (email: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@')) throw new Error('Enter the email address for your account.');
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getAuthRedirectUrl(),
    });
    if (error) {
      console.error('[Supabase] password reset failed', getSupabaseErrorDetails(error));
      throw new Error(authErrorMessage(error, 'We could not send the reset email.'));
    }
  };

  const logOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(authErrorMessage(error, 'We could not log you out.'));
    enterGuestMode();
    setAuthNotice(null);
    setGuestPromptDismissed(false);
  };

  const continueAsGuest = () => {
    void supabase.auth.signOut().catch(() => undefined);
    enterGuestMode();
    setAuthNotice(null);
  };

  const updateProfile = async (updates: {
    displayName?: string;
    allergies?: string[];
    customAllergy?: string;
    severity?: AllergySeverity;
    avatarUrl?: string | null;
  }) => {
    if (!profile) throw new Error('Log in to update your profile.');
    const payload: Partial<ProfileRow> = {};
    if (updates.displayName !== undefined) payload.display_name = updates.displayName.trim();
    if (updates.allergies !== undefined) payload.allergies = updates.allergies;
    if (updates.customAllergy !== undefined) payload.custom_allergy = updates.customAllergy.trim() || null;
    if (updates.severity !== undefined) payload.severity = updates.severity;
    if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profile.id)
      .select('*')
      .single();
    if (error) {
      console.error('[Supabase] profile update failed', getSupabaseErrorDetails(error));
      enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error('Your profile could not be updated. Recall checks are still available as a guest.');
    }
    setProfile(toUserProfile(data as ProfileRow, profile.email));
  };

  const uploadAvatar = async (uri: string) => {
    if (!profile) throw new Error('Log in to upload a profile photo.');
    const response = await fetch(uri);
    const body = await response.arrayBuffer();
    const path = `${profile.id}.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.error('[Supabase] avatar upload failed', getSupabaseErrorDetails(error));
      throw new Error(authErrorMessage(error, 'We could not upload that photo.'));
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await updateProfile({ avatarUrl: `${data.publicUrl}?v=${Date.now()}` });
    return data.publicUrl;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      authNotice,
      guestPromptDismissed,
      signUp,
      logIn,
      sendPasswordReset,
      logOut,
      continueAsGuest,
      updateProfile,
      uploadAvatar,
      dismissGuestPrompt: () => setGuestPromptDismissed(true),
    }),
    [authNotice, guestPromptDismissed, profile, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}