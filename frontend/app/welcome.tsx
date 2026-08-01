import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { colors, spacing } from '@/src/theme';
import { loadSession } from '@/src/state/session';
import { isWelcomeAudioEnabled } from '@/src/state/welcome-audio';

const welcomeAudioSource = require('@/assets/audio/welcome.wav');
const FALLBACK_MS = 6000;

export default function WelcomeScreen() {
  const router = useRouter();
  const [banner, setBanner] = useState(undefined);
  const [logo, setLogo] = useState(undefined);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const player = useAudioPlayer(audioEnabled ? welcomeAudioSource : null);
  const status = useAudioPlayerStatus(player);

  const goNext = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    router.replace('/profiles');
  };

  useEffect(() => {
    (async () => {
      const [session, enabled] = await Promise.all([loadSession(), isWelcomeAudioEnabled()]);
      setBanner(session?.banner_url);
      setLogo(session?.logo_url);
      setAudioEnabled(enabled);
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

  useEffect(() => {
    if (!ready) return;
    if (!audioEnabled) {
      const t = setTimeout(goNext, 1800);
      return () => clearTimeout(t);
    }
    player.play();
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

  return (
    <View style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Pressable style={styles.tapArea} onPress={goNext}>
          <View style={styles.center}>
            {showBanner && (
              <View style={styles.bannerBox}>
                <Image
                  source={{ uri: banner }}
                  style={styles.banner}
                  contentFit="cover"
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
  safe: { flex: 1, backgroundColor: colors.black },
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: spacing.xl, width: '100%' },
  bannerBox: {
    width: '100%',
    aspectRatio: 16 / 6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.darkSurface,
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
