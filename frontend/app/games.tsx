import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
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
  GameReminder,
} from '@/src/state/game-reminders';
import TVFocusable from '@/src/components/TVFocusable';

// TheSportsDB's shared free demo key — documented as the public, no-signup
// key for the free tier (https://www.thesportsdb.com/documentation). Limited
// results on the free tier, but no account/credentials needed from the person
// using the app.
const SPORTSDB_KEY = '123';

type SportDef = {
  key: string;
  label: string;
  sportsdbSport: string; // valor do parâmetro `s` na TheSportsDB
};

// Esportes com jogo casado a um canal de TV (por isso ficam aqui, junto
// com o botão de assistir e o lembrete) — os que não têm canal (beisebol,
// tênis, vôlei, MMA) ficam na tela separada "Placar".
const SPORTS: SportDef[] = [
  { key: 'soccer', label: 'Futebol', sportsdbSport: 'Soccer' },
  { key: 'basketball', label: 'Basquete', sportsdbSport: 'Basketball' },
  { key: 'nfl', label: 'Futebol Americano', sportsdbSport: 'American_Football' },
  { key: 'motorsport', label: 'Automobilismo', sportsdbSport: 'Motorsport' },
  { key: 'fighting', label: 'Lutas', sportsdbSport: 'Fighting' },
];
const DAYS_AHEAD = 4; // today + next 3 days — keeps free-tier calls reasonable

type GameEvent = {
  idEvent: string;
  strEvent: string;
  strLeague?: string;
  strLeagueBadge?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  strTime?: string;
  dateEvent?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string | null;
  strSport?: string;
};

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(dateStr: string): string {
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'HOJE';
  if (dateStr === tomorrow) return 'AMANHÃ';
  const d = new Date(`${dateStr}T00:00:00`);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return `${weekday.toUpperCase()} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Best-effort epoch for a game's kickoff — TheSportsDB times are documented as UTC. */
function eventEpoch(e: GameEvent): number | null {
  if (!e.dateEvent) return null;
  const time = e.strTime || '00:00:00';
  const t = Date.parse(`${e.dateEvent}T${time}Z`);
  return isNaN(t) ? null : t;
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Best-effort match of "which channel could plausibly show this game" — the
 * free sports API returns games from leagues/countries the person's actual
 * channel lineup has no coverage for, which is just noise. We don't have a
 * real game→channel mapping, so this compares significant words from the
 * league name and both team names against the channel names in the
 * person's sports category, and returns the first channel that overlaps.
 */
function findMatchingChannel(e: GameEvent, channels: XtreamLive[]): XtreamLive | undefined {
  const words = [e.strLeague, e.strHomeTeam, e.strAwayTeam]
    .filter(Boolean)
    .flatMap((s) => normalizeText(s as string).split(/\s+/))
    .filter((w) => w.length >= 4);
  if (words.length === 0) return undefined;
  return channels.find((c) => {
    const n = normalizeText(c.name);
    return words.some((w) => n.includes(w));
  });
}

/** Muitos painéis nomeiam os canais de "jogos do dia" como "[15:45] Time A x
 * Time B" — separa o horário (se tiver) do resto do nome, pra exibir de
 * forma mais organizada. Se o canal não seguir esse padrão, devolve o nome
 * inteiro como "resto" e nenhum horário — nunca quebra, só perde a
 * formatação bonitinha. */
function parseGameChannelName(name: string): { time: string | null; rest: string } {
  const match = name.match(/^\[?(\d{1,2}:\d{2})\]?\s*[-–—]?\s*(.*)$/);
  if (match && match[2]) {
    return { time: match[1], rest: match[2] };
  }
  return { time: null, rest: name };
}

export default function GamesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rawEvents, setRawEvents] = useState<GameEvent[]>([]);
  const [sport, setSport] = useState<string>('soccer');
  const [error, setError] = useState<string | null>(null);
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());
  // Looked up once from the person's own channel categories — if their panel
  // has a folder like "Jogos do dia" / "Esportes" / "Sports", "Assistir"
  // jumps straight into it instead of a generic name search.
  const [sportsCategory, setSportsCategory] = useState<string | null>(null);
  // Canais dentro dessa categoria — guardamos o objeto completo (não só o
  // nome) porque agora "Assistir" pode abrir direto no canal certo, em vez
  // de só filtrar a lista.
  const [sportsChannels, setSportsChannels] = useState<XtreamLive[]>([]);
  // Só true depois que já sabemos se existe (ou não) uma categoria de
  // esportes no painel — antes disso não mostramos nenhum jogo, pra evitar
  // o efeito de "aparece um monte e depois alguns somem" quando o filtro
  // chega atrasado.
  const [sportsResolved, setSportsResolved] = useState(false);

  const normalize = normalizeText;

  useEffect(() => {
    const creds = getXtream();
    if (!creds) {
      setSportsResolved(true);
      return;
    }
    xtream.liveCategories(creds).then(async (cats) => {
      const match = cats?.find((c) => {
        const n = normalize(c.category_name);
        return n.includes('jogo') || n.includes('esporte') || n.includes('sport') || n.includes('game');
      });
      if (!match) {
        setSportsResolved(true);
        return;
      }
      setSportsCategory(match.category_name);
      const channels = await xtream.liveStreams(creds, match.category_id);
      if (channels) setSportsChannels(channels);
      setSportsResolved(true);
    });
  }, []);

  // Busca os jogos UMA vez por esporte selecionado — antes isso dependia
  // de sportsChannels também, então assim que a lista de canais chegava
  // (podia ser alguns segundos depois), a tela toda recarregava de novo e
  // "piscava" trocando os jogos na cara da pessoa. Agora busca só uma vez;
  // o filtro por canal é aplicado depois, silenciosamente, sem re-buscar.
  const load = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    const def = SPORTS.find((sp) => sp.key === s);
    if (!def) {
      setRawEvents([]);
      setLoading(false);
      return;
    }
    try {
      const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => isoDate(new Date(Date.now() + i * 86400000)));
      const results = await Promise.all(
        dates.map(async (date) => {
          const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/eventsday.php?d=${date}&s=${encodeURIComponent(def.sportsdbSport)}`;
          const res = await fetch(url);
          if (!res.ok) return [];
          const json = await res.json();
          const list: GameEvent[] = json?.events || [];
          return list.map((e) => ({ ...e, dateEvent: e.dateEvent || date }));
        })
      );
      const merged = results
        .flat()
        .filter((e) => e.intHomeScore == null && e.intAwayScore == null)
        .sort((a, b) => (eventEpoch(a) || 0) - (eventEpoch(b) || 0));
      setRawEvents(merged);
    } catch (e) {
      setRawEvents([]);
      setError('Não foi possível carregar os jogos agora. Verifique sua conexão.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(sport);
  }, [load, sport]);

  // Filtro por canal disponível — recalcula só a lista exibida, sem tocar
  // no loading nem refazer a busca na API.
  // Só mostra jogo que a gente encontrou canal correspondente — mas só
  // depois que a checagem de canais (sportsResolved) já terminou, senão
  // mostraria tudo sem filtro por um instante e depois encolheria de
  // repente quando o filtro chegasse (foi isso que parecia jogos "sumindo").
  const events = useMemo(() => {
    if (sportsChannels.length === 0) return rawEvents;
    return rawEvents.filter((e) => !!findMatchingChannel(e, sportsChannels));
  }, [rawEvents, sportsChannels]);

  const showLoading = loading || !sportsResolved;

  useFocusEffect(
    React.useCallback(() => {
      loadGameReminders().then((list) => setScheduledIds(new Set(list.map((r) => r.id))));
      popDueReminders().then((due) => {
        due.forEach((r) => {
          Alert.alert(
            'Hora do jogo!',
            `${r.name} está começando agora. Quer abrir a lista de canais pra encontrar a transmissão?`,
            [
              { text: 'Agora não', style: 'cancel' },
              { text: 'Abrir canais', onPress: () => router.push({ pathname: '/channels', params: sportsCategory ? { initialCategory: sportsCategory } : { initialQuery: r.league || '' } }) },
            ]
          );
        });
      });
    }, [router])
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

  const onToggleReminder = async (event: GameEvent) => {
    const epoch = eventEpoch(event);
    if (!epoch) return;
    const nowScheduled = await toggleGameReminder({
      id: event.idEvent,
      name: event.strEvent || `${event.strHomeTeam} vs ${event.strAwayTeam}`,
      league: event.strLeague,
      startsAt: epoch,
    });
    setScheduledIds((prev) => {
      const next = new Set(prev);
      if (nowScheduled) next.add(event.idEvent);
      else next.delete(event.idEvent);
      return next;
    });
    Alert.alert(
      nowScheduled ? 'Jogo agendado' : 'Lembrete removido',
      nowScheduled
        ? 'Vamos te avisar quando o jogo estiver começando (com o app aberto).'
        : undefined
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="games-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Jogos</Text>
        <Pressable onPress={() => load(sport)} hitSlop={16} testID="games-refresh">
          <Ionicons name="refresh" size={22} color={colors.accentCyan} />
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowInner}>
          {SPORTS.map((s) => {
            const active = s.key === sport;
            return (
              <TVFocusable
                key={s.key}
                onPress={() => setSport(s.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`games-chip-${s.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </TVFocusable>
            );
          })}
        </ScrollView>
      </View>

      {sportsResolved && sportsChannels.length > 0 && (
        <View style={styles.panelGamesSection}>
          <Text style={styles.panelGamesTitle}>
            {sportsCategory ? `No seu painel: ${sportsCategory}` : 'Jogos do seu painel'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelGamesRow}>
            {sportsChannels.map((ch) => {
              const { time, rest } = parseGameChannelName(ch.name);
              return (
                <TVFocusable
                  key={ch.stream_id}
                  onPress={() => openGameChannel(ch)}
                  style={styles.panelGameCard}
                  testID={`games-panel-channel-${ch.stream_id}`}
                >
                  <View style={styles.panelGameThumb}>
                    {ch.stream_icon ? (
                      <Image source={{ uri: ch.stream_icon }} style={styles.panelGameThumbImg} contentFit="contain" />
                    ) : (
                      <Ionicons name="football" size={22} color={colors.textMuted} />
                    )}
                  </View>
                  {!!time && <Text style={styles.panelGameTime}>{time}</Text>}
                  <Text style={styles.panelGameName} numberOfLines={2}>{rest}</Text>
                </TVFocusable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentCyan} />
        </View>
      ) : error ? (
        <View style={styles.center} testID="games-error">
          <MaterialCommunityIcons name="wifi-off" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{error}</Text>
          <Pressable onPress={() => load(sport)} style={styles.retryBtn}>
            <Ionicons name="refresh" size={14} color={colors.accentCyan} />
            <Text style={styles.retryText}>TENTAR NOVAMENTE</Text>
          </Pressable>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center} testID="games-empty">
          <MaterialCommunityIcons name="soccer-field" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhum jogo com canal disponível agora</Text>
          <Text style={styles.emptySub}>Tenta outra modalidade acima ou confere de novo mais tarde.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.idEvent}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => {
            const match = findMatchingChannel(item, sportsChannels);
            return (
              <GameRow
                event={item}
                scheduled={scheduledIds.has(item.idEvent)}
                onWatch={() => {
                  if (match) {
                    router.push({
                      pathname: '/channel-details',
                      params: {
                        id: String(match.stream_id),
                        name: match.name,
                        cover: match.stream_icon || '',
                        categoryName: sportsCategory || '',
                      },
                    });
                  } else {
                    router.push({
                      pathname: '/channels',
                      params: sportsCategory
                        ? { initialCategory: sportsCategory }
                        : { initialQuery: item.strLeague || '' },
                    });
                  }
                }}
                onToggleReminder={() => onToggleReminder(item)}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function GameRow({
  event,
  scheduled,
  onWatch,
  onToggleReminder,
}: {
  event: GameEvent;
  scheduled: boolean;
  onWatch: () => void;
  onToggleReminder: () => void;
}) {
  const hasScore = event.intHomeScore != null && event.intAwayScore != null;
  return (
    <View style={styles.gameCard} testID={`game-${event.idEvent}`}>
      <View style={styles.leagueRow}>
        {!!event.strLeagueBadge && (
          <Image source={{ uri: event.strLeagueBadge }} style={styles.leagueBadge} contentFit="contain" />
        )}
        <Text style={styles.leagueName} numberOfLines={1}>{event.strLeague || 'Jogo'}</Text>
        <Text style={styles.dayText}>{event.dateEvent ? dayLabel(event.dateEvent) : ''}</Text>
        <Text style={styles.timeText}>{event.strTime?.slice(0, 5) || '--:--'}</Text>
      </View>
      <View style={styles.teamsRow}>
        <TeamBlock name={event.strHomeTeam} badge={event.strHomeTeamBadge} />
        <View style={styles.scoreBlock}>
          {hasScore ? (
            <Text style={styles.scoreText}>{event.intHomeScore} - {event.intAwayScore}</Text>
          ) : (
            <Text style={styles.vsText}>VS</Text>
          )}
        </View>
        <TeamBlock name={event.strAwayTeam} badge={event.strAwayTeamBadge} align="right" />
      </View>
      <View style={styles.actionsRow}>
        <TVFocusable onPress={onWatch} style={styles.watchBtn} testID={`game-watch-${event.idEvent}`}>
          <Ionicons name="play" size={13} color={colors.black} />
          <Text style={styles.watchText}>ASSISTIR</Text>
        </TVFocusable>
        <TVFocusable onPress={onToggleReminder} style={styles.scheduleBtn} testID={`game-schedule-${event.idEvent}`}>
          <Ionicons name={scheduled ? 'notifications' : 'notifications-outline'} size={15} color={scheduled ? colors.accentCyan : colors.textSecondary} />
          <Text style={[styles.scheduleText, scheduled && { color: colors.accentCyan }]}>
            {scheduled ? 'AGENDADO' : 'AGENDAR'}
          </Text>
        </TVFocusable>
      </View>
    </View>
  );
}

function TeamBlock({ name, badge, align }: { name?: string; badge?: string; align?: 'right' }) {
  return (
    <View style={[styles.teamBlock, align === 'right' && { alignItems: 'flex-end' }]}>
      <View style={styles.teamBadgeWrap}>
        {badge ? (
          <Image source={{ uri: badge }} style={styles.teamBadge} contentFit="contain" />
        ) : (
          <Ionicons name="shield-outline" size={20} color={colors.textMuted} />
        )}
      </View>
      <Text style={styles.teamName} numberOfLines={2}>{name || '—'}</Text>
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
  chipRow: { height: 56, justifyContent: 'center' },
  chipRowInner: { gap: 8, paddingHorizontal: spacing.md, alignItems: 'center' },
  panelGamesSection: { paddingBottom: spacing.sm },
  panelGamesTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    marginBottom: 8,
  },
  panelGamesRow: { gap: 10, paddingHorizontal: spacing.md },
  panelGameCard: { width: 100 },
  panelGameThumb: {
    width: 100,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  panelGameThumbImg: { width: '80%', height: '80%' },
  panelGameTime: { color: colors.accentCyan, fontSize: 11, fontWeight: '800', marginTop: 4 },
  panelGameName: { color: colors.white, fontSize: 11, fontWeight: '600', marginTop: 2 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.darkSurfaceAlt,
    flexShrink: 0,
  },
  chipActive: { borderColor: colors.accentCyan, backgroundColor: 'rgba(76,232,240,0.10)' },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.accentCyan },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },
  emptyTitle: { color: colors.white, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
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
  gameCard: {
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leagueBadge: { width: 16, height: 16 },
  leagueName: { flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  channelBadgeText: { color: colors.black, fontSize: 8, fontWeight: '900' },
  dayText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginRight: 8 },
  timeText: { color: colors.accentCyan, fontSize: 11, fontWeight: '800' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamBlock: { flex: 1, alignItems: 'flex-start', gap: 6 },
  teamBadgeWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  teamBadge: { width: '100%', height: '100%' },
  teamName: { color: colors.white, fontSize: 12, fontWeight: '700', maxWidth: 100 },
  scoreBlock: { paddingHorizontal: spacing.sm, alignItems: 'center' },
  scoreText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  vsText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  watchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.accentCyan,
    borderRadius: 8,
    paddingVertical: 8,
  },
  watchText: { color: colors.black, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scheduleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.darkSurfaceAlt,
  },
  scheduleText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
