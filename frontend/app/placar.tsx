import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import TVFocusable from '@/src/components/TVFocusable';
import { getXtream } from '@/src/state/session';
import { xtream } from '@/src/lib/xtream';

// Esportes que a TheSportsDB (usada em "Jogos do dia") não cobre bem no
// tier gratuito, e por isso não têm um canal pra casar/assistir dentro do
// app — aqui é só placar/horário, sem botão de assistir. A ESPN é pública
// e não pede chave (https://site.api.espn.com), mas é uma API "escondida"
// (não-oficial): pode mudar sem aviso. Vôlei continua vindo da TheSportsDB
// mesmo (a ESPN não tem boa cobertura de vôlei), só que também sem canal.
const SPORTSDB_KEY = '123';

type SportDef = {
  key: string;
  label: string;
  source: 'espn' | 'sportsdb';
  espnPath?: string; // "{sport}/{league}" na URL da ESPN
  sportsdbSport?: string;
};

const SPORTS: SportDef[] = [
  { key: 'baseball', label: 'Beisebol', source: 'espn', espnPath: 'baseball/mlb' },
  { key: 'tennis', label: 'Tênis', source: 'espn', espnPath: 'tennis/atp' },
  { key: 'nfl', label: 'Futebol Americano', source: 'espn', espnPath: 'football/nfl' },
  { key: 'volleyball', label: 'Vôlei', source: 'sportsdb', sportsdbSport: 'Volleyball' },
  { key: 'mma', label: 'MMA', source: 'espn', espnPath: 'mma/ufc' },
  { key: 'basketball', label: 'Basquete (NBA)', source: 'espn', espnPath: 'basketball/nba' },
  { key: 'wnba', label: 'Basquete (WNBA)', source: 'espn', espnPath: 'basketball/wnba' },
  { key: 'hockey', label: 'Hóquei no Gelo', source: 'espn', espnPath: 'hockey/nhl' },
  { key: 'golf', label: 'Golfe', source: 'espn', espnPath: 'golf/pga' },
  { key: 'f1', label: 'Fórmula 1', source: 'espn', espnPath: 'racing/f1' },
  { key: 'nascar', label: 'Nascar', source: 'espn', espnPath: 'racing/nascar-premier' },
  { key: 'indycar', label: 'IndyCar', source: 'espn', espnPath: 'racing/irl' },
];
const DAYS_AHEAD = 4;

// Pra cada esporte daqui de cima, que palavra procurar nas categorias de
// canais AO VIVO do painel — se achar, mostra um botão "Assistir ao vivo"
// que leva direto pra essa categoria em Canais. Não tenta adivinhar QUAL
// canal exato passa QUAL jogo específico (isso seria arriscado e
// poderia levar pro canal errado) — só confirma que existe uma categoria
// de canais daquele esporte no painel da pessoa, e deixa ela escolher lá
// dentro.
const SPORT_CHANNEL_KEYWORDS: Record<string, string[]> = {
  baseball: ['beisebol', 'baseball', 'mlb'],
  tennis: ['tenis', 'tênis', 'tennis', 'atp', 'wta'],
  nfl: ['nfl', 'futebol americano'],
  volleyball: ['volei', 'vôlei', 'volleyball'],
  mma: ['mma', 'ufc', 'luta', 'boxe', 'boxing'],
  basketball: ['nba', 'basquete', 'basketball'],
  wnba: ['wnba'],
  hockey: ['nhl', 'hoquei', 'hóquei', 'hockey'],
  golf: ['golfe', 'golf'],
  f1: ['f1', 'formula 1', 'formula1'],
  nascar: ['nascar'],
  indycar: ['indycar', 'indy car'],
};

type ScoreEvent = {
  id: string;
  home: string;
  away: string;
  homeScore: string | null;
  awayScore: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  time: string | null; // "HH:mm"
  date: string; // "YYYY-MM-DD"
  status: string | null;
  broadcast?: string | null;
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

function normalizeEspnEvent(raw: any): ScoreEvent | null {
  const comp = raw?.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
  const iso = raw.date as string | undefined;
  const d = iso ? new Date(iso) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const started = comp.status?.type?.state !== 'pre';
  const broadcastNames: string[] = (comp.broadcasts || []).flatMap((b: any) => b.names || []);
  return {
    id: `espn-${raw.id}`,
    home: home?.team?.displayName || home?.athlete?.displayName || '—',
    away: away?.team?.displayName || away?.athlete?.displayName || '—',
    homeScore: started ? home?.score ?? null : null,
    awayScore: started ? away?.score ?? null : null,
    // Times (esportes coletivos) já vêm com o escudo pronto — esportes
    // individuais (tênis, golfe, MMA, corrida) não têm "team", só
    // "athlete", que não tem escudo, então fica null e a tela usa um
    // ícone genérico no lugar.
    homeLogo: home?.team?.logo || null,
    awayLogo: away?.team?.logo || null,
    time: d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : null,
    date: d ? isoDate(d) : isoDate(new Date()),
    status: comp.status?.type?.description ?? null,
    broadcast: broadcastNames.length ? broadcastNames.join(', ') : null,
  };
}

function normalizeSportsDbEvent(raw: any): ScoreEvent {
  return {
    id: String(raw.idEvent),
    home: raw.strHomeTeam || '—',
    away: raw.strAwayTeam || '—',
    homeScore: raw.intHomeScore ?? null,
    awayScore: raw.intAwayScore ?? null,
    time: raw.strTime ? raw.strTime.slice(0, 5) : null,
    date: raw.dateEvent,
    status: raw.strStatus || null,
  };
}

export default function PlacarScreen() {
  const router = useRouter();
  const [sport, setSport] = useState<string>('baseball');
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Categoria de canal AO VIVO do painel que bate com cada esporte (se
  // existir) — usado só pro botão "Assistir ao vivo" aparecer quando faz
  // sentido, nunca pra tentar casar um jogo específico com um canal.
  const [sportChannelCategory, setSportChannelCategory] = useState<Record<string, string>>({});

  useEffect(() => {
    const creds = getXtream();
    if (!creds) return;
    xtream.liveCategories(creds).then((cats) => {
      if (!cats) return;
      const found: Record<string, string> = {};
      for (const [sportKey, keywords] of Object.entries(SPORT_CHANNEL_KEYWORDS)) {
        const match = cats.find((c) => {
          const n = c.category_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return keywords.some((kw) => n.includes(kw));
        });
        if (match) found[sportKey] = match.category_name;
      }
      setSportChannelCategory(found);
    });
  }, []);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    const def = SPORTS.find((sp) => sp.key === s);
    if (!def) {
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => isoDate(new Date(Date.now() + i * 86400000)));
      let merged: ScoreEvent[] = [];

      if (def.source === 'espn') {
        const results = await Promise.all(
          dates.map(async (date) => {
            const yyyymmdd = date.replace(/-/g, '');
            try {
              const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${def.espnPath}/scoreboard?dates=${yyyymmdd}`);
              if (!res.ok) return [];
              const json = await res.json();
              const raw: any[] = json?.events || [];
              return raw.map(normalizeEspnEvent).filter((e): e is ScoreEvent => !!e);
            } catch {
              return [];
            }
          })
        );
        merged = results.flat();
      } else {
        const results = await Promise.all(
          dates.map(async (date) => {
            try {
              const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/eventsday.php?d=${date}&s=${encodeURIComponent(def.sportsdbSport!)}`;
              const res = await fetch(url);
              if (!res.ok) return [];
              const json = await res.json();
              const raw: any[] = json?.events || [];
              return raw.map((e) => normalizeSportsDbEvent({ ...e, dateEvent: e.dateEvent || date }));
            } catch {
              return [];
            }
          })
        );
        merged = results.flat();
      }

      setEvents(merged);
    } catch {
      setEvents([]);
      setError('Não foi possível carregar os placares agora.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(sport);
  }, [sport, load]);

  const grouped = useMemo(() => {
    const byDate: Record<string, ScoreEvent[]> = {};
    for (const e of events) {
      const key = e.date || 'sem-data';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(e);
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TVFocusable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="placar-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TVFocusable>
        <Text style={styles.headerTitle}>Placar</Text>
        {sportChannelCategory[sport] ? (
          <TVFocusable
            onPress={() =>
              router.push({ pathname: '/channels', params: { initialCategory: sportChannelCategory[sport] } })
            }
            style={styles.watchBtn}
            testID="placar-watch-live"
          >
            <Ionicons name="play-circle" size={16} color={colors.black} />
            <Text style={styles.watchBtnText}>Assistir</Text>
          </TVFocusable>
        ) : (
          <View style={{ width: 24 }} />
        )}
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
                testID={`placar-chip-${s.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </TVFocusable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentCyan} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum jogo encontrado nos próximos dias.</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([date]) => date}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          renderItem={({ item: [date, dayEvents] }) => (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.dayLabel}>{dayLabel(date)}</Text>
              {dayEvents.map((e) => {
                const started = e.homeScore != null || e.awayScore != null;
                return (
                  <View key={e.id} style={styles.card}>
                    <View style={styles.teamsCol}>
                      <View style={styles.teamRow}>
                        {e.homeLogo ? (
                          <Image source={{ uri: e.homeLogo }} style={styles.teamLogo} contentFit="contain" />
                        ) : (
                          <View style={styles.teamLogoFallback}>
                            <Ionicons name="person" size={12} color={colors.textMuted} />
                          </View>
                        )}
                        <Text style={styles.teamName} numberOfLines={1}>{e.home}</Text>
                      </View>
                      <View style={styles.teamRow}>
                        {e.awayLogo ? (
                          <Image source={{ uri: e.awayLogo }} style={styles.teamLogo} contentFit="contain" />
                        ) : (
                          <View style={styles.teamLogoFallback}>
                            <Ionicons name="person" size={12} color={colors.textMuted} />
                          </View>
                        )}
                        <Text style={styles.teamName} numberOfLines={1}>{e.away}</Text>
                      </View>
                    </View>
                    <View style={styles.scoreCol}>
                      {started ? (
                        <>
                          <Text style={styles.scoreText}>{e.homeScore ?? '-'}</Text>
                          <Text style={styles.scoreText}>{e.awayScore ?? '-'}</Text>
                        </>
                      ) : (
                        <Text style={styles.timeText}>{e.time || '--:--'}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  watchBtnText: { color: colors.black, fontSize: 12, fontWeight: '800' },
  chipRow: { paddingBottom: spacing.sm },
  chipRowInner: { paddingHorizontal: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.darkSurface,
  },
  chipActive: { backgroundColor: colors.accentCyan },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  dayLabel: { color: colors.accentCyan, fontSize: 12, fontWeight: '800', marginBottom: spacing.sm, letterSpacing: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  teamsCol: { flex: 1, gap: 6 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamLogo: { width: 22, height: 22 },
  teamLogoFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.darkSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamName: { color: colors.white, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  scoreCol: { alignItems: 'flex-end', gap: 4 },
  scoreText: { color: colors.accentCyan, fontSize: 16, fontWeight: '800' },
  timeText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
});
