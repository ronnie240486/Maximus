// Local profile store. The backend's `get_profiles`/`save_profile`/`delete_profile`
// endpoints only return SPA HTML, so profiles are kept on-device.

import { storage } from '@/src/utils/storage';
import { getActiveProfileId } from '@/src/state/active-profile';

const KEY = 'profiles_v1';

export type Profile = { id: string; name: string; avatar_id: string; isKids?: boolean };

export async function loadProfiles(): Promise<Profile[]> {
  const raw = await storage.getItem<string>(KEY, '');
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as Profile[]) : [];
  } catch {
    return [];
  }
}

async function persist(profiles: Profile[]): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(profiles));
}

export async function upsertProfile(
  p: Omit<Profile, 'id'> & { id?: string }
): Promise<Profile[]> {
  const list = await loadProfiles();
  if (p.id) {
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = { ...list[idx], name: p.name, avatar_id: p.avatar_id, isKids: !!p.isKids };
    else list.push({ id: p.id, name: p.name, avatar_id: p.avatar_id, isKids: !!p.isKids });
  } else {
    const id = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    list.push({ id, name: p.name, avatar_id: p.avatar_id, isKids: !!p.isKids });
  }
  await persist(list);
  return list;
}

export async function deleteProfile(id: string): Promise<Profile[]> {
  const list = (await loadProfiles()).filter((x) => x.id !== id);
  await persist(list);
  return list;
}

// Usado pelas telas de conteúdo (Home, Canais, Filmes, Séries) pra saber
// se precisam esconder categorias adultas por completo — perfil infantil
// não tem nem a OPÇÃO de desbloquear com PIN, o conteúdo simplesmente não
// existe pra ele.
export async function isActiveProfileKids(): Promise<boolean> {
  const id = getActiveProfileId();
  if (id === 'default') return false;
  const list = await loadProfiles();
  return !!list.find((p) => p.id === id)?.isKids;
}
