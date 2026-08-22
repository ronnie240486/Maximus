// Cache for the Home screen sections (live/movies/series previews).
//
// Same pattern as session.ts: an in-memory copy for instant reads within the
// app session, plus a persisted copy so the *next cold start* can paint
// immediately from disk while a fresh fetch happens in the background
// (stale-while-revalidate). This is what makes Home feel instant on repeat
// opens instead of showing a spinner every time.

import { storage } from '@/src/utils/storage';
import { isAdultCategoryName, isAdultTitle } from '@/src/lib/adult-content';

const STORAGE_KEY = 'home_sections_cache_v1';

// Kept generic (not importing HomeItem/Section types from app/home.tsx) so
// this module has no dependency on a screen component.
export type CachedHomeData = {
  sections: unknown;
  savedAt: number;
};

let cached: CachedHomeData | null = null;

function isAdultHomeObject(value: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Boolean(
    isAdultTitle(value.name) ||
    isAdultTitle(value.title) ||
    isAdultCategoryName(value.category_name) ||
    isAdultTitle(value.stream_name) ||
    isAdultTitle(value.info?.name)
  );
}

function sanitizeHomeValue<T>(value: T): T | null {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isAdultHomeObject(item))
      .map((item) => sanitizeHomeValue(item))
      .filter((item): item is NonNullable<typeof item> => item !== null) as T;
  }
  if (!value || typeof value !== 'object') return value;
  if (isAdultHomeObject(value)) return null;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const safe = sanitizeHomeValue(child);
    if (safe !== null) output[key] = safe;
  }
  return output as T;
}

export function getHomeCache(): CachedHomeData | null {
  return cached;
}

// Grava em disco com debounce de 500ms — a Home costuma chamar isso umas
// 3 vezes seguidas (canais ao vivo, filmes, séries cada um resolvendo
// separado), e sem debounce isso virava 3 gravações físicas grudadas em
// AsyncStorage. A versão em MEMÓRIA (`cached`, usada pra leitura instantânea
// dentro da mesma sessão) continua atualizando na hora — só a escrita em
// disco de verdade é que fica pra depois, juntando várias chamadas seguidas
// numa escrita só (sempre com o valor mais recente).
let saveHomeCacheTimer: ReturnType<typeof setTimeout> | null = null;

export async function saveHomeCache(sections: unknown): Promise<void> {
  cached = { sections: sanitizeHomeValue(sections), savedAt: Date.now() };
  if (saveHomeCacheTimer) clearTimeout(saveHomeCacheTimer);
  saveHomeCacheTimer = setTimeout(() => {
    saveHomeCacheTimer = null;
    if (cached) storage.setItem(STORAGE_KEY, JSON.stringify(cached)).catch(() => {});
  }, 500);
}

export async function loadHomeCache(): Promise<CachedHomeData | null> {
  if (cached) return cached;
  const raw = await storage.getItem<string>(STORAGE_KEY, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedHomeData;
    cached = { sections: sanitizeHomeValue(parsed.sections), savedAt: parsed.savedAt || Date.now() };
    if (JSON.stringify(cached.sections) !== JSON.stringify(parsed.sections)) {
      void storage.setItem(STORAGE_KEY, JSON.stringify(cached));
    }
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
  if (saveHomeCacheTimer) {
    clearTimeout(saveHomeCacheTimer);
    saveHomeCacheTimer = null;
  }
  if (saveFeaturedCacheTimer) {
    clearTimeout(saveFeaturedCacheTimer);
    saveFeaturedCacheTimer = null;
  }
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
let saveFeaturedCacheTimer: ReturnType<typeof setTimeout> | null = null;

export async function saveFeaturedCache(items: unknown[]): Promise<void> {
  cachedFeatured = sanitizeHomeValue(items) || [];
  if (saveFeaturedCacheTimer) clearTimeout(saveFeaturedCacheTimer);
  saveFeaturedCacheTimer = setTimeout(() => {
    saveFeaturedCacheTimer = null;
    if (cachedFeatured) storage.setItem(FEATURED_KEY, JSON.stringify(cachedFeatured)).catch(() => {});
  }, 500);
}

export async function loadFeaturedCache(): Promise<unknown[] | null> {
  if (cachedFeatured) return cachedFeatured;
  const raw = await storage.getItem<string>(FEATURED_KEY, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown[];
    cachedFeatured = (sanitizeHomeValue(parsed) as unknown[]) || [];
    if (JSON.stringify(cachedFeatured) !== JSON.stringify(parsed)) {
      void storage.setItem(FEATURED_KEY, JSON.stringify(cachedFeatured));
    }
    return cachedFeatured;
  } catch {
    return null;
  }
}
