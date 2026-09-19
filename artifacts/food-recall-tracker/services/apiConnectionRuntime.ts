import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBaseUrl } from '@workspace/api-client-react';
import {
  API_BASE_URL_CACHE_KEY,
  getCurrentApiBaseUrl,
  resolveApiBaseUrl,
  type ApiUrlStorage,
} from './apiConnection';

const storage: ApiUrlStorage = AsyncStorage;

async function readCachedApiBaseUrl() {
  return storage.getItem(API_BASE_URL_CACHE_KEY);
}

export async function clearCachedApiBaseUrl() {
  await storage.removeItem(API_BASE_URL_CACHE_KEY);
}

export async function initializeApiBaseUrl() {
  const currentApiBaseUrl = getCurrentApiBaseUrl();

  if (currentApiBaseUrl) {
    // A fresh bundle has the current Replit domain. Discard any server URL
    // saved by an older bundle so it can never override the environment.
    await clearCachedApiBaseUrl();
    setBaseUrl(currentApiBaseUrl);
    return currentApiBaseUrl;
  }

  const cachedApiBaseUrl = await readCachedApiBaseUrl();
  const resolvedApiBaseUrl = resolveApiBaseUrl(null, cachedApiBaseUrl);
  setBaseUrl(resolvedApiBaseUrl);
  return resolvedApiBaseUrl;
}

export async function refreshApiBaseUrl() {
  await clearCachedApiBaseUrl();
  const currentApiBaseUrl = getCurrentApiBaseUrl();
  setBaseUrl(currentApiBaseUrl);
  return currentApiBaseUrl;
}

export async function configureApiBaseUrl() {
  const currentApiBaseUrl = getCurrentApiBaseUrl();
  const cachedApiBaseUrl = currentApiBaseUrl ? null : await readCachedApiBaseUrl();
  const resolvedApiBaseUrl = resolveApiBaseUrl(currentApiBaseUrl, cachedApiBaseUrl);
  setBaseUrl(resolvedApiBaseUrl);
  return resolvedApiBaseUrl;
}

export async function cacheApiBaseUrl(apiBaseUrl: string) {
  const normalizedApiBaseUrl = resolveApiBaseUrl(apiBaseUrl, null);
  if (normalizedApiBaseUrl) {
    await storage.setItem(API_BASE_URL_CACHE_KEY, normalizedApiBaseUrl);
  }
}
