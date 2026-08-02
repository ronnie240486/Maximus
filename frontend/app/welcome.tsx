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
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const player = useAudioPlayer(audioEnabled ? welcomeAudioSource : null);
  const status = useAudioPlayerStatus(player);
  const swooshPlayer = useAudioPlayer(audioEnabled ? swooshSource : null);

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
      setBg(cached?.bg_url);
      setBanner(cached?.banner_url);
      setLogo(cached?.logo_url);

      const fresh = await checkMac(m);
      if (fresh.authorized) {
        setBg(fresh.bg_url);
        setBanner(fresh.banner_url);
        setLogo(fresh.logo_url);
      }
      setReady(true);
    })();
  }, []);

  // Se a imagem (banner/logo) travar carregando — link vencido, rede lenta,
  // etc. — não deixa o desenho de "carregando" preso na tela pra sempre.
  useEffect(() => {
    if (!banner && !logo) return;
    const t = setTimeout(() => {
      if (!imageLoaded) setImageFailed(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [banner, logo, imageLoaded]);

  // Mesma proteção pra imagem de fundo — se travar, simplesmente não mostra
  // (fica só o preto sólido), nunca fica presa carregando.
  useEffect(() => {
    if (!bg) return;
    const t = setTimeout(() => setBgFailed(true), 2500);
    return () => clearTimeout(t);
  }, [bg]);

  useEffect(() => {
    if (!ready) return;
    if (!audioEnabled) {
      const t = setTimeout(goNext, 1800);
      return () => clearTimeout(t);
    }
    player.play();
    swooshPlayer.play();
    const fallback = setTimeout(goNext, FALLBACK_MS);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, audioEnabled]);

  useEffect(() => {
    if (!audioEnabled) return;
    if (status.didJustFinish) {
      goNext();
    }
  }, [status.didJustFinish, audioEnabled]);

  const showBanner = !!banner && !imageFailed;
  const showLogo = !showBanner && !!logo && !imageFailed;
  const showBg = !!bg && !bgFailed;

  return (
    <View style={styles.bg}>
      {showBg && (
        <Image
          source={{ uri: bg }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          onError={() => setBgFailed(true)}
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
