import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { colors, spacing } from '@/src/theme';
import { getDeviceMac } from '@/src/lib/device';
import { checkMac, MacStatus, proxied } from '@/src/api/client';
import { parsePlaylistUrl } from '@/src/lib/xtream';

const BACKEND = 'https://renciaapp.manus.space/api/v5';

// Esconde usuário/senha (do Xtream do cliente) de qualquer texto antes de
// mostrar ou copiar na tela — tanto em URLs (?username=...&password=...)
// quanto em corpos de resposta JSON ("username":"...","password":"...").
function redact(text: string): string {
  return text
    .replace(/([?&](?:user(?:name)?|pass(?:word)?)=)[^&\s"'<]+/gi, '$1***')
    .replace(/("(?:username|user|password|pass)"\s*:\s*")[^"]*(")/gi, '$1***$2');
}

type Result = {
  url: string;
  status: 'ok' | 'error' | 'pending';
  ms: number;
  http?: number;
  contentType?: string;
  bodyPreview?: string;
  error?: string;
};

export default function BackendDiagScreen() {
  const router = useRouter();
  const [mac, setMac] = useState('');
  const [status, setStatus] = useState<MacStatus | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const timedFetch = async (url: string): Promise<Result> => {
    const t0 = Date.now();
    try {
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      const text = await res.text();
      return {
        url: redact(url),
        status: res.ok ? 'ok' : 'error',
        ms: Date.now() - t0,
        http: res.status,
        contentType: ct,
        bodyPreview: redact(text.slice(0, 3000)),
      };
    } catch (e: any) {
      return {
        url: redact(url),
        status: 'error',
        ms: Date.now() - t0,
        error: e?.message || String(e),
      };
    }
  };

  const run = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const m = await getDeviceMac();
    setMac(m);
    const checkMacUpstream = `${BACKEND}/check_mac.php?mac=${encodeURIComponent(m)}`;
    const r1 = await timedFetch(proxied(checkMacUpstream));
    setResults((prev) => [...prev, r1]);

    const s = await checkMac(m);
    setStatus(s);

    // If we got playlists, ping the Xtream server too.
    const playlistUrl = s.playlists?.[0]?.url;
    if (playlistUrl) {
      const creds = parsePlaylistUrl(playlistUrl);
      if (creds) {
        const xtreamUpstream = `${creds.server}/player_api.php?username=${creds.username}&password=${creds.password}`;
        const r2 = await timedFetch(proxied(xtreamUpstream));
        setResults((prev) => [...prev, r2]);

        const catsUpstream = `${creds.server}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_categories`;
        const r3 = await timedFetch(proxied(catsUpstream));
        setResults((prev) => [...prev, r3]);
      }
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const copy = async (s: string) => {
    await Clipboard.setStringAsync(s);
    Alert.alert('Copiado', 'Agora é só colar (segurar e escolher "Colar") onde você quiser enviar.');
  };

  // Overall summary: green only if every request succeeded AND the panel
  // authorized this device. Anything else surfaces as a clear error message
  // instead of making the person read the raw request list to figure it out.
  const failed = results.filter((r) => r.status === 'error');
  const allOk = !running && results.length > 0 && failed.length === 0 && !!status?.authorized;
  const summaryError = running
    ? null
    : failed.length > 0
    ? failed[0].error || `Falha ao conectar (HTTP ${failed[0].http ?? '—'}).`
    : status && !status.authorized
    ? status.message || 'MAC não autorizado no painel.'
    : results.length === 0
    ? 'Nenhum teste rodou ainda.'
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn} testID="diag-back">
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Diagnóstico</Text>
        <Pressable onPress={run} hitSlop={16} disabled={running} testID="diag-refresh">
          <Ionicons name="refresh" size={22} color={running ? colors.textMuted : colors.accentCyan} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
        {running ? (
          <View style={[styles.summary, styles.summaryPending]}>
            <ActivityIndicator color={colors.textSecondary} size="small" />
            <Text style={styles.summaryText}>Testando conexão...</Text>
          </View>
        ) : (
          <View style={[styles.summary, allOk ? styles.summaryOk : styles.summaryError]}>
            <Ionicons
              name={allOk ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={allOk ? colors.accentCyan : colors.danger}
            />
            <Text style={[styles.summaryText, { color: allOk ? colors.accentCyan : colors.danger }]}>
              {allOk ? 'Tudo funcionando' : summaryError}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>MAC ENVIADO</Text>
          <Pressable onPress={() => copy(mac)}>
            <Text style={styles.value}>{mac || '—'}</Text>
          </Pressable>
        </View>

        {status && (
          <View style={styles.card}>
            <Text style={styles.label}>RESPOSTA DO CHECK_MAC</Text>
            <Row k="Autorizado" v={status.authorized ? 'SIM' : 'NÃO'} accent={status.authorized} />
            <Row k="Registrado" v={status.registered ? 'SIM' : 'NÃO'} accent={status.registered} />
            {!!status.status && <Row k="Status" v={status.status} />}
            {!!status.expire_date && <Row k="Expira" v={status.expire_date} />}
            {!!status.app_name && <Row k="App" v={status.app_name} />}
            {!!status.version && <Row k="Versão" v={status.version} />}
            <Row k="Logo" v={status.logo_url ? 'SIM' : 'não veio'} accent={!!status.logo_url} />
            <Row k="Fundo" v={status.bg_url ? 'SIM' : 'não veio'} accent={!!status.bg_url} />
            <Row k="Banner" v={status.banner_url ? 'SIM' : 'não veio'} accent={!!status.banner_url} />
            {!!status.reseller_contact && <Row k="Revendedor" v={status.reseller_contact} />}
            {!!status.playlists?.length && (
              <Row k="Playlists" v={`${status.playlists.length} lista(s) — dados ocultos`} />
            )}
            {!!status.message && <Row k="Msg" v={status.message} />}
          </View>
        )}

        <Text style={styles.sectionTitle}>REQUISIÇÕES</Text>
        {running && (
          <View style={styles.pending}>
            <ActivityIndicator color={colors.accentCyan} size="small" />
            <Text style={styles.pendingText}>Testando endpoints...</Text>
          </View>
        )}
        {results.map((r, i) => (
          <View key={i} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <Ionicons
                name={r.status === 'ok' ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={r.status === 'ok' ? colors.accentCyan : colors.danger}
              />
              <Text
                style={[
                  styles.reqStatus,
                  { color: r.status === 'ok' ? colors.accentCyan : colors.danger },
                ]}
              >
                {r.http ? `${r.http}` : 'ERR'} • {r.ms}ms
              </Text>
              {!!r.contentType && (
                <Text style={styles.reqType} numberOfLines={1}>
                  {r.contentType.split(';')[0]}
                </Text>
              )}
            </View>
            <Pressable onPress={() => copy(r.url)}>
              <Text style={styles.reqUrl} numberOfLines={2}>{r.url}</Text>
            </Pressable>
            {!!r.error && <Text style={styles.reqError}>{r.error}</Text>}
            {!!r.bodyPreview && (
              <>
                <Pressable onPress={() => copy(r.bodyPreview!)} style={styles.copyBodyBtn} testID={`diag-copy-body-${i}`}>
                  <Ionicons name="copy-outline" size={13} color={colors.accentCyan} />
                  <Text style={styles.copyBodyText}>Copiar resposta completa</Text>
                </Pressable>
                <Text style={styles.reqBody} selectable>
                  {r.bodyPreview}
                </Text>
              </>
            )}
          </View>
        ))}

        <View style={styles.hint}>
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.hintText}>
            No navegador (preview), o próprio site pode bloquear essas respostas mesmo com o
            servidor funcionando normalmente. Isso NÃO acontece no APK/Expo Go — teste no
            celular pra ver o resultado real.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={[styles.rowV, accent && { color: colors.accentCyan }]} numberOfLines={1}>
        {v}
      </Text>
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
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  summaryPending: { backgroundColor: colors.darkSurface, borderColor: colors.darkSurfaceAlt },
  summaryOk: { backgroundColor: 'rgba(76,232,240,0.10)', borderColor: colors.accentCyan },
  summaryError: { backgroundColor: 'rgba(240,76,76,0.10)', borderColor: colors.danger },
  summaryText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: colors.darkSurface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    gap: 6,
  },
  label: { color: colors.textMuted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  value: { color: colors.accentCyan, fontSize: 13, fontWeight: '700' },
  mono: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  rowK: { color: colors.textMuted, fontSize: 12 },
  rowV: { color: colors.white, fontSize: 12, fontWeight: '700', maxWidth: '60%' },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  pendingText: { color: colors.textSecondary, fontSize: 12 },
  reqCard: {
    backgroundColor: colors.darkSurface,
    padding: spacing.sm,
    borderRadius: 10,
    marginBottom: spacing.sm,
    gap: 4,
  },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqStatus: { fontSize: 11, fontWeight: '800' },
  reqType: { color: colors.textMuted, fontSize: 10, flex: 1 },
  reqUrl: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  reqError: { color: colors.danger, fontSize: 11, marginTop: 4 },
  copyBodyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(76,232,240,0.10)',
  },
  copyBodyText: { color: colors.accentCyan, fontSize: 10, fontWeight: '700' },
  reqBody: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  hint: {
    flexDirection: 'row',
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.darkSurfaceAlt,
    borderRadius: 10,
    marginTop: spacing.sm,
  },
  hintText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
});
