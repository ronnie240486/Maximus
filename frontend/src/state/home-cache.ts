// Cache for the Home screen sections (live/movies/series previews).
//
// Same pattern as session.ts: an in-memory copy for instant reads within the
// app session, plus a persisted copy so the *next cold start* can paint
// immediately from disk while a fresh fetch happens in the background
// (stale-while-revalidate). This is what makes Home feel instant on repeat
// opens instead of showing a spinner every time.

import { storage } from '@/src/utils/storage';

const STORAGE_KEY = 'home_sections_cache_v1';

// Kept generic (not importing HomeItem/Section types from app/home.tsx) so
// this module has no dependency on a screen component.
export type CachedHomeData = {
  sections: unknown;
  savedAt: number;
};

let cached: CachedHomeData | null = null;

export function getHomeCache(): CachedHomeData | null {
  return cached;
}

export async function saveHomeCache(sections: unknown): Promise<void> {
  cached = { sections, savedAt: Date.now() };
  await storage.setItem(STORAGE_KEY, JSON.stringify(cached));
}

export async function loadHomeCache(): Promise<CachedHomeData | null> {
  if (cached) return cached;
  const raw = await storage.getItem<string>(STORAGE_KEY, '');
  if (!raw) return null;
  try {
    cached = JSON.parse(raw) as CachedHomeData;
    return cached;
  } catch {
    return null;
  }
}

// Chamado quando a sessão é encerrada (MAC bloqueado, lista removida do
// painel etc.) — sem isso, o próximo login (mesmo de outra conta/teste)
// pintaria por um instante o conteúdo antigo em cache antes da busca nova
// chegar, o que é confuso ("por que apareceu filme de outra lista?").
export async function clearHomeCache(): Promise<void> {
  cached = null;
  cachedFeatured = null;
  await storage.removeItem(STORAGE_KEY);
  await storage.removeItem(FEATURED_KEY);
}

// Cache separado pra fileira "Lançamentos em destaque" — antes ela nunca
// era salva em disco, então toda vez que a Home abria (mesmo não sendo a
// primeira vez), essa fileira ficava vazia até a internet responder do
// zero. Agora pinta com o que tinha da última vez instantaneamente,
// enquanto busca uma leva nova (embaralhada de novo) por trás.
const FEATURED_KEY = 'home_featured_cache_v1';
let cachedFeatured: unknown[] | null = null;

export async function saveFeaturedCache(items: unknown[]): Promise<void> {
  cachedFeatured = items;
  await storage.setItem(FEATURED_KEY, JSON.stringify(items));
}

export async function loadFeaturedCache(): Promise<unknown[] | null> {
  if (cachedFeatured) return cachedFeatured;
  const raw = await storage.getItem<string>(FEATURED_KEY, '');
  if (!raw) return null;
  try {
    cachedFeatured = JSON.parse(raw) as unknown[];
    return cachedFeatured;
  } catch {
    return null;
  }
}
