import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import { getDeviceMac } from '@/src/lib/device';
import { loadProfiles, Profile } from '@/src/state/profiles';
import { loadSession, saveSession, clearSession } from '@/src/state/session';
import { logSessionEvent } from '@/src/state/debug-log';
import { checkMac } from '@/src/api/client';
import { setActiveProfileId } from '@/src/state/active-profile';
import Avatar from '@/src/components/Avatar';
import TVFocusable from '@/src/components/TVFocusable';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [mac, setMac] = useState<string>('');
  const [bg, setBg] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, list, cachedSession] = await Promise.all([
      getDeviceMac(),
      loadProfiles(),
      loadSession(),
    ]);
    setMac(m);
    setProfiles(list);

    // Sessão de teste: não existe no painel principal, então perguntar pra
    // ele sempre voltaria "não autorizado" e sobrescreveria a sessão de
    // teste com a conta normal do painel (se esse MAC também estiver
    // cadastrado lá) — mesmo bug que já foi corrigido em home.tsx e
    // index.tsx. Pra conta de teste, usa só o que já está salvo local.
    if (cachedSession?.status === 'Teste') {
      logSessionEvent('profiles.load', 'sessão é TESTE — pulando checkMac (correto)');
      setBg(cachedSession?.bg_url);
      setLoading(false);
      return;
    }

    // O fundo (bg_url) é uma URL assinada que expira em ~1h — por isso
    // buscamos o status de novo aqui em vez de confiar só no que ficou
    // salvo de uma sessão anterior, que pode estar com o link já vencido.
    logSessionEvent(
      'profiles.load',
      `sessão NÃO é teste (status=${cachedSession?.status ?? 'undefined'}) — vai consultar painel`
    );
    const fresh = await checkMac(m);

    // O painel respondeu de verdade (não foi falha de rede) e disse que
    // esse MAC não está mais autorizado — o revendedor bloqueou a lista.
    // Não dá pra continuar usando os dados antigos salvos no celular.
    const isRealResponse = fresh.message !== 'Falha de conexão.';
    if (isRealResponse && !fresh.authorized) {
      await clearSession();
      router.replace('/');
      return;
    }

    const session = fresh.authorized ? fresh : cachedSession;
    if (fresh.authorized) {
      logSessionEvent('profiles.load', `SALVANDO sessão normal (playlist: ${fresh.playlists?.[0]?.name || '?'})`);
      await saveSession(fresh);
    }

    setBg(session?.bg_url);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openHome = (p: Profile) => {
    setActiveProfileId(p.id);
    router.push({ pathname: '/home', params: { profileId: p.id, profileName: p.name } });
  };

  const addProfile = () => router.push('/profile-edit');
  const goManage = () => {
    if (profiles.length === 0) return addProfile();
    router.push({ pathname: '/profile-edit', params: { manage: '1' } });
  };

  const data: (Profile | { addSlot: true; id: string })[] = [
    ...profiles,
    ...(profiles.length < 6 ? [{ addSlot: true as const, id: '__add' }] : []),
  ];

  return (
    <ImageBackground
      source={bg ? { uri: bg } : undefined}
      style={styles.bg}
      imageStyle={{ opacity: 0.2 }}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.title} testID="profile-select-title">Quem assiste?</Text>
        <View style={styles.underline} />

        <View style={styles.centerBlock}>
          {loading ? (
            <ActivityIndicator color={colors.accentCyan} />
          ) : (
            <FlatList
              horizontal
              data={data}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                if ('addSlot' in item) {
                  return (
                    <TVFocusable onPress={addProfile} style={styles.profileItem} focusStyle={styles.profileFocusTV} testID="profile-add-slot">
                      <View style={[styles.avatarCard, styles.addCard]}>
                        <Ionicons name="add" size={38} color={colors.textSecondary} />
                      </View>
                      <Text style={styles.profileName}>Adicionar</Text>
                    </TVFocusable>
                  );
                }
                const p = item as Profile;
                return (
                  <TVFocusable onPress={() => openHome(p)} style={styles.profileItem} focusStyle={styles.profileFocusTV} testID={`profile-${p.id}`}>
                    <View style={styles.avatarCard}>
                      <Avatar id={p.avatar_id} size={92} radius={14} />
                      {p.isKids && (
                        <View style={styles.kidsBadge}>
                          <Text style={styles.kidsBadgeText}>KIDS</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.profileName} numberOfLines={1}>{p.name}</Text>
                  </TVFocusable>
                );
              }}
            />
          )}
        </View>

        {profiles.length > 0 && (
          <TVFocusable style={styles.manageBtn} onPress={goManage} testID="profile-manage-btn">
            <Text style={styles.manageText}>PERFIS</Text>
          </TVFocusable>
        )}
        <Text style={styles.macTag} testID="profile-mac-tag">{mac}</Text>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.black },
  safe: { flex: 1, paddingTop: spacing.xl },
  title: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 48,
  },
  underline: {
    width: 48,
    height: 3,
    backgroundColor: colors.accentCyan,
    alignSelf: 'center',
    marginTop: spacing.md,
    borderRadius: 2,
  },
  centerBlock: { flex: 1, justifyContent: 'center' },
  profileItem: { alignItems: 'center', width: 110 },
  profileFocusTV: { transform: [{ scale: 1.08 }] },
  avatarCard: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: colors.darkSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  kidsBadge: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    backgroundColor: colors.accentCyan,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kidsBadgeText: { color: colors.black, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  addCard: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderStyle: 'dashed',
  },
  profileName: { color: colors.white, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  manageBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 24,
  },
  manageText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  macTag: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
});
