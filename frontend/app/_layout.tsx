import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { LogBox, StatusBar, View, Text, StyleSheet } from "react-native";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { verifyAppIntegrity } from "@/src/lib/integrity";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Destrava a rotação de forma ativa — o "orientation": "default" no
    // app.json às vezes não é aplicado direito pelo Expo Go logo na
    // abertura (bug conhecido do próprio Expo Go, não é algo do nosso
    // código). Chamar isso programaticamente garante que funcione mesmo
    // quando a config passiva falha.
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);

  useEffect(() => {
    setIntegrityOk(verifyAppIntegrity().ok);
  }, []);

  if (!loaded && !error) return null;
  if (integrityOk === null) return null;

  if (!integrityOk) {
    // Pacote diferente do esperado — sinal de que o APK foi clonado e
    // republicado com outro identificador. Não dá detalhe técnico nenhum
    // (nem qual foi o problema), só recusa a abrir.
    return (
      <View style={styles.blockScreen}>
        <Text style={styles.blockText}>Aplicativo não autorizado.</Text>
      </View>
    );
  }

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

const styles = StyleSheet.create({
  blockScreen: {
    flex: 1,
    backgroundColor: "#0B0F1A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  blockText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
