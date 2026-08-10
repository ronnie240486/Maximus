// Escudo real de time pra deixar "Jogos do Dia" menos genérico — usa a
// Wikipédia (gratuita, sem chave de API) pra buscar a imagem principal do
// artigo do clube. O risco de simplesmente buscar pelo nome do time é
// achar a coisa errada (ex: "São Paulo" sozinho pode voltar o artigo da
// CIDADE, não do time de futebol) — por isso, ao invés de busca livre,
// usa uma lista curada com o título EXATO do artigo certo na Wikipédia
// pra cada time reconhecido. Time fora dessa lista continua usando o
// ícone genérico do esporte (nunca mostra um escudo errado por engano).

import { storage } from '@/src/utils/storage';
import { logSessionEventFast } from '@/src/state/debug-log';

const CACHE_KEY = 'team_logo_cache_v1';

// Nome normalizado do time (como aparece no canal) -> título exato do
// artigo na Wikipédia em português. Lista deliberadamente focada nos
// times brasileiros mais comuns em painel de IPTV, mais alguns
// internacionais grandes — não é exaustiva.
const TEAM_WIKI_TITLES: Record<string, string> = {
  'sao paulo': 'São_Paulo_Futebol_Clube',
  'corinthians': 'Sport_Club_Corinthians_Paulista',
  'palmeiras': 'Sociedade_Esportiva_Palmeiras',
  'santos': 'Santos_Futebol_Clube',
  'flamengo': 'Clube_de_Regatas_do_Flamengo',
  'fluminense': 'Fluminense_Football_Club',
  'vasco': 'Club_de_Regatas_Vasco_da_Gama',
  'vasco da gama': 'Club_de_Regatas_Vasco_da_Gama',
  'botafogo': 'Botafogo_de_Futebol_e_Regatas',
  'gremio': 'Grêmio_Foot-Ball_Porto_Alegrense',
  'internacional': 'Sport_Club_Internacional',
  'atletico mineiro': 'Clube_Atlético_Mineiro',
  'atletico-mg': 'Clube_Atlético_Mineiro',
  'cruzeiro': 'Cruzeiro_Esporte_Clube',
  'bahia': 'Esporte_Clube_Bahia',
  'vitoria': 'Esporte_Clube_Vitória',
  'sport': 'Sport_Club_do_Recife',
  'sport recife': 'Sport_Club_do_Recife',
  'ceara': 'Ceará_Sporting_Club',
  'fortaleza': 'Fortaleza_Esporte_Clube',
  'goias': 'Goiás_Esporte_Clube',
  'coritiba': 'Coritiba_Foot_Ball_Club',
  'athletico paranaense': 'Club_Athletico_Paranaense',
  'athletico-pr': 'Club_Athletico_Paranaense',
  'bragantino': 'Red_Bull_Bragantino',
  'red bull bragantino': 'Red_Bull_Bragantino',
  'juventude': 'Esporte_Clube_Juventude',
  'cuiaba': 'Cuiabá_Esporte_Clube',
  'america mineiro': 'América_Futebol_Clube_(Belo_Horizonte)',
  'operario': 'Operário_Ferroviário_Esporte_Clube',
  'mirassol': 'Mirassol_Futebol_Clube',
  // Grandes internacionais mais comuns em canal de painel
  'real madrid': 'Real_Madrid_Club_de_Fútbol',
  'barcelona': 'Futbol_Club_Barcelona',
  'manchester united': 'Manchester_United_F.C.',
  'manchester city': 'Manchester_City_F.C.',
  'liverpool': 'Liverpool_F.C.',
  'chelsea': 'Chelsea_F.C.',
  'arsenal': 'Arsenal_F.C.',
  'psg': 'Paris_Saint-Germain_Football_Club',
  'paris saint-germain': 'Paris_Saint-Germain_Football_Club',
  'juventus': 'Juventus_Football_Club',
  'milan': 'Associazione_Calcio_Milan',
  'inter de milao': 'Football_Club_Internazionale_Milano',
  'bayern de munique': 'FC_Bayern_München',
  'bayern munich': 'FC_Bayern_München',
};

type CacheEntry = { url: string | null; ts: number };
let cacheMemory: Record<string, CacheEntry> | null = null;

async function loadCache(): Promise<Record<string, CacheEntry>> {
  if (cacheMemory) return cacheMemory;
  const raw = await storage.getItem<string>(CACHE_KEY, '');
  cacheMemory = raw ? JSON.parse(raw) : {};
  return cacheMemory!;
}

async function saveCache(): Promise<void> {
  if (cacheMemory) await storage.setItem(CACHE_KEY, JSON.stringify(cacheMemory));
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Devolve a URL do escudo do time se reconhecido na lista curada — null
 * se o time não estiver na lista (nesse caso, a tela deve continuar
 * usando o ícone genérico do esporte, nunca mostrar algo incerto).
 *
 * Usa comparação por CONTÉM, não igualdade exata — o nome do time no
 * canal do painel raramente vem "limpo" (ex: "São Paulo/SP", "SPFC",
 * "São Paulo Futebol Clube"), então exigir bater 100% igual deixava a
 * lista curada praticamente inútil na prática.
 */
export async function getTeamLogoUrl(teamName: string): Promise<string | null> {
  const key = normalize(teamName);
  if (!key) return null;

  const match = Object.entries(TEAM_WIKI_TITLES).find(
    ([teamKey]) => key.includes(teamKey) || teamKey.includes(key)
  );
  if (!match) {
    logSessionEventFast('team-logo', `nao reconhecido: "${teamName}"`);
    return null;
  }
  const wikiTitle = match[1];

  const cache = await loadCache();
  const cached = cache[wikiTitle];
  if (cached) return cached.url;

  try {
    const res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
    if (!res.ok) {
      logSessionEventFast('team-logo', `wikipedia respondeu ${res.status} pra "${wikiTitle}"`);
      cache[wikiTitle] = { url: null, ts: Date.now() };
      await saveCache();
      return null;
    }
    const json = await res.json();
    const url: string | null = json?.thumbnail?.source || null;
    if (!url) logSessionEventFast('team-logo', `sem thumbnail pra "${wikiTitle}"`);
    cache[wikiTitle] = { url, ts: Date.now() };
    await saveCache();
    return url;
  } catch (e: any) {
    logSessionEventFast('team-logo', `erro de rede: ${e?.message || e}`);
    return null;
  }
}
