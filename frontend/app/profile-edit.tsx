import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/theme';
import { AVATARS } from '@/src/lib/avatars';
import Avatar from '@/src/components/Avatar';
import { deleteProfile, loadProfiles, Profile, upsertProfile } from '@/src/state/profiles';

export default function EditProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId?: string; manage?: string }>();
  const isManage = params.manage === '1' && !params.profileId;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | undefined>(params.profileId);
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string>('avatar_1');

  const load = useCallback(async () => {
    const list = await loadProfiles();
    setProfiles(list);
    if (selectedId) {
      const p = list.find((x) => x.id === selectedId);
      if (p) {
        setName(p.name);
        setAvatarId(p.avatar_id);
      }
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickProfile = (p: Profile) => {
    setSelectedId(p.id);
    setName(p.name);
    setAvatarId(p.avatar_id);
  };

  const startNew = () => {
    setSelectedId(undefined);
    setName('');
    setAvatarId('avatar_1');
  };

  const onSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await upsertProfile({ id: selectedId, name: name.trim(), avatar_id: avatarId });
    setSaving(false);
    router.back();
  };

  const onDelete = async () => {
    if (!selectedId) return;
    setSaving(true);
    await deleteProfile(selectedId);
    setSaving(false);
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accentCyan} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} testID="edit-back-btn" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isManage ? 'Gerenciar perfis' : selectedId ? 'Editar perfil' : 'Novo perfil'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {isManage && (
          <>
            <Text style={styles.smallLabel}>SEUS PERFIS</Text>
            <View style={styles.profilesRow}>
              {profiles.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => pickProfile(p)}
                  style={styles.profileMini}
                  testID={`manage-profile-${p.id}`}
                >
                  <View
                    style={[
                      styles.miniWrap,
                      selectedId === p.id && { borderColor: colors.accentCyan },
                    ]}
                  >
                    <Avatar id={p.avatar_id} size={54} radius={11} />
                  </View>
                  <Text style={styles.miniName} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              ))}
              <Pressable onPress={startNew} style={styles.profileMini} testID="manage-add-new">
                <View style={styles.addPlus}>
                  <Ionicons name="add" size={28} color={colors.textSecondary} />
                </View>
                <Text style={styles.miniName}>Novo</Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.previewWrap}>
          <View style={styles.preview}>
            <Avatar id={avatarId} size={90} radius={14} />
          </View>
          <Text style={styles.smallLabel}>AVATAR</Text>
        </View>

        <View style={styles.avatarGrid}>
          {AVATARS.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => setAvatarId(a.id)}
              style={[styles.avatarChoice, avatarId === a.id && styles.avatarChoiceActive]}
              testID={`avatar-choice-${a.id}`}
            >
              <Avatar id={a.id} size={54} radius={12} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.smallLabel, { marginTop: spacing.md }]}>NOME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Digite um nome"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          maxLength={30}
          testID="edit-name-input"
        />

        <View style={styles.btnRow}>
          <Pressable
            onPress={onSave}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            testID="edit-save-btn"
          >
            {saving ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.saveText}>SALVAR</Text>
            )}
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.cancelBtn} testID="edit-cancel-btn">
            <Text style={styles.cancelText}>CANCELAR</Text>
          </Pressable>
        </View>

        {selectedId && (
          <Pressable onPress={onDelete} style={styles.deleteBtn} testID="edit-delete-btn">
            <Text style={styles.deleteText}>EXCLUIR PERFIL</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.black },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  smallLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  profilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  profileMini: { alignItems: 'center', width: 72 },
  miniWrap: {
    padding: 3,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  addPlus: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniName: { color: colors.white, fontSize: 11, marginTop: 4 },
  previewWrap: { alignItems: 'center', marginBottom: spacing.md },
  preview: {
    width: 110,
    height: 110,
    borderRadius: 16,
    backgroundColor: colors.darkSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  avatarChoice: {
    padding: 4,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarChoiceActive: { borderColor: colors.accentCyan },
  input: {
    backgroundColor: colors.darkSurfaceAlt,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 4,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.accentCyan,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveText: { color: colors.black, fontWeight: '800', letterSpacing: 1.5 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cancelText: { color: colors.textSecondary, fontWeight: '800', letterSpacing: 1.5 },
  deleteBtn: {
    marginTop: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: '800', letterSpacing: 1.5 },
});
