import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  ScrollView,
  Linking,
  Alert,
  findNodeHandle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';

import { colors, spacing } from '@/src/theme';
import { recordWatch } from '@/src/state/watch-history';
import { getXtream } from '@/src/state/session';
import { getDeviceMac } from '@/src/lib/device';
import { sendHeartbeat } from '@/src/api/client';
import { xtream, liveStreamUrl, XtreamLive, XtreamCategory, XtreamEpgListing, decodeEpgText } from '@/src/lib/xtream';
import TVFocusable from '@/src/components/TVFocusable';
import EpgStrip from '@/src/components/EpgStrip';
import { useIsTV } from '@/src/hooks/useIsTV';

const HIDE_AFTER_MS = 3500;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Xtream EPG timestamps look like "2026-07-30 14:00:00" — just want "14:00".
 * Some panels instead send a raw unix-epoch-seconds string for start/end
 * (that's the bug that showed a huge number like "1785422100" on screen). */
function formatEpgTime(raw: string): string {
  if (/^\d{9,11}$/.test(raw)) {
    const d = new Date(Number(raw) * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const match = raw.match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  return match ? `${match[1]}:${match[2]}` : raw;
}

export default function PlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    stream: string;
    logo?: string;
    seriesId?: string;
    adult?: string;
  }>();

  const [buffering, setBuffering] = useState(true);
  const isTV = useIsTV();
  // Ref do botão "voltar" no topo — usado como destino de nextFocusUp dos
  // controles centrais (play/pause, avançar/voltar 10s). Sem isso, o D-pad
  // não tinha como saber que apertar CIMA a partir do centro deveria
  // pular pra fileira de botões do topo (voltar, grade de canais, modo de
  // tela, etc) — o algoritmo espacial padrão do Android TV não prioriza
  // isso sozinho, mesmo com esses botões já sendo focáveis.
  const topBarRef = useRef<React.ElementRef<typeof TVFocusable>>(null);
  const [topBarHandle, setTopBarHandle] = useState<number | undefined>();
  useEffect(() => {
    if (!isTV) return;
    const t = setTimeout(() => {
      const handle = findNodeHandle(topBarRef.current);
      if (handle) setTopBarHandle(handle);
    }, 300);
    return () => clearTimeout(t);
  }, [isTV]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda a URL (.m3u8) pra qual já tentamos o fallback .ts, pra não
  // tentar de novo em loop se o .ts também falhar — ver o listener de
  // erro do player mais abaixo.
  const tsFallbackTriedFor = useRef<string | null>(null);

  const isLive = String(params.id || '').startsWith('live-');

  // Holds whichever channel is actually playing right now — starts as the
  // one we navigated in with, but switching from the in-player grid updates
  // this directly instead of re-navigating, so back always returns to
  // wherever the person came from (not through a stack of channel switches).
  const [current, setCurrent] = useState({
    id: params.id,
    name: params.name || 'Reprodução',
    logo: params.logo,
    stream: params.stream,
  });

  const [epg, setEpg] = useState<XtreamEpgListing[]>([]);

  useEffect(() => {
    if (!isLive) return;
    const creds = getXtream();
    const streamId = Number(String(current.id).replace('live-', ''));
    if (!creds || !streamId) return;
    xtream.shortEpg(creds, streamId, 2).then((res) => {
      setEpg(res?.epg_listings || []);
    });
  }, [isLive, current.id]);

  const nowProgram = epg[0];
  const nextProgram = epg[1];

  const [showChannelGrid, setShowChannelGrid] = useState(false);
  const [channelList, setChannelList] = useState<XtreamLive[]>([]);
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('Todos');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');

  const openChannelGrid = useCallback(async () => {
    setShowChannelGrid(true);
    if (channelList.length > 0) return;
    const creds = getXtream();
    if (!creds) return;
    setLoadingChannels(true);
    const [list, cats] = await Promise.all([xtream.liveStreams(creds), xtream.liveCategories(creds)]);
    setChannelList(list || []);
    setCategories(cats || []);
    setLoadingChannels(false);
  }, [channelList.length]);

  const switchChannel = useCallback((s: XtreamLive) => {
    const creds = getXtream();
    if (!creds) return;
    const newStream = liveStreamUrl(creds, s.stream_id, 'm3u8');
    setCurrent({ id: `live-${s.stream_id}`, name: s.name, logo: s.stream_icon, stream: newStream });
    setShowChannelGrid(false);
    setBuffering(true);
  }, []);

  const cycleResizeMode = useCallback(() => {
    setResizeMode((prev) => (prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain'));
  }, []);

  const resizeModeIcon = resizeMode === 'contain' ? 'fit-screen' : resizeMode === 'cover' ? 'crop-free' : 'aspect-ratio';

  const toggleFullscreen = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
      }
    } catch {}
  }, [isLandscape]);

  // Always leave the app back in portrait when leaving the player, even if
  // the person navigates away (back button, etc.) instead of tapping the
  // rotate button again.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const isAdult = params.adult === '1';

  // Alguns servidores de IPTV bloqueiam/travam o stream se o pedido não
  // vier com um User-Agent reconhecido (proteção comum contra uso fora de
  // apps de player) — as chamadas de API já mandavam isso, mas o pedido
  // do vídeo em si (feito pelo player nativo) não mandava nada.
  const player = useVideoPlayer(
    current.stream ? { uri: current.stream, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1' } } : '',
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  useEffect(() => {
    if (isLive) return;
    // Adult content NEVER goes into continue-watching, regardless of
    // whether the parental lock happens to be on or off right now.
    if (isAdult) return;
    if (!params.id || !params.stream) return;
    recordWatch({
      id: params.id,
      name: params.name || 'Sem título',
      logo: params.logo,
      stream: params.stream,
      seriesId: params.seriesId ? Number(params.seriesId) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), HIDE_AFTER_MS);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', (s) => {
      setBuffering(s.status === 'loading');
      if (s.status === 'error') {
        // Alguns servidores Xtream (comum em contas de teste) não servem
        // o formato HLS (.m3u8) pros canais ao vivo, só o .ts direto —
        // antes de mostrar erro pro usuário, tenta trocar pra .ts uma
        // vez. Se isso também falhar (ou já não for um canal .m3u8),
        // mostra o erro normalmente.
        const canFallback =
          isLive &&
          !!current.stream &&
          current.stream.includes('.m3u8') &&
          tsFallbackTriedFor.current !== current.stream;
        if (canFallback) {
          tsFallbackTriedFor.current = current.stream;
          const tsUrl = current.stream.replace(/\.m3u8(\?|$)/, '.ts$1');
          player
            .replaceAsync({
              uri: tsUrl,
              headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1' },
            })
            .then(() => player.play())
            .catch(() => setError('Não foi possível reproduzir esta transmissão.'));
          return;
        }
        setError('Não foi possível reproduzir esta transmissão.');
      } else {
        setError(null);
      }
    });
    const playingSub = player.addListener('playingChange', (e) => {
      setPlaying(e.isPlaying);
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player, isLive, current.stream]);

  // Poll current time / duration for VOD content.
  useEffect(() => {
    if (isLive) return;
    const t = setInterval(() => {
      try {
        setCurrentTime(player.currentTime || 0);
        setDuration(player.duration || 0);
      } catch {}
    }, 500);
    return () => clearInterval(t);
  }, [player, isLive]);

  const togglePlay = () => {
    if (playing) player.pause();
    else player.play();
    revealControls();
  };

  const seekBy = (delta: number) => {
    try {
      const target = Math.max(0, Math.min((player.duration || 0), (player.currentTime || 0) + delta));
      player.currentTime = target;
    } catch {}
    revealControls();
  };

  const seekToPercent = (pct: number) => {
    if (!duration) return;
    try {
      player.currentTime = Math.max(0, Math.min(duration, duration * pct));
    } catch {}
    revealControls();
  };

  const channelName = current.name || 'Reprodução';
  const logo = current.logo;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Abre o mesmo stream num player externo (VLC ou MX Player), pra quem
  // prefere usar um desses em vez do player de dentro do app — útil
  // também como alternativa se algum vídeo específico não tocar bem aqui.
  const openInExternalPlayer = () => {
    const url = current.stream;
    if (!url) return;
    Alert.alert('Abrir com', 'Escolha o player pra continuar assistindo', [
      {
        text: 'VLC',
        onPress: () => {
          Linking.openURL(`vlc://${url}`).catch(() =>
            Alert.alert('VLC não encontrado', 'Instale o app VLC pra usar essa opção.')
          );
        },
      },
      {
        text: 'MX Player',
        onPress: () => {
          const intent = `intent:${url}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(channelName)};end`;
          Linking.openURL(intent).catch(() =>
            Alert.alert('MX Player não encontrado', 'Instale o app MX Player pra usar essa opção.')
          );
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  // Avisa o painel periodicamente o que está sendo assistido nesse MAC —
  // é isso que faz "Dispositivos Conectados" mostrar o nome do conteúdo,
  // não só "online". Só manda enquanto está tocando de verdade (não
  // pausado), e para completamente quando sai dessa tela.
  useEffect(() => {
    if (!playing || !channelName) return;
    let cancelled = false;
    const tick = async () => {
      const mac = await getDeviceMac();
      if (cancelled) return;
      sendHeartbeat(mac, channelName);
    };
    tick();
    const interval = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playing, channelName]);

  return (
    <View style={styles.root} testID="player-root">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={resizeMode}
        nativeControls={false}
      />

      {/* Tap layer to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (showControls ? setShowControls(false) : revealControls())}
        testID="player-tap-surface"
      />

      {buffering && !error && (
        <View style={[styles.centerOverlay, { pointerEvents: 'none' }]}>
          <ActivityIndicator color={colors.accentCyan} size="large" />
        </View>
      )}

      {!!error && (
        <View style={styles.errorOverlay}>
          <MaterialCommunityIcons name="alert-circle" size={40} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TVFocusable onPress={() => router.back()} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>VOLTAR</Text>
          </TVFocusable>
        </View>
      )}

      {showControls && !error && (
        <>
          <LinearGradient
            colors={['rgba(11,15,26,0.85)', 'transparent']}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(11,15,26,0.9)', colors.black]}
            style={styles.bottomScrim}
            pointerEvents="none"
          />

          <SafeAreaView style={styles.safe} edges={['top', 'bottom']} pointerEvents="box-none">
            <View style={styles.topBar} pointerEvents="box-none">
              <TVFocusable ref={topBarRef} onPress={() => router.back()} hitSlop={12} style={styles.topBtn} testID="player-back">
                <Ionicons name="chevron-back" size={22} color={colors.white} />
              </TVFocusable>
              <Text style={styles.topTitle} numberOfLines={1}>{channelName}</Text>
              <View style={styles.topActions}>
                {isLive && (
                  <TVFocusable onPress={openChannelGrid} style={styles.topBtn} testID="player-channel-grid">
                    <Ionicons name="grid" size={18} color={colors.white} />
                  </TVFocusable>
                )}
                <TVFocusable onPress={cycleResizeMode} style={styles.topBtn} testID="player-resize-mode">
                  <MaterialIcons name={resizeModeIcon as any} size={18} color={colors.white} />
                </TVFocusable>
                <TVFocusable onPress={toggleFullscreen} style={styles.topBtn} testID="player-fullscreen">
                  <MaterialCommunityIcons
                    name={isLandscape ? 'fullscreen-exit' : 'fullscreen'}
                    size={18}
                    color={colors.white}
                  />
                </TVFocusable>
                <TVFocusable onPress={openInExternalPlayer} style={styles.topBtn} testID="player-external">
                  <MaterialCommunityIcons name="open-in-new" size={18} color={colors.white} />
                </TVFocusable>
              </View>
            </View>

            <View style={styles.centerControls} pointerEvents="box-none">
              <TVFocusable
                onPress={() => seekBy(-10)}
                style={[styles.sideBtn, isLive && { opacity: 0.4 }]}
                disabled={isLive}
                testID="player-seek-back"
                nextFocusUp={topBarHandle}
              >
                <MaterialCommunityIcons name="rewind-10" size={32} color={colors.white} />
              </TVFocusable>
              <TVFocusable
                onPress={togglePlay}
                style={styles.playBtn}
                testID="player-play-pause"
                nextFocusUp={topBarHandle}
              >
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={40}
                  color={colors.white}
                />
              </TVFocusable>
              <TVFocusable
                onPress={() => seekBy(10)}
                style={[styles.sideBtn, isLive && { opacity: 0.4 }]}
                disabled={isLive}
                testID="player-seek-fwd"
                nextFocusUp={topBarHandle}
              >
                <MaterialCommunityIcons name="fast-forward-10" size={32} color={colors.white} />
              </TVFocusable>
            </View>

            <View style={styles.bottomWrap} pointerEvents="box-none">
              <View style={styles.logoBlock}>
                <View style={styles.logoCard}>
                  {logo ? (
                    <Image source={{ uri: logo }} style={{ width: 56, height: 56 }} contentFit="contain" />
                  ) : (
                    <MaterialCommunityIcons name="television-classic" size={32} color={colors.black} />
                  )}
                </View>
              </View>

              <View style={styles.infoBlock}>
                <Text style={styles.channelName} numberOfLines={1}>{channelName}</Text>
                {isLive ? (
                  <>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>AO VIVO</Text>
                    </View>
                    {!!nowProgram && (
                      <Text style={styles.epgNow} numberOfLines={1}>
                        Agora: {decodeEpgText(nowProgram.title)} ({formatEpgTime(nowProgram.start)}–{formatEpgTime(nowProgram.end)})
                      </Text>
                    )}
                    {!!nextProgram && (
                      <Text style={styles.epgNext} numberOfLines={1}>
                        A seguir: {decodeEpgText(nextProgram.title)} ({formatEpgTime(nextProgram.start)})
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.progressRow}>
                      <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                      <SeekBar progress={progress} onSeek={seekToPercent} />
                      <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {isLive && (
              <View style={styles.epgStripWrap}>
                <EpgStrip
                  creds={getXtream()}
                  channelId={Number(String(current.id).replace('live-', ''))}
                  channelName={channelName}
                  channelCover={logo}
                />
              </View>
            )}
          </SafeAreaView>
        </>
      )}

      {isLive && (
        <Modal
          visible={showChannelGrid}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChannelGrid(false)}
        >
          <View style={styles.gridRoot}>
            {/* Tapping the empty area (over the still-visible/still-playing
                video) closes the panel without switching anything. */}
            <Pressable style={styles.gridBackdrop} onPress={() => setShowChannelGrid(false)} />

            <View style={[styles.gridPanel, isLandscape && styles.gridPanelFullscreen]}>
              <View style={styles.gridHeader}>
                <Text style={styles.gridTitle}>Canais</Text>
                <TVFocusable onPress={() => setShowChannelGrid(false)} hitSlop={12} testID="player-grid-close">
                  <Ionicons name="close" size={22} color={colors.white} />
                </TVFocusable>
              </View>

              <View style={styles.gridSearchBox}>
                <Ionicons name="search" size={15} color={colors.textMuted} />
                <TextInput
                  value={channelSearch}
                  onChangeText={setChannelSearch}
                  placeholder="Buscar canal..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.gridSearchInput}
                  testID="player-grid-search"
                />
              </View>

              {categories.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gridCatRow}
                >
                  {['Todos', ...categories.map((c) => c.category_name)].map((cat) => {
                    const active = cat === selectedCat;
                    return (
                      <TVFocusable
                        key={cat}
                        onPress={() => setSelectedCat(cat)}
                        style={[styles.gridCatChip, active && styles.gridCatChipActive]}
                        testID={`player-grid-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Text style={[styles.gridCatChipText, active && styles.gridCatChipTextActive]} numberOfLines={1}>
                          {cat}
                        </Text>
                      </TVFocusable>
                    );
                  })}
                </ScrollView>
              )}

              {loadingChannels ? (
                <View style={styles.gridLoading}>
                  <ActivityIndicator color={colors.accentCyan} />
                </View>
              ) : (
                <FlatList
                  data={channelList.filter((c) => {
                    const q = channelSearch.trim().toLowerCase();
                    const qOk = !q || c.name.toLowerCase().includes(q);
                    const catId = selectedCat === 'Todos' ? null : categories.find((cc) => cc.category_name === selectedCat)?.category_id;
                    const catOk = !catId || c.category_id === catId;
                    return qOk && catOk;
                  })}
                  keyExtractor={(c) => String(c.stream_id)}
                  contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 32, gap: 6 }}
                  renderItem={({ item }) => {
                    const active = current.id === `live-${item.stream_id}`;
                    return (
                      <TVFocusable
                        onPress={() => switchChannel(item)}
                        style={[styles.gridRow, active && styles.gridRowActive]}
                        testID={`player-grid-channel-${item.stream_id}`}
                      >
                        <View style={styles.gridLogoBox}>
                          {item.stream_icon ? (
                            <Image source={{ uri: item.stream_icon }} style={styles.gridLogoImg} contentFit="contain" />
                          ) : (
                            <MaterialCommunityIcons name="television-classic" size={18} color={colors.textMuted} />
                          )}
                        </View>
                        <Text style={styles.gridRowText} numberOfLines={1}>{item.name}</Text>
                        {active && (
                          <View style={styles.gridRowLiveBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.gridRowLiveText}>NO AR</Text>
                          </View>
                        )}
                      </TVFocusable>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function SeekBar({ progress, onSeek }: { progress: number; onSeek: (pct: number) => void }) {
  const [width, setWidth] = useState(1);
  return (
    <Pressable
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => {
        const x = e.nativeEvent.locationX;
        onSeek(Math.max(0, Math.min(1, x / width)));
      }}
      style={styles.seekTouch}
      testID="player-seek-bar"
    >
      <View style={styles.seekTrack}>
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  safe: { flex: 1 },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,15,26,0.85)',
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: { color: colors.white, fontSize: 14, textAlign: 'center' },
  errorBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.accentCyan,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
  },
  errorBtnText: { color: colors.accentCyan, fontWeight: '800', letterSpacing: 1.2 },
  topScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 12,
  },
  topActions: { flexDirection: 'row', gap: 8 },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(11,15,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    color: colors.white,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 15,
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  sideBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(76,232,240,0.15)',
    borderWidth: 2,
    borderColor: colors.accentCyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  epgStripWrap: { paddingBottom: spacing.md },
  logoBlock: { width: 72, alignItems: 'center' },
  logoCard: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  infoBlock: { flex: 1 },
  channelName: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.black },
  liveText: { color: colors.black, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  epgNow: { color: colors.white, fontSize: 11, marginTop: 4, fontWeight: '600' },
  epgNext: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'center',
  },
  seekTouch: { flex: 1, paddingVertical: 12, justifyContent: 'center' },
  seekTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'visible',
  },
  seekFill: {
    height: '100%',
    backgroundColor: colors.accentCyan,
    borderRadius: 2,
  },
  seekThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
    marginLeft: -7,
  },
  gridRoot: { flex: 1, flexDirection: 'row' },
  gridBackdrop: { flex: 1 },
  gridPanel: {
    width: '78%',
    maxWidth: 380,
    height: '100%',
    backgroundColor: 'rgba(11,15,26,0.62)',
    paddingTop: 16,
  },
  gridPanelFullscreen: { width: '100%', maxWidth: undefined },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: 8,
  },
  gridTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  gridSearchBox: {
    marginHorizontal: spacing.md,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridSearchInput: { flex: 1, color: colors.white, fontSize: 13 },
  gridCatRow: { gap: 6, paddingHorizontal: spacing.md, paddingBottom: 8, alignItems: 'center' },
  gridCatChip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gridCatChipActive: { backgroundColor: 'rgba(76,232,240,0.18)' },
  gridCatChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  gridCatChipTextActive: { color: colors.accentCyan },
  gridLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  gridRowActive: { backgroundColor: 'rgba(76,232,240,0.14)' },
  gridLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLogoImg: { width: 28, height: 28 },
  gridRowText: { flex: 1, color: colors.white, fontSize: 13, fontWeight: '600' },
  gridRowLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  gridRowLiveText: { color: colors.black, fontSize: 8, fontWeight: '900' },
});
