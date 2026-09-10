import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Native: OS keychain/keystore via expo-secure-store. Web has no
 * browser-level equivalent, so this falls back to localStorage there —
 * that's a real, known gap (a browser XSS bug could read it), not a hidden
 * one. Closing it properly means moving the web client to httpOnly
 * session cookies set by the API, which is a bigger change than this
 * phase; tracked as a fast follow, not pretended away here.
 */
export async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private-browsing/storage-disabled — session just won't persist across reloads.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
