import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Updates from "expo-updates";
import * as SplashScreen from "expo-splash-screen";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { LogBox, StatusBar, View, Text, StyleSheet } from "react-native";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { verifyAppIntegrity } from "@/src/lib/integrity";
import { storage } from "@/src/utils/storage";

LogBox.ignoreAllLogs(true);

// Mantém a splash nativa visível (a imagem/cor configurada em app.json,
// desenhada pelo SISTEMA antes de qualquer JS rodar) até sabermos que dá
// pra mostrar alguma coisa de verdade — fontes de ícone carregadas e a
// checagem de integridade concluída. Sem isso, a splash nativa some
// assim que o JS começa a executar, mas o RootLayout ainda retorna
// `null` enquanto essas duas coisas resolvem — nesse intervalo (1-2s) a
// tela fica preta/vazia antes da Home aparecer, dando sensação de
// travamento. Precisa ser chamado ANTES do componente montar.
SplashScreen.preventAutoHideAsync().catch(() => {});

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

  useEffect(() => {
    // expo-image não expõe uma forma de checar o TAMANHO atual do cache de
    // imagens em disco (só limpar tudo) — então em vez de "limpa se passar
    // de X MB", limpa por TEMPO: uma vez a cada 7 dias, o suficiente pra
    // não deixar acumular sem limite numa TV box com pouco espaço,
    // silencioso, sem nenhum aviso ou travamento pro usuário.
    const CLEAR_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    const KEY = 'last_image_cache_clear_at';
    (async () => {
      const last = await storage.getItem<number>(KEY, 0);
      const now = Date.now();
      if (!last || now - last > CLEAR_INTERVAL_MS) {
        try {
          await Image.clearDiskCache();
        } catch {}
        await storage.setItem(KEY, now);
      }
    })();
  }, []);

  useEffect(() => {
    // Checa e aplica atualização OTA (código JS/TS novo, sem precisar de
    // build novo) assim que o app abre. Padrão do expo-updates baixa a
    // atualização mas só aplica na PRÓXIMA abertura — sem isso, a pessoa
    // precisaria fechar e abrir o app DUAS vezes pra ver a mudança. Aqui,
    // já baixa e recarrega sozinho na primeira abertura depois de
    // publicada uma atualização nova.
    // Não roda em desenvolvimento (Updates.isEnabled é false no Expo Go /
    // dev build), só em builds de verdade.
    if (!Updates.isEnabled) return;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Sem internet nesse instante, servidor de update fora do ar,
        // etc. — segue com a versão já instalada normalmente.
      }
    })();
  }, []);

  if (!loaded && !error) return null;
  if (integrityOk === null) return null;

  // Chegou até aqui: ou vamos renderizar a Home de verdade, ou a tela de
  // bloqueio de integridade — dos dois jeitos, já tem algo pra mostrar.
  // Esconde a splash nativa só agora (fire-and-forget: nunca deve
  // travar a renderização se, por algum motivo raro, já tiver sido
  // escondida antes).
  SplashScreen.hideAsync().catch(() => {});

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
