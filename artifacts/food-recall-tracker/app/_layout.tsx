import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, getStoredAccessToken } from '@/context/AuthContext';
import {
  getSupabaseConfigDiagnostics,
  getSupabaseErrorDetails,
  refreshSupabaseSessionOnAppStart,
  supabase,
} from '@/lib/supabase';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { getCurrentApiBaseUrl } from '@/services/apiConnection';
import { initializeApiBaseUrl } from '@/services/apiConnectionRuntime';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
setBaseUrl(getCurrentApiBaseUrl());
setAuthTokenGetter(getStoredAccessToken);

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="photo-check" options={{ headerShown: false }} />
      <Stack.Screen name="allergen-setup" options={{ headerShown: false }} />
      <Stack.Screen name="family-member" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      <Stack.Screen name="email-confirmation" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="password-reset" options={{ headerShown: false }} />
    </Stack>
  );
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Supabase diagnostic timed out after ${milliseconds / 1000} seconds.`)), milliseconds);
    }),
  ]);
}

function SupabaseDebugBanner() {
  const config = getSupabaseConfigDiagnostics();
  const [status, setStatus] = React.useState('checking…');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const runDiagnostics = async (refreshAtStartup = false) => {
      try {
        const session = await withTimeout(
          refreshAtStartup
            ? refreshSupabaseSessionOnAppStart()
            : supabase.auth.getSession().then(({ data }) => data.session),
          8_000,
        );

        if (!session) {
          if (mounted) setStatus('connected · no session');
          return;
        }

        const { error: profilesError } = await withTimeout(
          supabase.from('profiles').select('id').limit(1),
          8_000,
        );
        if (profilesError) {
          const details = getSupabaseErrorDetails(profilesError);
          console.error('[Supabase] profiles probe failed', details);
          if (mounted) {
            setStatus('profiles probe failed');
            setErrorMessage(details.message);
          }
          return;
        }

        console.log('[Supabase] diagnostics passed', {
          hasSession: true,
          profilesReachable: true,
        });
        if (mounted) setStatus('connected · session found');
      } catch (error) {
        const details = getSupabaseErrorDetails(error);
        console.error('[Supabase] diagnostics failed', details);
        if (mounted) {
          setStatus('connection failed');
          setErrorMessage(details.message);
        }
      }
    };

    void runDiagnostics(true);
    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void runDiagnostics();
      }, 0);
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  if (!__DEV__) return null;

  return (
    <View pointerEvents="none" style={styles.debugBanner}>
      <Text style={styles.debugTitle}>Supabase diagnostics</Text>
      <Text style={styles.debugText}>
        URL: {config.urlOrigin ?? 'missing'} · Key: {config.keyType} ({config.keyLength} chars)
      </Text>
      <Text style={styles.debugText}>Status: {status}</Text>
      {errorMessage ? <Text style={styles.debugError}>Error: {errorMessage}</Text> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    void initializeApiBaseUrl();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SupabaseDebugBanner />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  debugBanner: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderRadius: 10,
    borderWidth: 1,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 1000,
  },
  debugTitle: {
    color: '#9a3412',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  debugText: {
    color: '#7c2d12',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 2,
  },
  debugError: {
    color: '#b91c1c',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    marginTop: 2,
  },
});
