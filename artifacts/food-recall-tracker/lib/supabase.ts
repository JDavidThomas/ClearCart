import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseJwtRecoveryFetch } from './supabaseJwtRecovery';

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

type SessionRefreshResult = {
  accessToken: string | null;
  session: Session | null;
  error: unknown | null;
};

let supabaseClient: SupabaseClient | null = null;
let sessionRefreshPromise: Promise<SessionRefreshResult> | null = null;
let startupSessionPromise: Promise<Session | null> | null = null;

function refreshCurrentSession(reason: 'app-start' | 'jwt-future') {
  if (sessionRefreshPromise) return sessionRefreshPromise;

  const operation = (async (): Promise<SessionRefreshResult> => {
    if (!supabaseClient) {
      return {
        accessToken: null,
        session: null,
        error: new Error('Supabase client is not initialized.'),
      };
    }

    try {
      const { data, error } = await supabaseClient.auth.refreshSession();
      if (error) {
        logSupabaseDiagnostic(
          reason === 'app-start'
            ? 'auth.session.startup-refresh.failed'
            : 'auth.jwt-future.refresh.failed',
          error,
        );
        return { accessToken: null, session: null, error };
      }

      const session = data.session ?? null;
      logSupabaseDiagnostic(
        reason === 'app-start'
          ? 'auth.session.startup-refresh.succeeded'
          : 'auth.jwt-future.refresh.succeeded',
      );
      return {
        accessToken: session?.access_token ?? null,
        session,
        error: null,
      };
    } catch (error) {
      logSupabaseDiagnostic(
        reason === 'app-start'
          ? 'auth.session.startup-refresh.exception'
          : 'auth.jwt-future.refresh.exception',
        error,
      );
      return { accessToken: null, session: null, error };
    }
  })();

  sessionRefreshPromise = operation.finally(() => {
    sessionRefreshPromise = null;
  });
  return sessionRefreshPromise;
}

const supabaseFetch = createSupabaseJwtRecoveryFetch(async () => {
  const result = await refreshCurrentSession('jwt-future');
  return result.accessToken;
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  global: { fetch: supabaseFetch },
});
supabaseClient = supabase;

export function refreshSupabaseSessionOnAppStart(): Promise<Session | null> {
  if (!startupSessionPromise) {
    startupSessionPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          logSupabaseDiagnostic('auth.session.startup-read.failed', error);
          return data.session ?? null;
        }

        const storedSession = data.session ?? null;
        if (!storedSession) {
          logSupabaseDiagnostic('auth.session.startup.no-session');
          return null;
        }

        logSupabaseDiagnostic('auth.session.startup-refresh.started');
        const refreshed = await refreshCurrentSession('app-start');
        if (refreshed.error || !refreshed.session) {
          return storedSession;
        }
        return refreshed.session;
      } catch (error) {
        logSupabaseDiagnostic('auth.session.startup-refresh.exception', error);
        return null;
      }
    })();
  }
  return startupSessionPromise;
}

export function getAuthRedirectUrl() {
  return 'food-recall-tracker://password-reset';
}

export const AVATAR_BUCKET = 'Avatars';