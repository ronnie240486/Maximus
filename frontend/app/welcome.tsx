import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { colors, spacing } from '@/src/theme';
import { getDeviceMac } from '@/src/lib/device';
import { checkMac } from '@/src/api/client';
import { loadSession } from '@/src/state/session';
import { isWelcomeAudioEnabled } from '@/src/state/welcome-audio';
import { prefetchHomeContent } from '@/src/state/prefetch';
import { logSessionEvent } from '@/src/state/debug-log';

const welcomeAudioSource = require('@/assets/audio/welcome.wav');
const swooshSource = require('@/assets/audio/swoosh.mp3');
const FALLBACK_MS = 6000;

export default function WelcomeScreen() {
  const router = useRouter();
  const [bg, setBg] = useState(undefined);
  const [banner, setBanner] = useState(undefined);
  const [logo, setLogo] = useState(undefined);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const player = useAudioPlayer(audioEnabled ? welcomeAudioSource : null);
  const status = useAudioPlayerStatus(player);
  const swooshPlayer = useAudioPlayer(audioEnabled ? swooshSource : null);
  const swooshStatus = useAudioPlayerStatus(swooshPlayer);
  const [voiceDone, setVoiceDone] = useState(false);
  const [swooshDone, setSwooshDone] = useState(false);

  const goNext = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    router.replace('/profiles');
  };

  useEffect(() => {
    // Começa a buscar canais/filmes/séries agora, em segundo plano — assim,
    // quando a pessoa chegar na Home (depois de escolher o perfil), os
    // dados já estão prontos em vez de começar a busca do zero ali.
    prefetchHomeContent();
  }, []);

  useEffect(() => {
    (async () => {
      const [enabled, m] = await Promise.all([isWelcomeAudioEnabled(), getDeviceMac()]);
      setAudioEnabled(enabled);

      // As imagens (fundo/banner/logo) são URLs assinadas que expiram em
      // ~1h — busca fresco aqui em vez de confiar só na sessão salva,
      // igual a tela de Perfis já faz, pra sempre bater a mesma imagem.
      const cached = await loadSession();
      logSessionEvent('welcome.mount', `sessão lida: status=${cached?.status ?? 'undefined'}`);
      setBg(cached?.bg_url);
      setBanner(cached?.banner_url);
      setLogo(cached?.logo_url);

      const fresh = await checkMac(m);
      let finalBg = cached?.bg_url;
      let finalBanner = cached?.banner_url;
      let finalLogo = cached?.logo_url;
      if (fresh.authorized) {
        finalBg = fresh.bg_url;
        finalBanner = fresh.banner_url;
        finalLogo = fresh.logo_url;
        setBg(finalBg);
        setBanner(finalBanner);
        setLogo(finalLogo);
      }

      // Pré-carrega as imagens ANTES de liberar o áudio — sem isso, o
      // áudio (voz "Bem-vindo..." + efeito) começava assim que a URL da
      // imagem ficava conhecida, mas a imagem em si (bytes baixados da
      // rede) só aparecia um pouco depois, dando a impressão de áudio e
      // imagem fora de sincronia. Tem um teto de 2s pra isso não atrasar
      // a entrada se a imagem estiver lenta/fora do ar.
      const toPrefetch = [finalBanner, finalLogo, finalBg].filter(
        (u): u is string => !!u
      );
      if (toPrefetch.length) {
        await Promise.race([
          Image.prefetch(toPrefetch).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }

      setReady(true);
    })();
  }, []);

  // A imagem só some se der erro de verdade (onError), nunca por timeout —
  // a tela toda dura só alguns segundos (o tempo do áudio de boas-vindas),
  // então um timeout "desiste cedo" só corria o risco de esconder a
  // imagem NO MEIO do áudio mesmo com ela carregando normal, só um pouco
  // mais devagar. Se a imagem realmente não carregar, a tela já vai sumir
  // sozinha (goNext) assim que o áudio/fallback terminar de qualquer jeito.

  useEffect(() => {
    if (!ready) return;
    if (!audioEnabled) {
      const t = setTimeout(goNext, 1800);
      return () => clearTimeout(t);
    }
    // O efeito sonoro (uns 3s) começa primeiro; a voz "Bem-vindo ao
    // Maximus Player" (uns 1s) entra um pouco depois, com um respiro —
    // assim o efeito não fica em cima da voz nem cortado por ela.
    swooshPlayer.play();
    const voiceDelay = setTimeout(() => player.play(), 350);
    const fallback = setTimeout(goNext, FALLBACK_MS);
    return () => {
      clearTimeout(voiceDelay);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, audioEnabled]);

  useEffect(() => {
    if (status.didJustFinish) setVoiceDone(true);
  }, [status.didJustFinish]);

  useEffect(() => {
    if (swooshStatus.didJustFinish) setSwooshDone(true);
  }, [swooshStatus.didJustFinish]);

  useEffect(() => {
    if (!audioEnabled) return;
    // Só sai da tela quando os DOIS realmente terminarem — o efeito dura
    // mais que a voz, então esperar só a voz cortava o efeito no meio.
    if (voiceDone && swooshDone) {
      goNext();
    }
  }, [voiceDone, swooshDone, audioEnabled]);

  const showBanner = !!banner && !imageFailed;
  const showLogo = !showBanner && !!logo && !imageFailed;
  // Sem banner NEM logo do painel (ex: conta de teste, sem MAC cadastrado
  // ainda) — mostra o logo padrão do próprio app em vez de ficar só com o
  // texto "Bem-vindo". Assim que o MAC for cadastrado com uma imagem
  // própria no painel, volta a usar ela normalmente.
  const showFallbackLogo = !showBanner && !showLogo;
  const showBg = !!bg && !bgFailed;

  return (
    <View style={styles.bg}>
      {showBg ? (
        <Image
          source={{ uri: bg }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          onLoad={() => setBgLoaded(true)}
          onError={() => setBgFailed(true)}
        />
      ) : (
        // Mesmo motivo do fallback do logo acima — sem bg_url do painel,
        // usa a imagem de fundo padrão local em vez de deixar em branco.
        <Image
          source={require('@/assets/images/default-bg.png')}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      )}
      <View style={[StyleSheet.absoluteFillObject, styles.bgOverlay]} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Pressable style={styles.tapArea} onPress={goNext}>
          <View style={styles.center}>
            {showBanner && (
              <View style={styles.bannerBox}>
                <Image
                  source={{ uri: banner }}
                  style={styles.banner}
                  contentFit="contain"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageFailed(true)}
                  testID="welcome-banner"
                />
              </View>
            )}
            {showLogo && (
              <Image
                source={{ uri: logo }}
                style={styles.logoImg}
                contentFit="contain"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageFailed(true)}
                testID="welcome-logo"
              />
            )}
            {showFallbackLogo && (
              <Image
                source={require('@/assets/images/app-image.png')}
                style={styles.logoImg}
                contentFit="contain"
                testID="welcome-fallback-logo"
              />
            )}
            <Text style={styles.welcomeText}>Bem-vindo ao Maximus Player</Text>
          </View>
          <Text style={styles.skipHint}>Toque para pular</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.black },
  bgOverlay: { backgroundColor: 'rgba(11,15,26,0.55)' },
  safe: { flex: 1 },
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: spacing.xl, width: '100%' },
  bannerBox: {
    width: '55%',
    maxWidth: 260,
    aspectRatio: 1,
    borderRadius: 16,
    alignSelf: 'center',
  },
  banner: { width: '100%', height: '100%' },
  logoImg: { width: 160, height: 120 },
  welcomeText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  skipHint: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
  },
});
