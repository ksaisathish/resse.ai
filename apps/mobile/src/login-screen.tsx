import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { useGoogleAuth } from "@/use-google-auth";
import { styles } from "@/styles";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { signIn, status, error, canSignIn } = useGoogleAuth();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.centerScreen}>
        <Text style={styles.brandTitle}>Resse.ai</Text>
        <Text style={styles.brandTagline}>
          Sign in with the Google account you want managing this business's front desk and
          calendar.
        </Text>

        <Pressable
          style={[styles.btn, styles.btnPrimary, styles.btnBlock, { marginTop: 24 }]}
          disabled={!canSignIn || status === "waiting" || status === "exchanging"}
          onPress={async () => {
            const session = await signIn();
            if (session) navigation.replace("Dashboard");
          }}
        >
          {status === "waiting" || status === "exchanging" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnPrimaryText}>Sign in with Google</Text>
          )}
        </Pressable>

        {!canSignIn && (
          <Text style={styles.errorText}>
            EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set — add it to apps/mobile/.env.
          </Text>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
