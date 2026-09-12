import * as SecureStore from "expo-secure-store";
import type { BusinessInfo } from "@/reception";

const ORG_KEY = "resse.org";

export type OrgBusiness = BusinessInfo & {
  sourceUrl?: string;
};

export async function saveOrg(business: OrgBusiness): Promise<void> {
  await SecureStore.setItemAsync(ORG_KEY, JSON.stringify(business));
}

export async function loadOrg(): Promise<OrgBusiness | null> {
  const raw = await SecureStore.getItemAsync(ORG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OrgBusiness;
  } catch {
    return null;
  }
}

export async function clearOrg(): Promise<void> {
  await SecureStore.deleteItemAsync(ORG_KEY);
}
