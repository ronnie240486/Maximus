import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { colors, spacing } from '@/src/theme';
import { loadSession } from '@/src/state/session';
import { isWelcomeAudioEnabled } from '@/src/state/welcome-audio';

const welcomeAudioSource = require('@/assets/audio/welcome.wav');
// Trava de segurança: se o áudio falhar em carregar/tocar (arquivo
// corrompido, dispositivo sem áudio, etc.), não trava a pessoa aqui pra
// sempre — segue pro app depois desse tempo mesmo assim.
const FALLBACK_MS = 6000;

export default function WelcomeScreen() {
  const router = useRouter();
  const [bg, setBg] = useState<string | undefined>(undefined);
  const [banner, setBanner] = useState<string | undefined>(undefined);
  const [logo, setLogo] = useState<string | undefined>(undefined);
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
      setBg(session?.bg_url);
      setBanner(session?.banner_url);
      setLogo(session?.logo_url);
      setAudioEnabled(enabled);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!audioEnabled) {
      // Áudio desativado nas configurações — não trava aqui, mas ainda
      // deixa a marca (banner/logo) visível por um instante antes de seguir.
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

  return (
    <ImageBackground
      source={bg ? { uri: bg } : undefined}
      style={styles.bg}
      imageStyle={{ opacity: 0.25 }}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Pressable style={styles.tapArea} onPress={goNext}>
          <View style={styles.center}>
            {banner ? (
              <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" testID="welcome-banner" />
            ) : logo ? (
              <Image source={{ uri: logo }} style={styles.logoImg} contentFit="contain" testID="welcome-logo" />
            ) : null}
            <Text style={styles.welcomeText}>Bem-vindo ao Maximus Player</Text>
          </View>
          <Text style={styles.skipHint}>Toque para pular</Text>
        </Pressable>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.black },
  safe: { flex: 1 },
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: spacing.xl },
  banner: {
    width: '100%',
    aspectRatio: 16 / 6,
    borderRadius: 16,
  },
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
