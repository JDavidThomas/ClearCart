import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  authGetMe,
  authLogIn,
  authSignUp,
  authUpdateProfile,
  type AuthProfilePayload,
} from '@workspace/api-client-react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  allergies: string[];
}

type AuthStatus = 'loading' | 'guest' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  profile: UserProfile | null;
  authNotice: string | null;
  guestPromptDismissed: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  continueAsGuest: () => void;
  updateAllergies: (allergies: string[]) => Promise<void>;
  dismissGuestPrompt: () => void;
}

export const ACCESS_TOKEN_KEY = '@food-recall-tracker/access-token';
const REFRESH_TOKEN_KEY = '@food-recall-tracker/refresh-token';

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getStoredAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

function toUserProfile(profile: AuthProfilePayload): UserProfile {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    allergies: profile.allergies,
  };
}

async function saveSession(accessToken: string, refreshToken: string | null) {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, accessToken],
    [REFRESH_TOKEN_KEY, refreshToken ?? ''],
  ]);
}

async function clearSession() {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [guestPromptDismissed, setGuestPromptDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        const accessToken = await getStoredAccessToken();
        if (!accessToken) {
          setStatus('guest');
          return;
        }

        const currentProfile = await authGetMe();
        if (!active) return;
        if (currentProfile) {
          setProfile(toUserProfile(currentProfile));
          setStatus('authenticated');
        } else {
          setStatus('guest');
        }
      } catch {
        if (active) {
          await clearSession();
          setProfile(null);
          setStatus('guest');
          setAuthNotice('Profile sync is unavailable, so recall checks are continuing as a guest.');
        }
      }
    };

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const signUp = async (name: string, email: string, password: string) => {
    const cleanName = name.trim();
    const cleanEmail = normalizeEmail(email);
    if (cleanName.length < 2) throw new Error('Enter your name to create a profile.');
    if (!cleanEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Use a password with at least 6 characters.');

    try {
      const response = await authSignUp({
        name: cleanName,
        email: cleanEmail,
        password,
      });
      if (!response.accessToken || !response.profile) {
        setProfile(null);
        setStatus('guest');
        setAuthNotice('Profile created. Confirm your email, then log in to use personalized alerts.');
        throw new Error('Check your email to confirm your profile, then log in.');
      }
      await saveSession(response.accessToken, response.refreshToken);
      setProfile(toUserProfile(response.profile));
      setStatus('authenticated');
      setAuthNotice(null);
      setGuestPromptDismissed(false);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Check your email')) throw error;
      await clearSession();
      setProfile(null);
      setStatus('guest');
      setAuthNotice('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error('We could not reach your profile service. You can continue as a guest.');
    }
  };

  const logIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@') || password.length < 6) {
      throw new Error('Enter the email and password for your profile.');
    }

    try {
      const response = await authLogIn({ email: cleanEmail, password });
      if (!response.accessToken || !response.profile) {
        throw new Error('Your profile needs email confirmation before you can log in.');
      }
      await saveSession(response.accessToken, response.refreshToken);
      setProfile(toUserProfile(response.profile));
      setStatus('authenticated');
      setAuthNotice(null);
      setGuestPromptDismissed(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('confirmation')) throw error;
      if (message.includes('Invalid') || message.includes('credentials')) {
        throw error;
      }
      await clearSession();
      setProfile(null);
      setStatus('guest');
      setAuthNotice('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error('We could not reach your profile service. You can continue as a guest.');
    }
  };

  const logOut = async () => {
    await clearSession();
    setProfile(null);
    setStatus('guest');
    setAuthNotice(null);
    setGuestPromptDismissed(false);
  };

  const continueAsGuest = () => {
    void clearSession();
    setProfile(null);
    setStatus('guest');
    setAuthNotice(null);
  };

  const updateAllergies = async (allergies: string[]) => {
    if (!profile) return;
    try {
      const updatedProfile = await authUpdateProfile({ allergies });
      setProfile(toUserProfile(updatedProfile));
    } catch {
      await clearSession();
      setProfile(null);
      setStatus('guest');
      setAuthNotice('Profile sync is unavailable, so recall checks are continuing as a guest.');
      throw new Error('Your profile could not be updated. Recall checks are still available as a guest.');
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      authNotice,
      guestPromptDismissed,
      signUp,
      logIn,
      logOut,
      continueAsGuest,
      updateAllergies,
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