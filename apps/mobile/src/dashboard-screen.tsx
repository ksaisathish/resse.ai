import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { clearSession, loadSession, type Session } from "@/auth";
import { loadOrg, type OrgBusiness } from "@/org";
import { styles } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

export function DashboardScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<OrgBusiness | null>(null);
  const [orgLoaded, setOrgLoaded] = useState(false);

  useEffect(() => {
    void loadSession().then(setSession);
    void loadOrg().then((value) => {
      setOrg(value);
      setOrgLoaded(true);
    });
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.centerScreen}>
        <Text style={styles.eyebrow}>Resse.ai</Text>
        <Text style={styles.brandTitle}>Dashboard</Text>

        {session ? (
          <View style={styles.profileCard}>
            {session.profile.picture ? (
              <Image source={{ uri: session.profile.picture }} style={styles.avatar} />
            ) : null}
            <Text style={styles.profileName}>{session.profile.name}</Text>
            <Text style={styles.profileEmail}>{session.profile.email}</Text>
          </View>
        ) : null}

        {orgLoaded && !org ? (
          <>
            <Text style={[styles.brandTagline, { marginTop: 24 }]}>
              No organization set up yet — share your company's URL and we'll build the
              receptionist's knowledge base from it.
            </Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary, styles.btnBlock, { marginTop: 12 }]}
              onPress={() => navigation.navigate("CreateOrg")}
            >
              <Text style={styles.btnPrimaryText}>Create organization</Text>
            </Pressable>
          </>
        ) : null}

        {org ? (
          <View style={[styles.card, { width: "100%", marginTop: 24 }]}>
            <Text style={styles.cardTitle}>{org.name}</Text>
            <Text style={styles.rowMeta}>{org.hours}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.btn, styles.btnPrimary, styles.btnBlock, { marginTop: 24 }]}
          onPress={() => navigation.navigate("FrontDesk")}
        >
          <Text style={styles.btnPrimaryText}>Start front desk</Text>
        </Pressable>

        {org ? (
          <Pressable onPress={() => navigation.navigate("CreateOrg")}>
            <Text style={styles.btnLink}>Change organization</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={async () => {
            await clearSession();
            navigation.replace("Login");
          }}
        >
          <Text style={styles.btnLink}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
