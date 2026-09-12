/**
 * In your pocket.
 *
 * Imports come from `@copilotkit/react-native/headless` on purpose: the ROOT
 * barrel imports `expo-document-picker` and `expo-file-system` unconditionally,
 * so pulling it in drags two native modules you may not want. The headless
 * subpath imports none of the optional native peers — verified against 1.70.1.
 */
import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ChatScreen } from "@/chat";
import { SplashScreen } from "@/splash-screen";
import { LoginScreen } from "@/login-screen";
import { DashboardScreen } from "@/dashboard-screen";
import { CreateOrgScreen } from "@/create-org-screen";
import { RUNTIME_URL } from "@/config";
import type { RootStackParamList } from "@/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {/* Points at the same runtime the web surface uses. On a device,
          localhost is the DEVICE — see src/config.ts. */}
      <CopilotKitProvider runtimeUrl={RUNTIME_URL}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="CreateOrg" component={CreateOrgScreen} options={{ headerShown: true, title: "Create organization" }} />
            <Stack.Screen name="FrontDesk" component={ChatScreen} options={{ headerShown: true, title: "Front desk" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </CopilotKitProvider>
    </SafeAreaProvider>
  );
}
