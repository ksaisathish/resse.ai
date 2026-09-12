/**
 * Persisted app preferences, editable from the admin Settings tab
 * (admin-settings.tsx). Kept separate from org.ts (business identity/profile)
 * and auth.ts (Google session) — this is device/app behavior, not business
 * data or credentials.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "resse.settings";

export type TtsMode = "robotic" | "realistic";

export interface AppSettings {
  /** "robotic" (default, free, on-device) vs "realistic" (cloud voice via
   * /api/tts, small per-character cost). Falls back to
   * EXPO_PUBLIC_TTS_MODE when no preference has been saved yet. */
  ttsMode: TtsMode;
  /** Whether the Receptionist screen renders the full-screen talking avatar
   * video, or just the status/presence UI. Some businesses may prefer a
   * plain, faceless kiosk. Defaults to true. */
  avatarEnabled: boolean;
}

function defaultSettings(): AppSettings {
  return {
    ttsMode: process.env.EXPO_PUBLIC_TTS_MODE === "realistic" ? "realistic" : "robotic",
    avatarEnabled: true,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings();
  try {
    return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
