import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import TVFocusable from '@/src/components/TVFocusable';

// O site "Câmeras do Mundo" (camerasdomundo.com) foi descartado como fonte
// — o player deles está quebrado até no site oficial (fora do nosso app),
// só o link "canal do YouTube" funciona. Em vez de depender de um player
// de terceiro instável, cada país abre uma BUSCA no YouTube por câmeras
// ao vivo — o YouTube é a mesma base que já usamos (e sabemos que
// funciona bem) pros trailers. Sem link fixo pra vídeo nenhum (esses
// mudam/saem do ar o tempo todo) — a pessoa escolhe, dentro da busca,
// qual câmera ao vivo daquele país quer ver.
function youtubeSearchUrl(query: string): string {
  // sp=EgJAAQ%3D%3D é o filtro oficial do YouTube pra "Ao vivo" — sem
  // ele, a busca misturava vídeos gravados/antigos junto com as
  // transmissões de verdade, e um vídeo gravado que já terminou (ou é
  // só um trecho de áudio) dava a impressão de "câmera com defeito, só
  // sai som" quando na real só não era uma câmera ao vivo mesmo.
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgJAAQ%3D%3D`;
}

const COUNTRIES: { id: string; name: string; flag: string; url: string }[] = [
  { id: 'brazil', name: 'Brasil', flag: '🇧🇷', url: youtubeSearchUrl('câmera ao vivo Brasil live cam') },
  { id: 'usa', name: 'Estados Unidos', flag: '🇺🇸', url: youtubeSearchUrl('USA live cam 24/7') },
  { id: 'japan', name: 'Japão', flag: '🇯🇵', url: youtubeSearchUrl('Japan live cam 24/7') },
  { id: 'canada', name: 'Canadá', flag: '🇨🇦', url: youtubeSearchUrl('Canada live cam 24/7') },
  { id: 'spain', name: 'Espanha', flag: '🇪🇸', url: youtubeSearchUrl('Spain live cam 24/7') },
  { id: 'turkey', name: 'Turquia', flag: '🇹🇷', url: youtubeSearchUrl('Turkey live cam 24/7') },
  { id: 'thailand', name: 'Tailândia', flag: '🇹🇭', url: youtubeSearchUrl('Thailand live cam 24/7') },
  { id: 'singapore', name: 'Singapura', flag: '🇸🇬', url: youtubeSearchUrl('Singapore live cam 24/7') },
  { id: 'philippines', name: 'Filipinas', flag: '🇵🇭', url: youtubeSearchUrl('Philippines live cam 24/7') },
  { id: 'taiwan', name: 'Taiwan', flag: '🇹🇼', url: youtubeSearchUrl('Taiwan live cam 24/7') },
  { id: 'israel', name: 'Israel', flag: '🇮🇱', url: youtubeSearchUrl('Israel live cam 24/7') },
  { id: 'lebanon', name: 'Líbano', flag: '🇱🇧', url: youtubeSearchUrl('Lebanon live cam 24/7') },
  { id: 'iran', name: 'Irã', flag: '🇮🇷', url: youtubeSearchUrl('Iran live cam 24/7') },
  { id: 'palestine', name: 'Palestina', flag: '🇵🇸', url: youtubeSearchUrl('Palestine live cam 24/7') },
  { id: 'virgin-islands', name: 'Ilhas Virgens', flag: '🇻🇬', url: youtubeSearchUrl('Virgin Islands live cam 24/7') },
  { id: 'all', name: 'Ver todas', flag: '🌎', url: youtubeSearchUrl('live cam 24/7 world') },
];

export default function WorldCamerasScreen() {
  const router = useRouter();

  const openCountry = (name: string, url: string) => {
    router.push({ pathname: '/world-camera-view', params: { title: name, url } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="world-cameras-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Câmeras do Mundo</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.subtitle}>Escolha um país para ver as câmeras ao vivo</Text>

      <FlatList
        data={COUNTRIES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TVFocusable
            onPress={() => openCountry(item.name, item.url)}
            style={styles.card}
            testID={`world-country-${item.id}`}
          >
            <Text style={styles.flag}>{item.flag}</Text>
            <Text style={styles.countryName}>{item.name}</Text>
          </TVFocusable>
        )}
      />
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
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  grid: { padding: spacing.md, gap: spacing.sm },
  row: { gap: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  flag: { fontSize: 32 },
  countryName: { color: colors.white, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
