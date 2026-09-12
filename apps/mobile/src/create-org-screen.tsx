/**
 * Org onboarding: the business owner pastes their company URL, we scrape it
 * via Exa and extract structured business info with an LLM call
 * (apps/web/src/app/api/org/scrape/route.ts), the owner confirms it, and it
 * becomes the knowledge base the receptionist uses instead of the bundled
 * demo dental-office data. See RESSE_IDEATION_CONTEXT.md's onboarding flow.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { BACKEND_ORIGIN } from "@/config";
import { saveOrg, type OrgBusiness } from "@/org";
import { styles } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "CreateOrg">;

type Status = "idle" | "scraping" | "confirming" | "saving";

export function CreateOrgScreen({ navigation }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [scraped, setScraped] = useState<OrgBusiness | null>(null);

  async function scrape() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(undefined);
    setStatus("scraping");
    try {
      const response = await fetch(`${BACKEND_ORIGIN}/api/org/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await response.json()) as { business?: OrgBusiness; error?: string };
      if (!response.ok || !data.business) {
        setError(data.error ?? "Could not scrape that URL.");
        setStatus("idle");
        return;
      }
      setScraped(data.business);
      setStatus("confirming");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("idle");
    }
  }

  async function confirm() {
    if (!scraped) return;
    setStatus("saving");
    await saveOrg(scraped);
    navigation.replace("Dashboard");
  }

  function tryAnotherUrl() {
    setScraped(null);
    setStatus("idle");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={styles.eyebrow}>Resse.ai</Text>
        <Text style={styles.brandTitle}>Create your organization</Text>
        <Text style={styles.brandTagline}>
          Share your company's website. We'll scrape it and build the receptionist's starting
          knowledge base — hours, services, phone, what you do.
        </Text>

        {status !== "confirming" ? (
          <>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://yourbusiness.com"
              placeholderTextColor="#6e6779"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={status === "idle"}
              onSubmitEditing={() => void scrape()}
            />

            <Pressable
              style={[styles.btn, styles.btnPrimary, styles.btnBlock]}
              disabled={!url.trim() || status === "scraping"}
              onPress={() => void scrape()}
            >
              {status === "scraping" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Scrape & build knowledge base</Text>
              )}
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable onPress={() => navigation.replace("Dashboard")}>
              <Text style={styles.btnLink}>Skip for now — use demo data</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{scraped?.name}</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Hours</Text>
                <Text style={styles.rowValue}>{scraped?.hours}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Phone</Text>
                <Text style={styles.rowValue}>{scraped?.phone || "—"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Services</Text>
                <Text style={styles.rowValue}>{scraped?.services.join(", ") || "—"}</Text>
              </View>
              {scraped?.description ? (
                <Text style={[styles.rowMeta, { marginTop: 8 }]}>{scraped.description}</Text>
              ) : null}
            </View>

            <Text style={styles.brandTagline}>
              Does this look right? You can edit these details later — for now, confirm to start
              using them.
            </Text>

            <Pressable
              style={[styles.btn, styles.btnPrimary, styles.btnBlock]}
              disabled={status === "saving"}
              onPress={() => void confirm()}
            >
              {status === "saving" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Looks good, continue</Text>
              )}
            </Pressable>

            <Pressable onPress={tryAnotherUrl} disabled={status === "saving"}>
              <Text style={styles.btnLink}>Try a different URL</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
