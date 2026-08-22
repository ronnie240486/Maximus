import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePlayerSession } from '@/src/state/player-session';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius } from '@/src/theme';
import TVFocusable from './TVFocusable';
import EpgStrip from './EpgStrip';
import { XtreamCreds, XtreamLive, liveStreamUrl } from '@/src/lib/xtream';

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

  const { player, setSource, mode, reportMiniRect } = usePlayerSession();
  const modeRef = React.useRef(mode);
  const videoBoxRef = React.useRef<View>(null);
  modeRef.current = mode;

  const measureMiniSurface = React.useCallback(() => {
    videoBoxRef.current?.measureInWindow((left, top, width, height) => {
      if (width > 0 && height > 0) reportMiniRect({ left, top, width, height });
    });
  }, [reportMiniRect]);

  React.useEffect(() => {
    const frame = requestAnimationFrame(measureMiniSurface);
    return () => cancelAnimationFrame(frame);
  }, [measureMiniSurface, channel?.stream_id]);

  // A sessão global continua viva durante a navegação, mas o preview não
  // mantém uma segunda superfície montada quando o player grande aparece.
  // Isso evita que duas VideoViews disputem o mesmo ExoPlayer e causem
  // rebuffer, pipocos ou perda da posição atual.

  const tsFallbackTriedRef = React.useRef(false);

  useEffect(() => {
    if (!channel || !creds) {
      if (modeRef.current !== 'full') setSource(null, false, 'live').catch(() => {});
      return;
    }
    const url = liveStreamUrl(creds, channel.stream_id);
    tsFallbackTriedRef.current = false;
    setSource(url, true, 'live').catch(() => {
      // Fonte inválida ou player ainda não pronto — o preview simplesmente
      // fica preto, sem travar o resto da tela.
    });
  }, [channel?.stream_id, creds, setSource]);

  // Alguns servidores Xtream (comum em contas de teste) não servem o
  // formato HLS (.m3u8) pros canais ao vivo, só o .ts direto — antes de
  // deixar o preview preto, tenta trocar pra .ts uma vez.
  useEffect(() => {
    const sub = player.addListener('statusChange', (s) => {
      if (s.status !== 'error' || !channel || !creds) return;
      if (tsFallbackTriedRef.current) return;
      tsFallbackTriedRef.current = true;
      const tsUrl = liveStreamUrl(creds, channel.stream_id, 'ts');
      setSource(tsUrl, true, 'live').catch(() => {});
    });
    return () => sub.remove();
  }, [player, channel, creds]);

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
      <View
        ref={videoBoxRef}
        onLayout={measureMiniSurface}
        style={styles.videoBox}
      />

      <View style={styles.infoBar}>
        <Text style={styles.channelName} numberOfLines={1}>
          {channel.name}
        </Text>
      </View>

      <View style={styles.epgStripWrap}>
        <EpgStrip creds={creds} channelId={channel.stream_id} channelName={channel.name} channelCover={channel.stream_icon} />
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 'transparent', borderRadius: radius.md, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, marginTop: spacing.sm },
  videoBox: { width: '100%', aspectRatio: 16 / 9, backgroundColor: 'transparent' },
  infoBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  channelName: { color: colors.white, fontSize: 18, fontWeight: '800' },
  epgStripWrap: { paddingVertical: spacing.xs },
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
