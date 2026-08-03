import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius } from '@/src/theme';
import TVFocusable from './TVFocusable';
import { XtreamCreds, XtreamLive, liveStreamUrl, xtream, decodeEpgText } from '@/src/lib/xtream';

type Props = {
  channel: XtreamLive | null;
  creds: XtreamCreds | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenFull: () => void;
  onSearch: () => void;
};

/**
 * Coluna de preview usada na tela de Canais quando o app roda numa TV box
 * (modelo de 3 colunas: categorias | lista numerada | preview ao vivo).
 *
 * O canal em FOCO (destacado pelo D-pad, sem precisar apertar OK) já toca
 * aqui em miniatura com o nome e a programação atual (EPG). Apertar OK no
 * controle chama `onOpenFull`, que abre o player em tela cheia — o mesmo
 * fluxo que já existia antes pra abrir um canal.
 */
export default function TVChannelPreview({
  channel,
  creds,
  isFavorite,
  onToggleFavorite,
  onOpenFull,
  onSearch,
}: Props) {
  const [nowPlaying, setNowPlaying] = useState<{ title: string; start: string; end: string } | null>(null);
  const [loadingEpg, setLoadingEpg] = useState(false);

  const player = useVideoPlayer('', (p) => {
    p.loop = true;
    // Antes ficava sempre mudo: como o preview trocava de stream a cada
    // movimento do D-pad, deixar o som ligado criava uma sucessão caótica
    // de áudios sobrepostos. Agora a troca de canal (ver onFocusChannel em
    // channels.tsx) só acontece de fato depois que o usuário PARA de se
    // mexer por um instante, então só toca o som de um canal por vez — dá
    // pra deixar audível.
    p.muted = false;
    p.bufferOptions = {
      preferredForwardBufferDuration: 30,
      minBufferForPlayback: 5,
    };
  });

  const tsFallbackTriedRef = React.useRef(false);

  useEffect(() => {
    if (!channel || !creds) return;
    const url = liveStreamUrl(creds, channel.stream_id);
    tsFallbackTriedRef.current = false;
    try {
      player.replace({ uri: url, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1' } });
      player.play();
    } catch {
      // Fonte inválida ou player ainda não pronto — o preview simplesmente
      // fica preto, sem travar o resto da tela.
    }
  }, [channel?.stream_id, creds, player]);

  // Alguns servidores Xtream (comum em contas de teste) não servem o
  // formato HLS (.m3u8) pros canais ao vivo, só o .ts direto — antes de
  // deixar o preview preto, tenta trocar pra .ts uma vez.
  useEffect(() => {
    const sub = player.addListener('statusChange', (s) => {
      if (s.status !== 'error' || !channel || !creds) return;
      if (tsFallbackTriedRef.current) return;
      tsFallbackTriedRef.current = true;
      const tsUrl = liveStreamUrl(creds, channel.stream_id, 'ts');
      player
        .replaceAsync({
          uri: tsUrl,
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1' },
        })
        .then(() => player.play())
        .catch(() => {});
    });
    return () => sub.remove();
  }, [player, channel, creds]);

  useEffect(() => {
    if (!channel || !creds) {
      setNowPlaying(null);
      return;
    }
    let cancelled = false;
    setLoadingEpg(true);
    xtream
      .shortEpg(creds, channel.stream_id, 1)
      .then((res) => {
        if (cancelled) return;
        setLoadingEpg(false);
        const listing = res?.epg_listings?.[0];
        if (!listing) {
          setNowPlaying(null);
          return;
        }
        setNowPlaying({
          title: decodeEpgText(listing.title),
          start: formatEpgTime(listing.start),
          end: formatEpgTime(listing.end),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadingEpg(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel?.stream_id, creds]);

  if (!channel) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <Ionicons name="tv-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Selecione um canal</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.videoBox}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      </View>

      <View style={styles.infoBar}>
        <Text style={styles.channelName} numberOfLines={1}>
          {channel.name}
        </Text>
        {loadingEpg ? (
          <ActivityIndicator color={colors.accentCyan} size="small" style={{ marginTop: 4, alignSelf: 'flex-start' }} />
        ) : nowPlaying ? (
          <Text style={styles.epgText} numberOfLines={1}>
            {nowPlaying.start} ~ {nowPlaying.end}  {nowPlaying.title}
          </Text>
        ) : (
          <Text style={styles.epgText} numberOfLines={1}>
            Sem informação de programação
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        {!!channel.tv_archive && (
          <TVFocusable style={styles.actionBtn} onPress={onOpenFull} testID="tv-preview-catchup">
            <Ionicons name="time-outline" size={16} color={colors.white} />
            <Text style={styles.actionText}>Catch up</Text>
          </TVFocusable>
        )}
        <TVFocusable style={styles.actionBtn} onPress={onToggleFavorite} testID="tv-preview-favorite">
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={16}
            color={isFavorite ? colors.accentMagenta : colors.white}
          />
          <Text style={styles.actionText}>{isFavorite ? 'Favoritado' : 'Add to Favorite'}</Text>
        </TVFocusable>
        <TVFocusable style={styles.actionBtn} onPress={onSearch} testID="tv-preview-search">
          <Ionicons name="search" size={16} color={colors.white} />
          <Text style={styles.actionText}>Buscar</Text>
        </TVFocusable>
      </View>
    </View>
  );
}

function formatEpgTime(raw: string): string {
  // Xtream manda "YYYY-MM-DD HH:mm:ss" — só o HH:mm interessa aqui.
  const m = raw.match(/(\d{2}):(\d{2}):\d{2}$/);
  return m ? `${m[1]}:${m[2]}` : raw;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.darkSurface, borderRadius: radius.md, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, marginTop: spacing.sm },
  videoBox: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.black },
  infoBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  channelName: { color: colors.white, fontSize: 18, fontWeight: '800' },
  epgText: { color: colors.accentCyan, fontSize: 13, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    marginTop: 'auto',
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.darkSurfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
