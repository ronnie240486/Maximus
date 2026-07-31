// Continue watching — a short, recency-ordered list of the last VOD items
// (movies / series episodes) the person opened in the player, so Home can
// show a "resume" row like Netflix does. Live channels are intentionally
// never recorded — "continue watching" a live channel doesn't mean anything.
// Keyed per profile so each person's "resume" row only shows their own stuff.

import { storage } from '@/src/utils/storage';
import { getActiveProfileId } from '@/src/state/active-profile';

const KEY_PREFIX = 'watch_history_v1_';
const MAX_ITEMS = 20;

export type WatchEntry = {
  id: string; // same id passed to the player (e.g. "movie-123", "series-ep-456")
  name: string;
  logo?: string;
  stream: string;
  seriesId?: number; // present for episodes, so "resume" can reopen the series details instead
  updatedAt: number;
};

const cache: Record<string, WatchEntry[]> = {};

function storageKey(): string {
  return KEY_PREFIX + getActiveProfileId();
}

async function persist(list: WatchEntry[]): Promise<void> {
  cache[getActiveProfileId()] = list;
  await storage.setItem(storageKey(), JSON.stringify(list));
}

export async function loadWatchHistory(): Promise<WatchEntry[]> {
  const profileId = getActiveProfileId();
  if (cache[profileId]) return cache[profileId];
  const raw = await storage.getItem<string>(storageKey(), '');
  if (!raw) {
    cache[profileId] = [];
    return cache[profileId];
  }
  try {
    cache[profileId] = JSON.parse(raw) as WatchEntry[];
  } catch {
    cache[profileId] = [];
  }
  return cache[profileId];
}

export async function recordWatch(entry: Omit<WatchEntry, 'updatedAt'>): Promise<void> {
  const list = await loadWatchHistory();
  const withoutThis = list.filter((e) => e.id !== entry.id);
  const next = [{ ...entry, updatedAt: Date.now() }, ...withoutThis].slice(0, MAX_ITEMS);
  await persist(next);
}
