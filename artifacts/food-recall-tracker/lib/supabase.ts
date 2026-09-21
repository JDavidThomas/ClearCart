import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function getKeyType(key: string | undefined) {
  if (!key) return 'missing';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  if (key.startsWith('eyJ')) return 'legacy-jwt';
  return 'other';
}

export function getSupabaseConfigDiagnostics() {
  let urlOrigin: string | null = null;
  if (supabaseUrl) {
    try {
      urlOrigin = new URL(supabaseUrl).origin;
    } catch {
      urlOrigin = 'invalid-url';
    }
  }

  return {
    urlConfigured: Boolean(supabaseUrl),
    urlOrigin,
    keyConfigured: Boolean(supabaseAnonKey),
    keyType: getKeyType(supabaseAnonKey),
    keyLength: supabaseAnonKey?.length ?? 0,
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

export function logSupabaseDiagnostic(operation: string, error?: unknown) {
  const payload = {
    operation,
    config: getSupabaseConfigDiagnostics(),
    ...(error ? { error: getSupabaseErrorDetails(error) } : {}),
  };
  if (error) {
    console.warn('[Supabase diagnostic]', payload);
  } else {
    console.info('[Supabase diagnostic]', payload);
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Configuration missing', configDiagnostics);
  logSupabaseDiagnostic('client.initialization.missing-config');
  throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

logSupabaseDiagnostic('client.initialization');

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