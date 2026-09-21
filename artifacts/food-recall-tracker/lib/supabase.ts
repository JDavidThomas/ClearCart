import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseConfigDiagnostics() {
  return {
    urlPrefix: supabaseUrl?.slice(0, 12) || '(empty)',
    anonKeyPrefix: supabaseAnonKey?.slice(0, 12) || '(empty)',
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
  };
}

export function getSupabaseErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'Unknown error') };
  }

  const details = error as {
    message?: unknown;
    name?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return {
    message: typeof details.message === 'string' ? details.message : 'Unknown Supabase error',
    ...(typeof details.name === 'string' ? { name: details.name } : {}),
    ...(typeof details.code === 'string' ? { code: details.code } : {}),
    ...(typeof details.status === 'number' ? { status: details.status } : {}),
    ...(typeof details.statusCode === 'number' ? { statusCode: details.statusCode } : {}),
  };
}

const configDiagnostics = getSupabaseConfigDiagnostics();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Configuration missing', configDiagnostics);
  throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

export function getAuthRedirectUrl() {
  return 'food-recall-tracker://password-reset';
}

export const AVATAR_BUCKET = 'Avatars';