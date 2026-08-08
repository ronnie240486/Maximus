import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import {
  Webcam,
  WebcamCategory,
  hasWebcamsApiKey,
  fetchWebcamCategories,
  searchBrazilWebcams,
  searchBrazilWebcamsByCity,
} from '@/src/lib/webcams';
import TVFocusable from '@/src/components/TVFocusable';

const ALL_KEY = '__all__';
const PAGE_SIZE = 30;

export default function CamerasScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const numColumns = isLandscape ? 5 : 2;
  const itemGap = spacing.sm;
  const gridWidth = width;
  const itemWidth = (gridWidth - spacing.md * 2 - itemGap * (numColumns - 1)) / numColumns;

  const [configured] = useState(hasWebcamsApiKey());
  const [categories, setCategories] = useState<WebcamCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState(ALL_KEY);
  const [webcams, setWebcams] = useState<Webcam[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [citySearching, setCitySearching] = useState(false);
  const [cityResults, setCityResults] = useState<Webcam[] | null>(null);

  const runCitySearch = async () => {
    if (!cityQuery.trim()) {
      setCityResults(null);
      return;
    }
    setCitySearching(true);
    const results = await searchBrazilWebcamsByCity(cityQuery);
    setCityResults(results);
    setCitySearching(false);
  };

  useEffect(() => {
    if (!configured) return;
    fetchWebcamCategories().then(setCategories);
  }, [configured]);

  const load = useCallback(async (category: string, offset: number) => {
    const { webcams: list, total: t } = await searchBrazilWebcams({
      category: category === ALL_KEY ? undefined : category,
      offset,
      limit: PAGE_SIZE,
    });
    setTotal(t);
    return list;
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load(selectedCat, 0).then((list) => {
      setWebcams(list);
      setLoading(false);
    });
  }, [selectedCat, configured, load]);

  const loadMore = async () => {
    if (loadingMore || loading || webcams.length >= total) return;
    setLoadingMore(true);
    const more = await load(selectedCat, webcams.length);
    setWebcams((prev) => [...prev, ...more]);
    setLoadingMore(false);
  };

  const openCamera = (cam: Webcam) => {
    router.push({
      pathname: '/camera-details',
      params: { id: String(cam.webcamId), title: cam.title },
    });
  };

  const catTabs = [{ id: ALL_KEY, name: 'Todas' }, ...categories];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="cameras-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Câmeras ao vivo — Brasil</Text>
        <Pressable
          onPress={() => router.push('/world-cameras')}
          hitSlop={16}
          style={styles.backBtn}
          testID="cameras-open-world"
        >
          <Ionicons name="earth" size={22} color={colors.accentCyan} />
        </Pressable>
      </View>

      {!configured ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="videocam-off-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Câmeras ainda não configuradas</Text>
          <Text style={styles.emptyText}>
            Esse recurso usa o catálogo público de webcams da Windy. Peça pra quem administra o app cadastrar a
            chave gratuita da API em api.windy.com/keys.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={cityQuery}
              onChangeText={setCityQuery}
              onSubmitEditing={runCitySearch}
              placeholder="Buscar por cidade (ex: Ouro Fino)"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              testID="camera-city-search"
            />
            {cityQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setCityQuery('');
                  setCityResults(null);
                }}
                hitSlop={10}
                testID="camera-city-search-clear"
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {cityResults === null && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
              style={styles.tabsScroll}
            >
              {catTabs.map((c) => {
                const active = selectedCat === c.id;
                return (
                  <TVFocusable
                    key={c.id}
                    onPress={() => setSelectedCat(c.id)}
                    style={[styles.tab, active && styles.tabActive]}
                    testID={`camera-cat-${c.id}`}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{c.name}</Text>
                  </TVFocusable>
                );
              })}
            </ScrollView>
          )}

          {citySearching ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accentCyan} size="large" />
              <Text style={styles.emptyText}>Procurando "{cityQuery}"...</Text>
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accentCyan} size="large" />
            </View>
          ) : (cityResults ?? webcams).length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="videocam-off-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhuma câmera encontrada</Text>
              <Text style={styles.emptyText}>
                {cityResults !== null ? 'Tenta buscar outra cidade próxima ou o nome da região.' : 'Tenta outra categoria.'}
              </Text>
            </View>
          ) : (
            <FlatList
              key={numColumns}
              data={cityResults ?? webcams}
              keyExtractor={(w) => String(w.webcamId)}
              numColumns={numColumns}
              columnWrapperStyle={{ gap: itemGap, paddingHorizontal: spacing.md }}
              contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 32, gap: spacing.md }}
              onEndReached={cityResults === null ? loadMore : undefined}
              onEndReachedThreshold={0.4}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accentCyan} style={{ marginTop: spacing.md }} /> : null}
              renderItem={({ item }) => (
                <TVFocusable onPress={() => openCamera(item)} style={{ width: itemWidth }} testID={`camera-${item.webcamId}`}>
                  <View style={[styles.thumb, { width: itemWidth, height: itemWidth * (3 / 4) }]}>
                    {item.images?.current?.preview ? (
                      <Image source={{ uri: item.images.current.preview }} style={styles.thumbImg} contentFit="cover" />
                    ) : (
                      <Ionicons name="videocam-outline" size={26} color={colors.textMuted} />
                    )}
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>AO VIVO</Text>
                    </View>
                  </View>
                  <Text style={styles.camTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.location?.city && (
                    <Text style={styles.camLocation} numberOfLines={1}>
                      {item.location.city}{item.location.region ? `, ${item.location.region}` : ''}
                    </Text>
                  )}
                </TVFocusable>
              )}
            />
          )}
        </>
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    height: 40,
  },
  searchInput: { flex: 1, color: colors.white, fontSize: 13 },
  tabsScroll: { flexGrow: 0, marginBottom: spacing.sm },
  tabsRow: { gap: 8, paddingHorizontal: spacing.md },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.darkSurfaceAlt,
  },
  tabActive: { backgroundColor: colors.accentCyan },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 10 },
  emptyTitle: { color: colors.white, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  thumb: {
    borderRadius: 10,
    backgroundColor: colors.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  liveBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F0997B' },
  liveText: { color: colors.white, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  camTitle: { color: colors.white, fontSize: 12, fontWeight: '700', marginTop: 6 },
  camLocation: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
});
