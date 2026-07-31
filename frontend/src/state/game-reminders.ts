// Game reminders for "Jogos do dia". We can't automatically know *which*
// channel airs a given match (the free sports API has no such mapping), so
// this stores a lightweight reminder (what + when) and, once the game's
// start time arrives, prompts the person to jump to Channels and find it —
// rather than pretending to auto-tune a channel we can't actually know.
//
// Caveat that matters: this only fires while the app is open (checked on
// Home/Games screen focus). Without a background/notifications setup (a
// bigger addition on its own), it can't alert while the phone is locked or
// the app is closed.

import { storage } from '@/src/utils/storage';
import { getActiveProfileId } from '@/src/state/active-profile';

const KEY_PREFIX = 'game_reminders_v1_';

export type GameReminder = {
  id: string; // idEvent from the sports API
  name: string; // "Time A vs Time B"
  league?: string;
  startsAt: number; // epoch ms
  notified: boolean;
};

const cache: Record<string, GameReminder[]> = {};

function storageKey(): string {
  return KEY_PREFIX + getActiveProfileId();
}

async function persist(list: GameReminder[]): Promise<void> {
  cache[getActiveProfileId()] = list;
  await storage.setItem(storageKey(), JSON.stringify(list));
}

export async function loadGameReminders(): Promise<GameReminder[]> {
  const profileId = getActiveProfileId();
  if (cache[profileId]) return cache[profileId];
  const raw = await storage.getItem<string>(storageKey(), '');
  if (!raw) {
    cache[profileId] = [];
    return cache[profileId];
  }
  try {
    cache[profileId] = JSON.parse(raw) as GameReminder[];
  } catch {
    cache[profileId] = [];
  }
  return cache[profileId];
}

export async function isGameScheduled(id: string): Promise<boolean> {
  const list = await loadGameReminders();
  return list.some((r) => r.id === id);
}

export async function toggleGameReminder(item: Omit<GameReminder, 'notified'>): Promise<boolean> {
  const list = await loadGameReminders();
  const exists = list.some((r) => r.id === item.id);
  const next = exists
    ? list.filter((r) => r.id !== item.id)
    : [...list, { ...item, notified: false }];
  await persist(next);
  return !exists;
}

/** Reminders whose start time has arrived (within the last 3h, so we don't
 * resurface something from days ago) and haven't been shown yet. Marks them
 * as notified as a side effect so they don't repeat every focus. */
export async function popDueReminders(): Promise<GameReminder[]> {
  const list = await loadGameReminders();
  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const due = list.filter((r) => !r.notified && r.startsAt <= now && now - r.startsAt < THREE_HOURS);
  if (due.length) {
    const updated = list.map((r) => (due.some((d) => d.id === r.id) ? { ...r, notified: true } : r));
    await persist(updated);
  }
  return due;
}
