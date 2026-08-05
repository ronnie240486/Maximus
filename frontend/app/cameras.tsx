import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView, Linking, TextInput, useWindowDimensions } from 'react-native';
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

// Câmeras de trânsito por estado — cada órgão publica do seu jeito, sem
// API pública documentada, então em vez de tentar "adivinhar" uma
// estrutura de dados (arriscado, pode quebrar sem aviso), abrimos o
// portal OFICIAL de cada um dentro do próprio app (mesmo padrão que
// trailer.tsx já usa pro YouTube).
// Só São Paulo tem uma fonte confirmada funcionando no momento em que
// isso foi escrito — Rio de Janeiro descontinuou o portal antigo (o
// endereço atual redireciona pro app COR.Rio, que não dá pra embutir) e
// Minas Gerais (BHTrans) desativou de vez o serviço de câmeras ao vivo.
const TRAFFIC_SOURCES: { id: string; name: string; url: string | null; note?: string }[] = [
  { id: 'sp', name: 'São Paulo (CET-SP)', url: 'https://cameras.cetsp.com.br/' },
  { id: 'rj', name: 'Rio de Janeiro', url: null, note: 'Portal oficial fora do ar no momento — a Prefeitura direciona pro app COR.Rio, que não dá pra abrir aqui dentro.' },
  { id: 'mg', name: 'Minas Gerais (BHTrans)', url: null, note: 'A BHTrans desativou o serviço de câmeras de trânsito ao vivo.' },
];

export default function CamerasScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const numColumns = isLandscape ? 5 : 2;
  const itemGap = spacing.sm;
  const gridWidth = width;
  const itemWidth = (gridWidth - spacing.md * 2 - itemGap * (numColumns - 1)) / numColumns;

  const [tab, setTab] = useState<'webcams' | 'traffic'>('webcams');
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
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.modeRow}>
        <TVFocusable
          onPress={() => setTab('webcams')}
          style={[styles.modeBtn, tab === 'webcams' && styles.modeBtnActive]}
          testID="cameras-mode-webcams"
        >
          <Text style={[styles.modeBtnText, tab === 'webcams' && styles.modeBtnTextActive]}>Paisagens / Praias</Text>
        </TVFocusable>
        <TVFocusable
          onPress={() => setTab('traffic')}
          style={[styles.modeBtn, tab === 'traffic' && styles.modeBtnActive]}
          testID="cameras-mode-traffic"
        >
          <Text style={[styles.modeBtnText, tab === 'traffic' && styles.modeBtnTextActive]}>Trânsito</Text>
        </TVFocusable>
      </View>

      {tab === 'traffic' ? (
        <View style={{ padding: spacing.md, gap: spacing.md }}>
          {TRAFFIC_SOURCES.map((s) => (
            <View key={s.id} style={styles.trafficCard}>
              <Text style={styles.trafficName}>{s.name}</Text>
              {s.url ? (
                <TVFocusable
                  onPress={() => Linking.openURL(s.url!)}
                  style={styles.trafficBtn}
                  testID={`traffic-${s.id}`}
                >
                  <Ionicons name="open-outline" size={16} color={colors.black} />
                  <Text style={styles.trafficBtnText}>Abrir portal oficial</Text>
                </TVFocusable>
              ) : (
                <Text style={styles.trafficNote}>{s.note}</Text>
              )}
            </View>
          ))}
        </View>
      ) : !configured ? (
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
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.darkSurfaceAlt,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: colors.accentCyan },
  modeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  modeBtnTextActive: { color: colors.black },
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
  trafficCard: {
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    gap: 8,
  },
  trafficName: { color: colors.white, fontSize: 15, fontWeight: '800' },
  trafficNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  trafficBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  trafficBtnText: { color: colors.black, fontSize: 12, fontWeight: '800' },
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
