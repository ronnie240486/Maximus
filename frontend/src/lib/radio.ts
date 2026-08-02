// Radio Browser (radio-browser.info) — diretório público e gratuito de
// rádios ao vivo pela internet. Dados em domínio público, sem chave de API.
// Usamos o endpoint "all.api" que faz round-robin entre os servidores
// espelhados do projeto, então não dependemos de um único servidor no ar.

// "all.api" é um DNS round-robin entre os servidores espelhados do
// projeto — na maioria das redes funciona bem, mas em algumas (mais comum
// em TV box, com DNS/roteador mais restritivo) a resolução desse domínio
// específico falha mesmo com internet normal funcionando pra tudo mais.
// Por isso mantemos espelhos fixos como alternativa.
const MIRRORS = [
  'https://all.api.radio-browser.info',
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

async function fetchJson(path: string): Promise<any> {
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(`${mirror}${path}`, {
        headers: { 'User-Agent': 'MaximusPlayer/1.0' },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // Esse espelho falhou (DNS, timeout, etc.) — tenta o próximo antes
      // de desistir de vez.
    }
  }
  return null;
}

export type RadioStation = {
  stationuuid: string;
  name: string;
  url_resolved: string;
  url: string;
  favicon?: string;
  tags?: string;
  country?: string;
  bitrate?: number;
  clickcount?: number;
};

export type RadioCategory = {
  key: string;
  label: string;
  // Uma ou mais tags da Radio Browser a tentar, em ordem — usamos a
  // primeira que trouxer resultado suficiente.
  tags: string[];
  // Quando definido, filtra por país em vez de tag (ex: "BR" pra rádios
  // brasileiras conhecidas tipo Jovem Pan, Nova Brasil etc).
  countryCode?: string;
};

export const RADIO_CATEGORIES: RadioCategory[] = [
  { key: 'popular', label: 'Populares', tags: [] }, // sem tag = ordena por mais tocadas
  { key: 'nacionais', label: 'Nacionais', tags: [], countryCode: 'BR' },
  { key: 'rock', label: 'Rock', tags: ['rock'] },
  { key: 'hardrock', label: 'Hard Rock', tags: ['hard rock', 'hardrock', 'heavy metal'] },
  { key: 'pop', label: 'Pop', tags: ['pop'] },
  { key: 'sertanejo', label: 'Sertanejo', tags: ['sertanejo'] },
  // Gospel combinado com país=Brasil primeiro (pra pegar Novo Tempo, Aleluia
  // etc antes de rádios cristãs genéricas de fora), com fallback pra tag
  // sozinha se o cruzamento vier vazio.
  { key: 'gospel', label: 'Gospel', tags: ['gospel'], countryCode: 'BR' },
  { key: 'classicos', label: 'Clássicos', tags: ['oldies', 'classic hits'] },
  { key: 'internacionais', label: 'Internacionais', tags: ['top 40', 'english'] },
];

function dedupeStations(list: RadioStation[]): RadioStation[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Busca estações de uma categoria — tenta cada tag na ordem até achar resultado. */
export async function fetchStationsByCategory(cat: RadioCategory, limit = 80): Promise<RadioStation[]> {
  // Tag + país juntos (ex: gospel + Brasil) — se não trouxer nada, cai pra
  // tag sozinha (perde o filtro de país, mas mantém o gênero certo).
  if (cat.countryCode && cat.tags.length > 0) {
    for (const tag of cat.tags) {
      const url = `/json/stations/search?tag=${encodeURIComponent(tag)}&countrycode=${cat.countryCode}&limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
      const json = await fetchJson(url);
      const valid = (json || []).filter((s: RadioStation) => s.url_resolved || s.url);
      if (valid.length > 0) return dedupeStations(valid);
    }
    for (const tag of cat.tags) {
      const url = `/json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
      const json = await fetchJson(url);
      const valid = (json || []).filter((s: RadioStation) => s.url_resolved || s.url);
      if (valid.length > 0) return dedupeStations(valid);
    }
    return [];
  }
  // Só país, sem tag (ex: Nacionais).
  if (cat.countryCode) {
    const url = `/json/stations/search?countrycode=${cat.countryCode}&limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
    const json = await fetchJson(url);
    return dedupeStations((json || []).filter((s: RadioStation) => s.url_resolved || s.url));
  }
  if (cat.tags.length === 0) {
    // "Populares" — sem tag nem país, só ordena pelas mais clicadas globalmente.
    const url = `/json/stations/search?limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
    const json = await fetchJson(url);
    return dedupeStations((json || []).filter((s: RadioStation) => s.url_resolved || s.url));
  }
  for (const tag of cat.tags) {
    const url = `/json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
    const json = await fetchJson(url);
    const valid = (json || []).filter((s: RadioStation) => s.url_resolved || s.url);
    if (valid.length > 0) return dedupeStations(valid);
  }
  return [];
}

/** Busca por nome — usada pela lupa de pesquisa da tela de Rádios. */
export async function searchStationsByName(query: string, limit = 60): Promise<RadioStation[]> {
  const url = `/json/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
  const json = await fetchJson(url);
  return dedupeStations((json || []).filter((s: RadioStation) => s.url_resolved || s.url));
}

export function radioStreamUrl(s: RadioStation): string {
  return s.url_resolved || s.url;
}
