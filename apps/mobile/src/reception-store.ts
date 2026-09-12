/**
 * Persists the reception snapshot (business info, clients, appointments)
 * across screens and app restarts. Before this existed, `useReceptionAgent`
 * kept it in plain `useState(initialReception)` — fine for a single chat
 * screen, but it meant a booking made in the Chat/Receptionist screen
 * vanished the moment you navigated to the admin dashboard (a fresh mount
 * got a fresh `initialReception` again). Every screen that reads or writes
 * reception data now goes through this store instead.
 *
 * Uses AsyncStorage, not SecureStore (see auth.ts/org.ts) — this data isn't
 * a secret, and SecureStore's underlying Android Keystore has a ~2KB
 * per-item limit that an appointments/clients list can realistically outgrow.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initialReception, type ReceptionSnapshot } from "@/reception";
import { loadOrg } from "@/org";

const RECEPTION_KEY = "resse.reception";

async function applyOrgOverride(snapshot: ReceptionSnapshot): Promise<ReceptionSnapshot> {
  const org = await loadOrg();
  if (!org) return snapshot;
  return {
    ...snapshot,
    business: {
      ...snapshot.business,
      name: org.name,
      hours: org.hours,
      services: org.services,
      phone: org.phone,
      email: org.email,
      address: org.address,
      website: org.website,
      description: org.description,
      upiId: org.upiId,
      bookingDepositAmount: org.bookingDepositAmount,
    },
  };
}

/** Loads the persisted snapshot (falling back to the bundled demo data on
 * first run), then layers the saved organization's scraped/edited business
 * fields on top — org.ts remains the source of truth for business info,
 * this store for clients/appointments. */
export async function loadReceptionSnapshot(): Promise<ReceptionSnapshot> {
  const raw = await AsyncStorage.getItem(RECEPTION_KEY);
  let snapshot = initialReception;
  if (raw) {
    try {
      snapshot = JSON.parse(raw) as ReceptionSnapshot;
    } catch {
      snapshot = initialReception;
    }
  }
  return applyOrgOverride(snapshot);
}

export async function saveReceptionSnapshot(snapshot: ReceptionSnapshot): Promise<void> {
  await AsyncStorage.setItem(RECEPTION_KEY, JSON.stringify(snapshot));
}
