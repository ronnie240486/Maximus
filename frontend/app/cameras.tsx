cat > app/camera-details.tsx << 'CAMDETAILS_EOF'
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, RefreshControl, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { colors, spacing } from '@/src/theme';
import { fetchWebcamById, type Webcam } from '@/src/lib/webcams';

export default function CameraDetailsScreen() {
  const router = useRouter();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  const [webcam, setWebcam] = useState<Webcam | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const numericId = Number(id);
      const data = await fetchWebcamById(numericId);
      if (!data) {
        setError('Câmera não encontrada.');
      } else {
        setWebcam(data);
      }
    } catch (e) {
      setError('Não foi possível carregar a câmera. Tente novamente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const displayTitle = webcam?.title || title || 'Câmera';
  const embedUrl = webcam?.player?.live?.embed;
  const previewUrl = webcam?.images?.current?.preview;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.accentCyan} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentCyan} />}
        >
          <View style={styles.playerBox}>
            {embedUrl ? (
              <WebView
                source={{ uri: embedUrl }}
                style={styles.webview}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
              />
            ) : previewUrl ? (
              <Image
                source={{ uri: previewUrl }}
                style={styles.webview}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.webview, styles.centerBox]}>
                <Ionicons name="videocam-off-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.errorText}>Sem transmissão disponível.</Text>
              </View>
            )}
          </View>

          {webcam?.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.infoText}>
                {[webcam.location.city, webcam.location.region].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {!embedUrl && previewUrl && (
            <Text style={styles.hintText}>
              Esta câmera não possui player ao vivo — exibindo a última imagem disponível.
            </Text>
          )}
        </ScrollView>
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
    paddingVertical: spacing.sm,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  playerBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
CAMDETAILS_EOF
grep -n "^export default" app/camera-details.tsx
