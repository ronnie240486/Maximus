import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import { getXtream } from '@/src/state/session';
import { xtream, XtreamLive, liveStreamUrl } from '@/src/lib/xtream';
import {
  loadGameReminders,
  toggleGameReminder,
  popDueReminders,
} from '@/src/state/game-reminders';
import TVFocusable from '@/src/components/TVFocusable';

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Categorias do painel que costumam ter os jogos do dia — bem mais amplo
 * que só "jogo"/"esporte" pra pegar categorias tipo "NBA" ou "F1" mesmo
 * quando nomeadas só pelo esporte, sem a palavra "jogos" no meio. */
const SPORT_CATEGORY_KEYWORDS = [
  'jogo',
  'esporte',
  'sport',
  'game',
  'nba',
  'nfl',
  'nhl',
  'mlb',
  'basquete',
  'basketball',
  'futebol americano',
  'volei',
  'vôlei',
  'volleyball',
  'mma',
  'ufc',
  'formula 1',
  'formula1',
  ' f1 ',
  'nascar',
  'automobilismo',
  'motorsport',
  'luta',
  'boxe',
  'boxing',
];

/** Muitos painéis nomeiam os canais de "jogos do dia" como "[15:45] Time A x
 * Time B" — separa o horário (se tiver) do resto do nome. Nunca quebra,
 * só perde a formatação bonitinha se o canal não seguir esse padrão. */
function parseGameChannelName(name: string): { time: string | null; rest: string } {
  const match = name.match(/^\[?(\d{1,2}:\d{2})\]?\s*[-–—]?\s*(.*)$/);
  if (match && match[2]) {
    return { time: match[1], rest: match[2] };
  }
  return { time: null, rest: name };
}

/** Tenta separar "Time A x Time B" / "Time A vs Time B" em duas partes,
 * pra mostrar empilhado (igual Placar). Se não der pra separar, devolve
 * só a primeira parte com a segunda vazia. */
function splitTeams(rest: string): [string, string] {
  const m = rest.split(/\s+(?:x|vs\.?)\s+/i);
  if (m.length === 2) return [m[0].trim(), m[1].trim()];
  return [rest.trim(), ''];
}

/** Detecta o esporte pelo nome do canal e devolve um ícone + cor — o
 * painel só fornece o mesmo ícone genérico "JOGOS" pra todos os canais
 * dessa categoria (sem brasão de time de verdade), e uma busca de time
 * real na TheSportsDB não é confiável no plano grátis (só funciona pra
 * um time de exemplo fixo). Isso é o que dá pra fazer de forma
 * consistente sem depender de API externa nenhuma. */
function detectSportVisual(channelName: string): { icon: string; color: string } {
  const n = normalizeText(channelName);
  if (/(nba|basquete|basketball)/.test(n)) return { icon: 'basketball', color: '#F97316' };
  if (/(nfl|futebol americano|super bowl)/.test(n)) return { icon: 'football', color: '#8B5CF6' };
  if (/(f1|formula ?1|nascar|automobilismo|motorsport|corrida)/.test(n)) return { icon: 'flag-checkered', color: '#EF4444' };
  if (/(ufc|mma|boxe|boxing|luta)/.test(n)) return { icon: 'boxing-glove', color: '#DC2626' };
  if (/(volei|volleyball|nbb|handebol)/.test(n)) return { icon: 'volleyball', color: '#3B82F6' };
  if (/(nhl|hoquei|hockey)/.test(n)) return { icon: 'hockey-sticks', color: '#06B6D4' };
  return { icon: 'soccer', color: '#22C55E' };
}

/** Constrói um epoch de hoje na hora "HH:MM" — os canais de "jogos do dia"
 * do painel são sempre do dia de hoje (é o que o nome da categoria já
 * diz), então não tem data separada pra extrair, só o horário. */
function todayAtTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export default function GamesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sportsCategory, setSportsCategory] = useState<string | null>(null);
  const [sportsChannels, setSportsChannels] = useState<XtreamLive[]>([]);
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const creds = getXtream();
    if (!creds) {
      setLoading(false);
      return;
    }
    try {
      const cats = await xtream.liveCategories(creds);
      // Junta canais de TODAS as categorias que parecerem esporte — antes
      // pegava só a primeira, então uma categoria separada tipo "NBA"
      // (além de "Canais | Jogos do Dia") nunca aparecia.
      const matches = (cats || []).filter((c) => {
        const n = normalizeText(c.category_name);
        return SPORT_CATEGORY_KEYWORDS.some((kw) => n.includes(kw));
      });
      if (matches.length === 0) {
        setSportsCategory(null);
        setSportsChannels([]);
        setLoading(false);
        return;
      }
      setSportsCategory(matches.length === 1 ? matches[0].category_name : `${matches.length} categorias`);
      const perCategory = await Promise.all(
        matches.map((c) => xtream.liveStreams(creds, c.category_id).catch(() => null))
      );
      const combined: XtreamLive[] = [];
      const seenIds = new Set<number>();
      for (const list of perCategory) {
        for (const ch of list || []) {
          if (!seenIds.has(ch.stream_id)) {
            seenIds.add(ch.stream_id);
            combined.push(ch);
          }
        }
      }
      setSportsChannels(combined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadGameReminders().then((list) => setScheduledIds(new Set(list.map((r) => r.id))));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      popDueReminders().then((due) => {
        if (cancelled || due.length === 0) return;
        const first = due[0];
        Alert.alert(
          'Começando agora',
          due.length === 1 ? first.name : `${first.name} e mais ${due.length - 1} jogo(s) começando agora.`
        );
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const openGameChannel = (s: XtreamLive) => {
    const creds = getXtream();
    if (!creds) return;
    router.push({
      pathname: '/player',
      params: {
        id: `live-${s.stream_id}`,
        name: s.name,
        stream: liveStreamUrl(creds, s.stream_id, 'm3u8'),
        logo: s.stream_icon || '',
      },
    });
  };

  const onToggleReminder = async (ch: XtreamLive) => {
    const { time, rest } = parseGameChannelName(ch.name);
    const id = `panel-${ch.stream_id}`;
    const nowScheduled = await toggleGameReminder({
      id,
      name: rest,
      startsAt: time ? todayAtTime(time) : Date.now(),
    });
    setScheduledIds((prev) => {
      const next = new Set(prev);
      if (nowScheduled) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const sorted = useMemo(() => {
    return [...sportsChannels].sort((a, b) => {
      const ta = parseGameChannelName(a.name).time;
      const tb = parseGameChannelName(b.name).time;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
  }, [sportsChannels]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TVFocusable onPress={() => router.back()} style={styles.backBtn} testID="games-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TVFocusable>
        <Text style={styles.headerTitle}>Jogos do Dia</Text>
        <View style={{ width: 24 }} />
      </View>

      {sportsCategory && (
        <Text style={styles.subtitle} numberOfLines={1}>
          Direto do seu painel: {sportsCategory}
        </Text>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentCyan} size="large" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="football-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Seu painel não tem uma categoria de jogos do dia configurada — nada pra mostrar aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(ch) => String(ch.stream_id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          renderItem={({ item: ch }) => {
            const { time, rest } = parseGameChannelName(ch.name);
            const [teamA, teamB] = splitTeams(rest);
            const visual = detectSportVisual(ch.name);
            const reminderId = `panel-${ch.stream_id}`;
            const scheduled = scheduledIds.has(reminderId);
            return (
              <TVFocusable
                onPress={() => openGameChannel(ch)}
                style={styles.row}
                testID={`games-row-${ch.stream_id}`}
              >
                <View style={[styles.sportBadge, { backgroundColor: visual.color }]}>
                  <MaterialCommunityIcons name={visual.icon as any} size={18} color={colors.white} />
                </View>

                <View style={styles.teamsCol}>
                  <Text style={styles.teamName} numberOfLines={1}>{teamA}</Text>
                  {!!teamB && <Text style={styles.teamName} numberOfLines={1}>{teamB}</Text>}
                </View>

                <Text style={styles.timeText}>{time || '--:--'}</Text>

                <TVFocusable
                  onPress={() => onToggleReminder(ch)}
                  style={styles.bellBtn}
                  testID={`games-reminder-${ch.stream_id}`}
                  hitSlop={10}
                >
                  <Ionicons
                    name={scheduled ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={scheduled ? colors.accentCyan : colors.textMuted}
                  />
                </TVFocusable>
              </TVFocusable>
            );
          }}
        />
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
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  sportBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamsCol: { flex: 1, gap: 4 },
  teamName: { color: colors.white, fontSize: 14, fontWeight: '700' },
  timeText: { color: colors.accentCyan, fontSize: 14, fontWeight: '800' },
  bellBtn: { padding: 6 },
});
