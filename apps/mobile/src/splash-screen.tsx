import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { loadSession } from "@/auth";
import { styles, C } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export function SplashScreen({ navigation }: Props) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await loadSession();
      const expired = session ? session.expiresAt <= Date.now() : true;
      if (cancelled) return;
      navigation.replace(session && !expired ? "Dashboard" : "Login");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.centerScreen}>
        <Text style={styles.brandTitle}>Resse.ai</Text>
        <Text style={styles.brandTagline}>Your front desk, always on.</Text>
        <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
      </View>
    </SafeAreaView>
  );
}
