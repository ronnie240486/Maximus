import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    // Destrava a rotação de forma ativa — o "orientation": "default" no
    // app.json às vezes não é aplicado direito pelo Expo Go logo na
    // abertura (bug conhecido do próprio Expo Go, não é algo do nosso
    // código). Chamar isso programaticamente garante que funcione mesmo
    // quando a config passiva falha.
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F1A" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0B0F1A" },
          animation: "fade",
        }}
      />
    </>
  );
}
