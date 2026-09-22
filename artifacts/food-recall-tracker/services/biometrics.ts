import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

export const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export type BiometricKind = 'fingerprint' | 'face';

export interface BiometricAvailability {
  enabled: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  kind: BiometricKind | null;
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const enabled = (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { enabled, hasHardware: false, isEnrolled: false, kind: null };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const kind = supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'face'
      : supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : null;

    return { enabled, hasHardware, isEnrolled, kind };
  } catch {
    return { enabled, hasHardware: false, isEnrolled: false, kind: null };
  }
}

export async function setBiometricEnabled(enabled: boolean) {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  }
}

export function isBiometricCancellation(error?: string) {
  return error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel';
}

export async function authenticateWithBiometrics(promptMessage: string) {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Use password instead',
    fallbackLabel: 'Use password instead',
  });
}