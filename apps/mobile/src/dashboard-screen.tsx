import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { clearSession, loadSession, type Session } from "@/auth";
import { styles } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

export function DashboardScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void loadSession().then(setSession);
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

        <Pressable
          style={[styles.btn, styles.btnPrimary, styles.btnBlock, { marginTop: 24 }]}
          onPress={() => navigation.navigate("FrontDesk")}
        >
          <Text style={styles.btnPrimaryText}>Start front desk</Text>
        </Pressable>

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
