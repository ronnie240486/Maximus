import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Dimensions, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import YoutubeIframe, { PLAYER_ERRORS } from 'react-native-youtube-iframe';

import { colors, spacing } from '@/src/theme';

// Mesma extração usada em trailer.tsx — pega o ID de 11 caracteres do
// YouTube a partir de qualquer formato de URL (watch?v=, youtu.be/,
// m.youtube.com etc).
function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes('youtube.com') && !url.hostname.includes('youtu.be')) return null;
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    return null;
  } catch {
    return null;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  [PLAYER_ERRORS.VIDEO_NOT_FOUND]: 'Vídeo não encontrado.',
  [PLAYER_ERRORS.EMBED_NOT_ALLOWED]: 'O dono do vídeo não permite assistir dentro de outros apps.',
  [PLAYER_ERRORS.HTML5_ERROR]: 'Erro ao reproduzir o vídeo.',
  [PLAYER_ERRORS.INVALID_PARAMETER]: 'Vídeo inválido.',
};

export default function WorldCameraViewScreen() {
  const router = useRouter();
  const { title, url } = useLocalSearchParams<{ title?: string; url: string }>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Enquanto a pessoa está navegando pelos resultados de busca, é
  // WebView normal (não tem como saber de antemão qual vídeo ela vai
  // escolher). Assim que ela toca num resultado e a página abre um
  // vídeo específico do YouTube, troca pro MESMO player dedicado que os
  // trailers usam (react-native-youtube-iframe) — mais confiável que
  // deixar a página cheia do YouTube tocando dentro do WebView genérico
  // (que às vezes trava no carregamento ou só toca o áudio).
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);

  const onNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    const videoId = extractYouTubeId(navState.url);
    if (videoId) {
      setActiveVideoId(videoId);
      setPlayerLoading(true);
      setPlayerError(null);
    }
  }, []);

  const backToResults = () => {
    setActiveVideoId(null);
    setPlayerError(null);
  };

  const playerHeight = Math.round(Dimensions.get('window').width * (9 / 16));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (activeVideoId ? backToResults() : router.back())}
          hitSlop={16}
          style={styles.backBtn}
          testID="world-camera-view-back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title || 'Câmeras'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {activeVideoId ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.playerWrap, { height: playerHeight }]}>
            {playerLoading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator color={colors.accentCyan} size="large" />
              </View>
            )}
            <YoutubeIframe
              height={playerHeight}
              videoId={activeVideoId}
              play
              forceAndroidAutoplay
              onReady={() => setPlayerLoading(false)}
              onError={(e: string) => {
                setPlayerLoading(false);
                setPlayerError(ERROR_MESSAGES[e] || 'Não foi possível reproduzir essa câmera.');
              }}
              webViewProps={{ allowsFullscreenVideo: true }}
            />
          </View>

          {!!playerError && (
            <View style={styles.centerBox}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
              <Text style={styles.errorText}>{playerError}</Text>
              <Pressable
                onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${activeVideoId}`)}
                style={styles.retryBtn}
              >
                <Text style={styles.retryBtnText}>Abrir no app do YouTube</Text>
              </Pressable>
              <Pressable onPress={backToResults} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Voltar pra busca</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : failed ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.errorText}>Não foi possível carregar essa página agora.</Text>
          <Pressable
            onPress={() => {
              setFailed(false);
              setLoading(true);
            }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: url }}
            style={styles.webview}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={onNavigationStateChange}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
          />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={colors.accentCyan} size="large" />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: colors.white, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  webview: { flex: 1, backgroundColor: colors.black },
  playerWrap: { width: '100%', backgroundColor: colors.black, justifyContent: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
    zIndex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accentCyan,
  },
  retryBtnText: {
    color: '#001018',
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.darkSurface,
  },
  secondaryBtnText: {
    color: colors.white,
    fontWeight: '700',
  },
});
