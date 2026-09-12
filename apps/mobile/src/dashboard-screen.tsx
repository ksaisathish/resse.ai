import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { clearSession, loadSession, type Session } from "@/auth";
import { loadOrg, type OrgBusiness } from "@/org";
import { styles } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

// Every path back to this screen (sign-in, confirming/skipping org creation)
// uses navigation.replace, which remounts Dashboard fresh — so a plain
// mount-time load is enough to always reflect the latest saved org.
export function DashboardScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<OrgBusiness | null>(null);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const { width, height } = useWindowDimensions();
  const isWide = width > height && width >= 700;

  useEffect(() => {
    void loadSession().then(setSession);
    void loadOrg().then((value) => {
      setOrg(value);
      setOrgLoaded(true);
    });
  }, []);

  const profileSection = (
    <>
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
    </>
  );

  const actionSection = (
    <>
      {orgLoaded && !org ? (
        <>
          <Text style={[styles.brandTagline, { marginTop: isWide ? 0 : 24 }]}>
            No organization set up yet. Create one to unlock the front desk — share your
            company's URL and we'll build the receptionist's knowledge base from it.
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
        <>
          <View style={[styles.card, { width: "100%", marginTop: isWide ? 0 : 24 }]}>
            <Text style={styles.cardTitle}>{org.name}</Text>
            <Text style={styles.rowMeta}>{org.hours}</Text>
          </View>

          <Pressable
            style={[styles.btn, styles.btnPrimary, styles.btnBlock, { marginTop: 24 }]}
            onPress={() => navigation.navigate("FrontDesk")}
          >
            <Text style={styles.btnPrimaryText}>Start front desk</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate("CreateOrg")}>
            <Text style={styles.btnLink}>Change organization</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        onPress={async () => {
          await clearSession();
          navigation.replace("Login");
        }}
      >
        <Text style={styles.btnLink}>Sign out</Text>
      </Pressable>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollScreen}>
        {isWide ? (
          <View style={styles.responsiveRow}>
            <View style={styles.responsiveRowCol}>{profileSection}</View>
            <View style={styles.responsiveRowCol}>{actionSection}</View>
          </View>
        ) : (
          <View style={styles.responsiveColumn}>
            {profileSection}
            {actionSection}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
