import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "resse.session";

export type GoogleProfile = {
  name: string;
  email: string;
  picture?: string;
};

export type Session = {
  idToken: string;
  accessToken: string;
  /** Epoch ms when accessToken expires. Only accessToken is short-lived here;
   * there is no refresh flow yet — signing in again is the only way back in
   * once it expires. Fine for a demo, not for a kiosk left running for days. */
  expiresAt: number;
  profile: GoogleProfile;
};

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
