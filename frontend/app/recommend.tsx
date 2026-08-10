import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import { posterImageProps } from '@/src/lib/image-placeholder';
import { getXtream } from '@/src/state/session';
import { xtream, XtreamCategory, XtreamMovie, XtreamSeries } from '@/src/lib/xtream';
import { isAdultCategoryName, filterToKidsCategories, filterToKidsItems } from '@/src/lib/adult-content';
import { isActiveProfileKids } from '@/src/state/profiles';
import { useParentalGate } from '@/src/lib/use-parental-gate';
import { loadListCache } from '@/src/state/list-cache';
import { GenreKey, GENRE_LABELS, filterByGenre, shuffleSample } from '@/src/lib/genre-detect';
import TVFocusable from '@/src/components/TVFocusable';

const SUGGESTION_COUNT = 20;

type SuggestionItem = {
  key: string;
  kind: 'movie' | 'series';
  name: string;
  cover?: string;
  categoryId?: string;
  raw: XtreamMovie | XtreamSeries;
};

export default function RecommendScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ genre: string; query?: string }>();
  const genre = params.genre as GenreKey;
  const { modal: parentalModal, guard } = useParentalGate();

  const [loading, setLoading] = useState(true);
  const [kidsMode, setKidsMode] = useState(false);
  const [moviePool, setMoviePool] = useState<{ items: XtreamMovie[]; categories: XtreamCategory[] }>({ items: [], categories: [] });
  const [seriesPool, setSeriesPool] = useState<{ items: XtreamSeries[]; categories: XtreamCategory[] }>({ items: [], categories: [] });
  const [shownItems, setShownItems] = useState<SuggestionItem[]>([]);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    isActiveProfileKids().then(setKidsMode);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const creds = getXtream();
    if (!creds) {
      setLoading(false);
      return;
    }
    // Usa o mesmo cache que Filmes/Séries já mantêm — se a pessoa já
    // abriu essas telas antes, isso é instantâneo (sem esperar rede).
    // Se ainda não tiver cache (app recém-aberto), busca na hora.
    const [movieCache, seriesCache] = await Promise.all([
      loadListCache<XtreamCategory, XtreamMovie>('movies'),
      loadListCache<XtreamCategory, XtreamSeries>('series'),
    ]);

    let movieItems = movieCache?.items || [];
    let movieCats = movieCache?.categories || [];
    if (movieItems.length === 0) {
      const [cats, items] = await Promise.all([xtream.vodCategories(creds), xtream.vodStreams(creds)]);
      movieCats = cats || [];
      movieItems = items || [];
    }

    let seriesItems = seriesCache?.items || [];
    let seriesCats = seriesCache?.categories || [];
    if (seriesItems.length === 0) {
      const [cats, items] = await Promise.all([xtream.seriesCategories(creds), xtream.seriesList(creds)]);
      seriesCats = cats || [];
      seriesItems = items || [];
    }

    setMoviePool({ items: movieItems, categories: movieCats });
    setSeriesPool({ items: seriesItems, categories: seriesCats });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = useCallback(() => {
    // Perfil infantil: nunca sugere fora da curadoria kids (mesma regra
    // das telas de Filmes/Séries). Perfil normal: sugere de tudo, só pede
    // PIN ao abrir algo de categoria adulta (via guard, igual às outras
    // telas) — não filtra a sugestão em si.
    const movieCats = kidsMode ? filterToKidsCategories(moviePool.categories) : moviePool.categories;
    const movieItems = kidsMode ? filterToKidsItems(moviePool.items, moviePool.categories) : moviePool.items;
    const seriesCats = kidsMode ? filterToKidsCategories(seriesPool.categories) : seriesPool.categories;
    const seriesItemsBase = kidsMode ? filterToKidsItems(seriesPool.items, seriesPool.categories) : seriesPool.items;

    const matchedMovies = genre ? filterByGenre(movieItems, movieCats, genre) : [];
    const matchedSeries = genre ? filterByGenre(seriesItemsBase, seriesCats, genre) : [];

    // Mistura filme e série no resultado — metade de cada, mais ou menos
    // (se um dos dois tiver pouca coisa, completa com o outro).
    const halfCount = Math.ceil(SUGGESTION_COUNT / 2);
    const pickedMovies = shuffleSample(matchedMovies, halfCount);
    const pickedSeries = shuffleSample(matchedSeries, SUGGESTION_COUNT - pickedMovies.length);
    let combined: SuggestionItem[] = [
      ...pickedMovies.map((m) => ({ key: `movie-${m.stream_id}`, kind: 'movie' as const, name: m.name, cover: m.stream_icon, categoryId: m.category_id, raw: m })),
      ...pickedSeries.map((s) => ({ key: `series-${s.series_id}`, kind: 'series' as const, name: s.name, cover: s.cover, categoryId: s.category_id, raw: s })),
    ];
    if (combined.length < SUGGESTION_COUNT && matchedMovies.length > pickedMovies.length) {
      const extra = shuffleSample(matchedMovies.filter((m) => !pickedMovies.includes(m)), SUGGESTION_COUNT - combined.length);
      combined = [...combined, ...extra.map((m) => ({ key: `movie-${m.stream_id}`, kind: 'movie' as const, name: m.name, cover: m.stream_icon, categoryId: m.category_id, raw: m }))];
    }
    if (combined.length < SUGGESTION_COUNT && matchedSeries.length > pickedSeries.length) {
      const extra = shuffleSample(matchedSeries.filter((s) => !pickedSeries.includes(s)), SUGGESTION_COUNT - combined.length);
      combined = [...combined, ...extra.map((s) => ({ key: `series-${s.series_id}`, kind: 'series' as const, name: s.name, cover: s.cover, categoryId: s.category_id, raw: s }))];
    }

    setShownItems(shuffleSample(combined, combined.length));
  }, [genre, kidsMode, moviePool, seriesPool]);

  useEffect(() => {
    if (!loading) pick();
  }, [loading, seed, pick]);

  const totalMatches = useMemo(() => {
    const movieCats = kidsMode ? filterToKidsCategories(moviePool.categories) : moviePool.categories;
    const movieItems = kidsMode ? filterToKidsItems(moviePool.items, moviePool.categories) : moviePool.items;
    const seriesCats = kidsMode ? filterToKidsCategories(seriesPool.categories) : seriesPool.categories;
    const seriesItemsBase = kidsMode ? filterToKidsItems(seriesPool.items, seriesPool.categories) : seriesPool.items;
    if (!genre) return 0;
    return filterByGenre(movieItems, movieCats, genre).length + filterByGenre(seriesItemsBase, seriesCats, genre).length;
  }, [genre, kidsMode, moviePool, seriesPool]);

  const openItem = (item: SuggestionItem) => {
    const cats = item.kind === 'movie' ? moviePool.categories : seriesPool.categories;
    const categoryName = cats.find((c) => c.category_id === item.categoryId)?.category_name;
    guard(categoryName, () => {
      if (item.kind === 'movie') {
        const m = item.raw as XtreamMovie;
        router.push({
          pathname: '/movie-details',
          params: { id: String(m.stream_id), name: m.name, cover: m.stream_icon || '', adult: isAdultCategoryName(categoryName) ? '1' : '' },
        });
      } else {
        const s = item.raw as XtreamSeries;
        router.push({
          pathname: '/series-details',
          params: { id: String(s.series_id), name: s.name, cover: s.cover || '', adult: isAdultCategoryName(categoryName) ? '1' : '' },
        });
      }
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TVFocusable onPress={() => router.back()} style={styles.backBtn} testID="recommend-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TVFocusable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {genre ? GENRE_LABELS[genre] : 'Sugestões'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {!!params.query && (
        <Text style={styles.querySubtitle} numberOfLines={1}>Baseado em: "{params.query}"</Text>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentCyan} size="large" />
        </View>
      ) : shownItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="film-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Não achei filmes ou séries desse gênero no seu catálogo ainda. Essa busca reconhece os títulos mais
            conhecidos — pode não cobrir tudo que você tem disponível.
          </Text>
        </View>
      ) : (
        <>
          <FlashList
            data={shownItems}
            keyExtractor={(item) => item.key}
            numColumns={3}
            contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
            renderItem={({ item }) => (
              <TVFocusable onPress={() => openItem(item)} style={styles.card} testID={`recommend-item-${item.key}`}>
                <View style={styles.posterBox}>
                  {item.cover ? (
                    <Image source={{ uri: item.cover }} style={styles.poster} {...posterImageProps} />
                  ) : (
                    <MaterialCommunityIcons name={item.kind === 'movie' ? 'movie-open' : 'television-classic'} size={28} color={colors.textMuted} />
                  )}
                  <View style={styles.kindBadge}>
                    <Text style={styles.kindBadgeText}>{item.kind === 'movie' ? 'FILME' : 'SÉRIE'}</Text>
                  </View>
                </View>
                <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
              </TVFocusable>
            )}
          />

          <TVFocusable onPress={() => setSeed((s) => s + 1)} style={styles.shuffleBtn} testID="recommend-shuffle">
            <Ionicons name="shuffle" size={16} color={colors.black} />
            <Text style={styles.shuffleBtnText}>
              Outras sugestões{totalMatches > SUGGESTION_COUNT ? ` (${totalMatches} no total)` : ''}
            </Text>
          </TVFocusable>
        </>
      )}

      {parentalModal}
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
  headerTitle: { flex: 1, color: colors.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  querySubtitle: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', paddingBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: { flex: 1, margin: 6, maxWidth: '31%' },
  posterBox: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  poster: { width: '100%', height: '100%' },
  kindBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kindBadgeText: { color: colors.white, fontSize: 8, fontWeight: '800' },
  cardName: { color: colors.white, fontSize: 12, fontWeight: '600', marginTop: 4 },
  shuffleBtn: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  shuffleBtnText: { color: colors.black, fontWeight: '800', fontSize: 13 },
});
