import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

const PROFILE_KEY = '@food-recall-tracker/local-profile';
const SESSION_KEY = '@food-recall-tracker/local-session';

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createLocalId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
        const [sessionValue, profileValue] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);

        if (!active) return;
        if (sessionValue === 'authenticated' && profileValue) {
          setProfile(JSON.parse(profileValue) as UserProfile);
          setStatus('authenticated');
        } else {
          setStatus('guest');
        }
      } catch {
        if (active) {
          setStatus('guest');
          setAuthNotice('Your profile could not be loaded, so recall checks are continuing as a guest.');
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

    const nextProfile: UserProfile = {
      id: createLocalId(),
      name: cleanName,
      email: cleanEmail,
      allergies: [],
    };
    await AsyncStorage.multiSet([
      [PROFILE_KEY, JSON.stringify(nextProfile)],
      [SESSION_KEY, 'authenticated'],
    ]);
    setProfile(nextProfile);
    setStatus('authenticated');
    setAuthNotice('Your profile is saved on this device while account sync is unavailable.');
    setGuestPromptDismissed(false);
  };

  const logIn = async (email: string, password: string) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes('@') || password.length < 1) {
      throw new Error('Enter the email and password for your profile.');
    }

    const storedProfileValue = await AsyncStorage.getItem(PROFILE_KEY);
    const storedProfile = storedProfileValue
      ? (JSON.parse(storedProfileValue) as UserProfile)
      : null;

    if (!storedProfile || storedProfile.email !== cleanEmail) {
      throw new Error('No profile was found on this device for that email. Create a profile first.');
    }

    await AsyncStorage.setItem(SESSION_KEY, 'authenticated');
    setProfile(storedProfile);
    setStatus('authenticated');
    setAuthNotice('Your profile is saved on this device while account sync is unavailable.');
    setGuestPromptDismissed(false);
  };

  const logOut = async () => {
    await AsyncStorage.setItem(SESSION_KEY, 'guest');
    setProfile(null);
    setStatus('guest');
    setAuthNotice(null);
    setGuestPromptDismissed(false);
  };

  const continueAsGuest = () => {
    setProfile(null);
    setStatus('guest');
    setAuthNotice(null);
  };

  const updateAllergies = async (allergies: string[]) => {
    if (!profile) return;
    const nextProfile = { ...profile, allergies };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    setProfile(nextProfile);
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