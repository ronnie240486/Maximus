// Lembretes de programação de TV — quando o horário chega, avisamos e
// oferecemos ir direto pro canal (diferente dos jogos, aqui SABEMOS o canal,
// então o "ir assistir" é uma ação de verdade, não só uma sugestão).

import { storage } from '@/src/utils/storage';
import { getActiveProfileId } from '@/src/state/active-profile';

const KEY_PREFIX = 'program_reminders_v1_';

export type ProgramReminder = {
  id: string; // `${channelId}-${epgItemId}`
  title: string;
  channelId: number;
  channelName: string;
  channelCover?: string;
  startsAt: number; // epoch ms
  notified: boolean;
};

const cache: Record<string, ProgramReminder[]> = {};

function storageKey(): string {
  return KEY_PREFIX + getActiveProfileId();
}

async function persist(list: ProgramReminder[]): Promise<void> {
  cache[getActiveProfileId()] = list;
  await storage.setItem(storageKey(), JSON.stringify(list));
}

export async function loadProgramReminders(): Promise<ProgramReminder[]> {
  const profileId = getActiveProfileId();
  if (cache[profileId]) return cache[profileId];
  const raw = await storage.getItem<string>(storageKey(), '');
  if (!raw) {
    cache[profileId] = [];
    return cache[profileId];
  }
  try {
    cache[profileId] = JSON.parse(raw) as ProgramReminder[];
  } catch {
    cache[profileId] = [];
  }
  return cache[profileId];
}

export async function isProgramScheduled(id: string): Promise<boolean> {
  const list = await loadProgramReminders();
  return list.some((r) => r.id === id);
}

export async function toggleProgramReminder(item: Omit<ProgramReminder, 'notified'>): Promise<boolean> {
  const list = await loadProgramReminders();
  const exists = list.some((r) => r.id === item.id);
  const next = exists
    ? list.filter((r) => r.id !== item.id)
    : [...list, { ...item, notified: false }];
  await persist(next);
  return !exists;
}

/** Lembretes cujo horário já chegou (últimas 3h, pra não reaparecer de dias atrás). */
export async function popDueProgramReminders(): Promise<ProgramReminder[]> {
  const list = await loadProgramReminders();
  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const due = list.filter((r) => !r.notified && r.startsAt <= now && now - r.startsAt < THREE_HOURS);
  if (due.length) {
    const updated = list.map((r) => (due.some((d) => d.id === r.id) ? { ...r, notified: true } : r));
    await persist(updated);
  }
  return due;
}
