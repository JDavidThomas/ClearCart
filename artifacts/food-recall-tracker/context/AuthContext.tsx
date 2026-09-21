import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as NativeImage } from 'react-native';
import { AVATAR_BUCKET, getAuthRedirectUrl, getSupabaseErrorDetails, logSupabaseDiagnostic, supabase } from '@/lib/supabase';

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
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  resendConfirmationEmail: (email: string) => Promise<void>;
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

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
  email: string;
}

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
      logSupabaseDiagnostic('profiles.select.failed', error);
      throw error;
    }

    if (data) {
      const nextProfile = toUserProfile(data as ProfileRow, email);
      setProfile(nextProfile);
      return nextProfile;
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
      logSupabaseDiagnostic('profiles.upsert.failed', insertError);
      throw insertError;
    }
    const nextProfile = toUserProfile(inserted as ProfileRow, email);
    setProfile(nextProfile);
    return nextProfile;
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
        logSupabaseDiagnostic('session.restore.failed', error);
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
          logSupabaseDiagnostic('session.auth-state-profile-load.failed', error);
          if (mounted) enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
        });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Use a password with at least 6 characters.');

    try {
      logSupabaseDiagnostic('auth.sign-up.started');
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) {
        logSupabaseDiagnostic('auth.sign-up.failed', error);
        throw new Error(authErrorMessage(error, 'We could not create your account.'));
      }
      if (!data.session || !data.user) {
        logSupabaseDiagnostic('auth.sign-up.awaiting-email-confirmation');
        return { requiresEmailConfirmation: true, email: cleanEmail };
      }

      await loadProfile(data.user);
      setAuthNotice(null);
      setStatus('authenticated');
      setGuestPromptDismissed(false);
      return { requiresEmailConfirmation: false, email: cleanEmail };
    } catch (error) {
      const details = getSupabaseErrorDetails(error);
      logSupabaseDiagnostic('auth.sign-up.exception', error);
      if (error instanceof Error && /already registered|already exists|invalid/i.test(error.message)) throw error;
      enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error(`Supabase sign-up failed: ${details.message}`);
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@')) throw new Error('Enter a valid email address.');

    const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
    if (error) {
      logSupabaseDiagnostic('auth.confirmation-resend.failed', error);
      throw new Error(authErrorMessage(error, 'We could not resend the confirmation email.'));
    }
    logSupabaseDiagnostic('auth.confirmation-resend.succeeded');
  };

  const logIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@') || password.length < 6) {
      throw new Error('Enter the email and password for your profile.');
    }

    try {
      logSupabaseDiagnostic('auth.log-in.started');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        logSupabaseDiagnostic('auth.log-in.failed', error);
        throw new Error(authErrorMessage(error, 'We could not log you in.'));
      }
      if (!data.user) throw new Error('We could not load your account.');

      await loadProfile(data.user);
      setAuthNotice(null);
      setStatus('authenticated');
      setGuestPromptDismissed(false);
    } catch (error) {
      const details = getSupabaseErrorDetails(error);
      logSupabaseDiagnostic('auth.log-in.exception', error);
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
      logSupabaseDiagnostic('auth.password-reset.failed', error);
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
      const details = getSupabaseErrorDetails(error);
      logSupabaseDiagnostic('profiles.update.failed', error);
      enterGuestMode('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error(`Your profile could not be updated: ${details.message}`);
    }
    setProfile(toUserProfile(data as ProfileRow, profile.email));
  };

  const uploadAvatar = async (uri: string) => {
    if (!profile) throw new Error('Log in to upload a profile photo.');
    const path = `${profile.id}.jpg`;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData.session;
    console.info('[Supabase] avatar upload prepared', {
      bucket: AVATAR_BUCKET,
      path,
      hasSession: Boolean(session),
      sessionUserMatchesProfile: session?.user.id === profile.id,
    });
    if (sessionError || !session?.user) {
      logSupabaseDiagnostic('storage.avatar-upload.session-missing', sessionError);
      throw new Error('Your login session is not ready. Please log in again before uploading a photo.');
    }
    if (session.user.id !== profile.id) {
      logSupabaseDiagnostic('storage.avatar-upload.session-user-mismatch');
      throw new Error('Your login session does not match this profile. Please log in again before uploading a photo.');
    }

    console.info('[Supabase] avatar upload started', { bucket: AVATAR_BUCKET, path, sourceUri: uri });
    let uploadUri = uri;
    try {
      const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        NativeImage.getSize(uri, (imageWidth, imageHeight) => resolve({ width: imageWidth, height: imageHeight }), reject);
      });
      const scale = Math.min(1, 512 / Math.max(width, height));
      const actions = scale < 1
        ? [{ resize: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) } }]
        : [];
      const compressed = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      });
      uploadUri = compressed.uri;
      console.info('[Supabase] avatar compression complete', { bucket: AVATAR_BUCKET, path, uploadUri });
    } catch (compressionError) {
      console.warn('[Supabase] avatar compression skipped', compressionError);
    }

    let body: ArrayBuffer;
    try {
      const response = await fetch(uploadUri);
      if (!response.ok) throw new Error(`Photo file could not be read (${response.status}).`);
      body = await response.arrayBuffer();
      console.info('[Supabase] avatar file read', { bucket: AVATAR_BUCKET, path, bytes: body.byteLength });
    } catch (fileError) {
      console.error('[Supabase] avatar file read failed', { bucket: AVATAR_BUCKET, path, error: fileError });
      throw new Error(authErrorMessage(fileError, 'We could not prepare that photo for upload.'));
    }

    const storage = supabase.storage.from(AVATAR_BUCKET);
    console.info('[Supabase] avatar storage upload started', { bucket: AVATAR_BUCKET, path });
    const { data: uploadData, error } = await storage.upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.error('[Supabase] avatar storage upload failed', { bucket: AVATAR_BUCKET, path, error });
      logSupabaseDiagnostic('storage.avatar-upload.failed', error);
      throw new Error(authErrorMessage(error, 'We could not upload that photo.'));
    }
    console.info('[Supabase] avatar storage upload succeeded', { bucket: AVATAR_BUCKET, path, result: uploadData });

    const { data: verifiedFile, error: verificationError } = await storage.download(path);
    if (verificationError || !verifiedFile) {
      console.error('[Supabase] avatar storage verification failed', {
        bucket: AVATAR_BUCKET,
        path,
        error: verificationError ?? 'No file returned',
      });
      throw new Error(authErrorMessage(verificationError, 'The photo uploaded but could not be verified in storage.'));
    }
    console.info('[Supabase] avatar storage verification succeeded', {
      bucket: AVATAR_BUCKET,
      path,
      bytes: verifiedFile.size,
    });

    const { data: publicUrlData } = storage.getPublicUrl(path);
    const avatarUrl = `${publicUrlData.publicUrl}${publicUrlData.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    console.info('[Supabase] avatar public URL generated', { bucket: AVATAR_BUCKET, path, avatarUrl });

    try {
      await updateProfile({ avatarUrl });
      console.info('[Supabase] profile avatar_url update succeeded', { profileId: profile.id, avatarUrl });
    } catch (profileError) {
      console.error('[Supabase] profile avatar_url update failed', { profileId: profile.id, avatarUrl, error: profileError });
      throw profileError;
    }

    const refreshedProfile = await loadProfile(session.user);
    console.info('[Supabase] profile re-fetch succeeded', {
      profileId: refreshedProfile.id,
      avatarUrl: refreshedProfile.avatarUrl,
    });
    if (!refreshedProfile.avatarUrl) {
      throw new Error('The photo uploaded, but the refreshed profile has no avatar URL.');
    }
    return refreshedProfile.avatarUrl;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      authNotice,
      guestPromptDismissed,
      signUp,
      resendConfirmationEmail,
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