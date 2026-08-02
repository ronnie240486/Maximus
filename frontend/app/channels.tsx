import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import { getXtream } from '@/src/state/session';
import { loadListCache, saveListCache } from '@/src/state/list-cache';
import { xtream, XtreamCategory, XtreamLive, getLastXtreamError } from '@/src/lib/xtream';
import { isAdultCategoryName } from '@/src/lib/adult-content';
import { dedupeByName } from '@/src/lib/dedupe';
import { useParentalGate } from '@/src/lib/use-parental-gate';
import { loadFavorites, toggleFavorite } from '@/src/state/favorites';
import { useIsTV } from '@/src/hooks/useIsTV';
import TVFocusable from '@/src/components/TVFocusable';
import TVChannelPreview from '@/src/components/TVChannelPreview';

const ALL = 'Todos';
const FAVORITES = 'Favoritos';
const CACHE_KEY = 'channels';
const SIDE_COL_WIDTH = 160;

export default function ChannelsScreen() {
  const router = useRouter();
  const isTV = useIsTV();
  const params = useLocalSearchParams<{ initialQuery?: string; initialCategory?: string }>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const numColumns = isLandscape ? 4 : 2;
  const gridWidth = isLandscape ? width - SIDE_COL_WIDTH : width;
  const itemGap = spacing.sm;
  const itemWidth = (gridWidth - spacing.md * 2 - itemGap * (numColumns - 1)) / numColumns;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [streams, setStreams] = useState<XtreamLive[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>(params.initialCategory || ALL);
  const [query, setQuery] = useState(params.initialQuery || '');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<XtreamLive | null>(null);
  // Destaque visual da linha (instantâneo) — separado do preview de vídeo
  // em si, que é mais pesado e usa debounce (ver onFocusChannel abaixo).
  const [focusedChannel, setFocusedChannel] = useState<XtreamLive | null>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { modal: parentalModal, guard } = useParentalGate();

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then((list) => {
        setFavoriteIds(new Set(list.filter((f) => f.kind === 'channel').map((f) => f.id)));
      });
    }, [])
  );

  const onToggleFavorite = async (s: XtreamLive) => {
    const id = `channel-${s.stream_id}`;
    const nowFav = await toggleFavorite({ id, kind: 'channel', refId: s.stream_id, name: s.name, cover: s.stream_icon });
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    // Paint the cached list instantly (if we have one) instead of a blank
    // spinner, then refresh in the background — same idea as the Home screen.
    const cache = await loadListCache<XtreamCategory, XtreamLive>(CACHE_KEY);
    if (cache) {
      setCategories(cache.categories);
      setStreams(cache.items);
      setLoading(false);
    }

    const creds = getXtream();
    if (!creds) {
      if (!cache) setLoading(false);
      return;
    }

    // Categories are a small, fast call — let them paint the filter chips
    // immediately instead of waiting on the (often huge) channel list.
    const catsPromise = xtream.liveCategories(creds).then((cats) => {
      if (cats && cats.length) setCategories(cats);
      return cats;
    });

    const list = await xtream.liveStreams(creds);
    if (list && list.length) {
      setStreams(list);
      setLoadError(null);
    } else if (!cache) {
      setLoadError(getLastXtreamError());
    }
    setLoading(false);

    const cats = await catsPromise;
    if (list && list.length) {
      saveListCache(CACHE_KEY, cats || [], list);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const catNames = useMemo<string[]>(() => {
    return [FAVORITES, ALL, ...categories.map((c) => c.category_name)];
  }, [categories]);

  // Contagem por categoria (mostrada ao lado do nome na coluna da TV).
  // Precisa ser memoizada: sem isso, esse cálculo (um filter() por
  // categoria) rodava de novo em TODA renderização — inclusive a cada
  // movimento do D-pad na lista de canais (que atualiza `previewChannel`
  // e força o componente inteiro a re-renderizar) — pesado o bastante
  // pra contribuir com o travamento ao navegar em listas grandes.
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of catNames) {
      if (cat === ALL) {
        map[cat] = streams.length;
      } else if (cat === FAVORITES) {
        map[cat] = favoriteIds.size;
      } else {
        const catId = categories.find((c) => c.category_name === cat)?.category_id;
        map[cat] = catId ? streams.filter((s) => s.category_id === catId).length : 0;
      }
    }
    return map;
  }, [catNames, streams, categories, favoriteIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selectedCat === FAVORITES) {
      const matches = streams.filter((s) => favoriteIds.has(`channel-${s.stream_id}`));
      return dedupeByName(matches);
    }
    const selectedCatId =
      selectedCat === ALL ? null : categories.find((c) => c.category_name === selectedCat)?.category_id;
    const matches = streams.filter((s) => {
      const catOk = !selectedCatId || s.category_id === selectedCatId;
      const qOk = !q || s.name.toLowerCase().includes(q);
      return catOk && qOk;
    });
    return dedupeByName(matches);
  }, [streams, categories, selectedCat, query, favoriteIds]);

  // Mantém sempre algum canal em preview na TV: escolhe o primeiro da lista
  // filtrada se ainda não tem nenhum, ou se o que estava em foco sumiu do
  // filtro atual (ex: trocou de categoria).
  useEffect(() => {
    if (!isTV) return;
    if (!filtered.length) {
      setPreviewChannel(null);
      setFocusedChannel(null);
      return;
    }
    setPreviewChannel((prev) => {
      if (prev && filtered.some((s) => s.stream_id === prev.stream_id)) return prev;
      const next = filtered[0];
      setFocusedChannel(next);
      return next;
    });
  }, [isTV, filtered]);

  // Chamado a cada movimento do D-pad na lista (TV). Antes, cada um desses
  // eventos trocava o stream do preview NA HORA — como o D-pad dispara
  // vários focos por segundo ao segurar pra baixo/cima, isso derrubava uma
  // nova conexão de vídeo a cada linha percorrida, travando a navegação.
  // Agora só troca o vídeo de verdade depois que o usuário PARA de se
  // mexer por um instante; o destaque da linha continua instantâneo.
  const onFocusChannel = useCallback((item: XtreamLive) => {
    setFocusedChannel(item);
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      setPreviewChannel(item);
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, []);

  const openPlayer = (s: XtreamLive) => {
    const categoryName = categories.find((c) => c.category_id === s.category_id)?.category_name;
    guard(categoryName, () => {
      router.push({
        pathname: '/channel-details',
        params: {
          id: String(s.stream_id),
          name: s.name,
          cover: s.stream_icon || '',
          categoryName: categoryName || '',
          adult: isAdultCategoryName(categoryName) ? '1' : '',
        },
      });
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.header, isLandscape && { paddingVertical: 5 }]}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="channels-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={[styles.headerTitle, isLandscape && { fontSize: 15 }]}>Canais ao vivo</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/favorites')} hitSlop={12} testID="channels-favorites">
            <Ionicons name="heart-outline" size={22} color={colors.white} />
          </Pressable>
          <Pressable onPress={() => setShowCategoryDrawer(true)} hitSlop={12} testID="channels-menu">
            <Ionicons name="menu" size={24} color={colors.white} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar canal..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="channels-search-input"
        />
      </View>

      {!!params.initialQuery && (
        <View style={styles.gameHint} testID="channels-game-hint">
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.gameHintText}>
            Não sabemos qual canal exato transmite esse jogo — filtramos por "{params.initialQuery}", mas talvez precise procurar manualmente.
          </Text>
        </View>
      )}

      {/* Category chips — horizontal chrome (retrato apenas; em paisagem vira coluna lateral abaixo) */}
      {!isLandscape && !isTV && (
        <View style={styles.chipRow} testID="channels-chip-row">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowInner}>
            {catNames.map((cat) => {
              const active = cat === selectedCat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`chip-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {cat === FAVORITES && (
                    <Ionicons
                      name="heart"
                      size={12}
                      color={active ? colors.accentCyan : colors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isTV ? (
        <View style={{ flex: 1, flexDirection: 'row' }} testID="channels-tv-layout">
          <ScrollView
            style={styles.tvCatCol}
            contentContainerStyle={styles.tvCatColInner}
            showsVerticalScrollIndicator={false}
            testID="channels-tv-categories"
          >
            {catNames.map((cat) => {
              const active = cat === selectedCat;
              const count = categoryCounts[cat] ?? 0;
              return (
                <TVFocusable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[styles.tvCatItem, active && styles.tvCatItemActive]}
                  testID={`tv-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                    {cat === FAVORITES && (
                      <Ionicons name="heart" size={12} color={active ? colors.accentCyan : colors.textSecondary} />
                    )}
                    <Text style={[styles.tvCatText, active && styles.tvCatTextActive]} numberOfLines={1}>
                      {cat}
                    </Text>
                  </View>
                  <Text style={styles.tvCatCount}>{count}</Text>
                </TVFocusable>
              );
            })}
          </ScrollView>

          <View style={styles.tvListCol}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accentCyan} />
              </View>
            ) : filtered.length === 0 ? (
              <Empty errorCode={loadError} onRetry={load} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(c) => String(c.stream_id)}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={7}
                removeClippedSubviews
                renderItem={({ item, index }) => {
                  // Destaque da linha usa o canal em FOCO agora mesmo (sem
                  // atraso) — só o preview de vídeo em si (mais pesado) é
                  // que espera o usuário parar de se mexer, ver mais abaixo.
                  const rowActive = focusedChannel?.stream_id === item.stream_id;
                  return (
                    <TVFocusable
                      onFocus={() => onFocusChannel(item)}
                      onPress={() => openPlayer(item)}
                      style={[styles.tvRow, rowActive && styles.tvRowActive]}
                      focusStyle={styles.tvRowFocus}
                      testID={`tv-channel-${item.stream_id}`}
                    >
                      <Text style={styles.tvRowNum}>{item.num ?? index + 1}</Text>
                      {item.stream_icon ? (
                        <Image source={{ uri: item.stream_icon }} style={styles.tvRowIcon} contentFit="contain" />
                      ) : (
                        <MaterialCommunityIcons name="television-classic" size={22} color={colors.textMuted} />
                      )}
                      <Text style={styles.tvRowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {favoriteIds.has(`channel-${item.stream_id}`) && (
                        <Ionicons name="heart" size={14} color={colors.accentMagenta} />
                      )}
                    </TVFocusable>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.tvPreviewCol}>
            <TVChannelPreview
              channel={previewChannel}
              creds={getXtream()}
              isFavorite={!!previewChannel && favoriteIds.has(`channel-${previewChannel.stream_id}`)}
              onToggleFavorite={() => previewChannel && onToggleFavorite(previewChannel)}
              onOpenFull={() => previewChannel && openPlayer(previewChannel)}
              onSearch={() => router.push('/search')}
            />
          </View>
        </View>
      ) : (
      <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
        {isLandscape && (
          <ScrollView style={styles.sideCatCol} contentContainerStyle={styles.sideCatColInner} showsVerticalScrollIndicator={false} testID="channels-side-categories">
            {catNames.map((cat) => {
              const active = cat === selectedCat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[styles.sideChip, active && styles.sideChipActive]}
                  testID={`chip-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {cat === FAVORITES && (
                    <Ionicons name="heart" size={12} color={active ? colors.accentCyan : colors.textSecondary} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[styles.sideChipText, active && styles.sideChipTextActive]} numberOfLines={2}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accentCyan} />
            </View>
          ) : filtered.length === 0 ? (
            <Empty errorCode={loadError} onRetry={load} />
          ) : (
        <FlatList
          key={numColumns}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(c) => String(c.stream_id)}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 32, gap: spacing.sm }}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openPlayer(item)}
              style={[styles.card, { width: itemWidth }]}
              testID={`channel-${item.stream_id}`}
            >
              <View style={styles.logoBox}>
                {item.stream_icon ? (
                  <Image source={{ uri: item.stream_icon }} style={styles.logoImg} contentFit="contain" />
                ) : (
                  <MaterialCommunityIcons name="television-classic" size={28} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                {!!item.category_id && (
                  <Text style={styles.cardCat} numberOfLines={1}>
                    {categories.find((c) => c.category_id === item.category_id)?.category_name || ''}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => onToggleFavorite(item)}
                hitSlop={10}
                style={styles.cardHeart}
                testID={`channel-favorite-${item.stream_id}`}
              >
                <Ionicons
                  name={favoriteIds.has(`channel-${item.stream_id}`) ? 'heart' : 'heart-outline'}
                  size={16}
                  color={favoriteIds.has(`channel-${item.stream_id}`) ? colors.accentMagenta : colors.textMuted}
                />
              </Pressable>
            </Pressable>
          )}
        />
          )}
        </View>
      </View>
      )}
      {parentalModal}

      {/* Categories drawer — opened via the header menu button. Picking a
          category filters the same channel grid in place, no navigation. */}
      <Modal visible={showCategoryDrawer} transparent animationType="fade" onRequestClose={() => setShowCategoryDrawer(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setShowCategoryDrawer(false)}>
          <Pressable style={styles.drawerPanel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.drawerTitle}>CATEGORIAS</Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {catNames.map((cat) => {
                const active = cat === selectedCat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setSelectedCat(cat);
                      setShowCategoryDrawer(false);
                    }}
                    style={[styles.drawerItem, active && styles.drawerItemActive]}
                    testID={`drawer-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                      {cat === FAVORITES && <Ionicons name="heart" size={14} color={active ? colors.accentCyan : colors.textSecondary} />}
                      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]} numberOfLines={1}>
                        {cat}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={16} color={colors.accentCyan} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Empty({ errorCode, onRetry }: { errorCode: string | null; onRetry: () => void }) {
  const blocked = errorCode === 'BLOCKED_CLOUDFLARE';
  return (
    <View style={styles.center} testID="channels-empty">
      <MaterialCommunityIcons
        name={blocked ? 'cloud-alert' : 'television-off'}
        size={44}
        color={colors.textMuted}
      />
      <Text style={styles.emptyTitle}>
        {blocked ? 'Bloqueado no preview' : 'Nenhum canal encontrado'}
      </Text>
      <Text style={styles.emptySub}>
        {blocked
          ? 'Abra o app no Expo Go pelo celular ou no APK\npra carregar os canais.'
          : 'Tente outra categoria ou verifique sua conexão.'}
      </Text>
      <Pressable onPress={onRetry} style={styles.retryBtn} testID="channels-retry">
        <Ionicons name="refresh" size={14} color={colors.accentCyan} />
        <Text style={styles.retryText}>TENTAR NOVAMENTE</Text>
      </Pressable>
    </View>
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
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  searchBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: colors.white, fontSize: 14 },
  gameHint: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.darkSurfaceAlt,
  },
  gameHintText: { flex: 1, color: colors.textSecondary, fontSize: 10, lineHeight: 14 },
  chipRow: { height: 56, justifyContent: 'center' },
  chipRowInner: { gap: 8, paddingHorizontal: spacing.md, alignItems: 'center' },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.darkSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.darkSurfaceAlt,
    flexShrink: 0,
    maxWidth: 200,
  },
  chipActive: { borderColor: colors.accentCyan, backgroundColor: 'rgba(76,232,240,0.10)' },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.accentCyan },
  sideCatCol: { width: 160, maxWidth: 160, minWidth: 160, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: colors.darkSurfaceAlt },
  sideCatColInner: { padding: 6, gap: 4 },
  sideChip: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: colors.darkSurface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideChipActive: { backgroundColor: 'rgba(76,232,240,0.14)' },
  sideChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  // --- Layout de TV (categorias | lista numerada | preview ao vivo) ---
  tvCatCol: {
    width: 200,
    maxWidth: 200,
    minWidth: 200,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: colors.darkSurfaceAlt,
  },
  tvCatColInner: { paddingVertical: spacing.sm },
  tvCatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  tvCatItemActive: { backgroundColor: 'rgba(76,232,240,0.14)' },
  tvCatText: { color: colors.textSecondary, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  tvCatTextActive: { color: colors.accentCyan },
  tvCatCount: { color: colors.textMuted, fontSize: 13, marginLeft: 6 },
  tvListCol: {
    width: 340,
    maxWidth: 340,
    minWidth: 340,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: colors.darkSurfaceAlt,
  },
  tvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  tvRowActive: { backgroundColor: 'rgba(76,232,240,0.10)' },
  tvRowFocus: {
    borderWidth: 2,
    borderColor: colors.accentCyan,
    borderRadius: 8,
    transform: [{ scale: 1 }],
  },
  tvRowNum: { color: colors.textMuted, fontSize: 14, width: 34, fontVariant: ['tabular-nums'] },
  tvRowIcon: { width: 32, height: 32 },
  tvRowName: { color: colors.white, fontSize: 16, fontWeight: '600', flex: 1 },
  tvPreviewCol: { flex: 1, padding: spacing.sm },
  sideChipTextActive: { color: colors.accentCyan },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    minHeight: 68,
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: 44, height: 44 },
  cardName: { color: colors.white, fontSize: 13, fontWeight: '700' },
  cardCat: { color: colors.textMuted, fontSize: 10, marginTop: 2, letterSpacing: 0.5 },
  emptyTitle: { color: colors.white, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  retryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accentCyan,
  },
  retryText: { color: colors.accentCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  cardHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(11,15,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerPanel: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: colors.darkSurface,
    paddingTop: 60,
    paddingHorizontal: spacing.md,
  },
  drawerTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  drawerItemActive: { backgroundColor: 'rgba(76,232,240,0.10)' },
  drawerItemText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 },
  drawerItemTextActive: { color: colors.accentCyan, fontWeight: '800' },
});
