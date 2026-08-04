// Windy Webcams API — catálogo público de milhares de webcams ao vivo pelo
// mundo (praia, cidade, montanha, natureza, etc). Precisa de uma chave de
// API gratuita, cadastrada pelo dono do app em https://api.windy.com/keys
// (não é uma chave compartilhada nem embutida por padrão — ver WEBCAMS_API_KEY
// abaixo).
//
// Documentação: https://api.windy.com/webcams/docs
//
// Detalhe importante: as URLs de imagem retornadas expiram em 10 minutos
// (plano gratuito) — por isso NUNCA cacheamos a lista por muito tempo, e a
// tela de detalhe re-busca o webcam específico de tempos em tempos pra
// manter a imagem atualizada (é uma foto que atualiza, não vídeo de
// verdade, na maioria dos casos).

// Cole aqui a chave gratuita gerada em https://api.windy.com/keys — sem
// isso, a tela de Câmeras mostra um aviso pedindo pra configurar, em vez
// de tentar chamar a API sem chave (que sempre falharia).
export const WEBCAMS_API_KEY = 'y0p52vk6oEAg8j7xbJhZuoQbCNIi5zD1';

const BASE_URL = 'https://api.windy.com/webcams/api/v3';

export type WebcamCategory = { id: string; name: string };

export type Webcam = {
  webcamId: number;
  title: string;
  status: string;
  categories?: { id: string; name: string }[];
  location?: {
    city?: string;
    region?: string;
    country?: string;
    continent?: string;
    latitude?: number;
    longitude?: number;
  };
  images?: {
    current?: { preview?: string; thumbnail?: string; icon?: string };
  };
  player?: {
    live?: { embed?: string };
    day?: { embed?: string };
  };
};

async function windyGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!WEBCAMS_API_KEY) return null;
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, {
      headers: { 'x-windy-api-key': WEBCAMS_API_KEY },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function hasWebcamsApiKey(): boolean {
  return !!WEBCAMS_API_KEY;
}

export async function fetchWebcamCategories(): Promise<WebcamCategory[]> {
  const res = await windyGet<{ id: string; name: string }[]>('/categories', { lang: 'pt' });
  return res || [];
}

export type WebcamSearchParams = {
  category?: string;
  offset?: number;
  limit?: number;
};

// Sempre filtra por Brasil (country=BR) — é o público do app. Categoria é
// opcional (praia, cidade, montanha...); sem ela, traz de todas.
export async function searchBrazilWebcams(params: WebcamSearchParams = {}): Promise<{ webcams: Webcam[]; total: number }> {
  const query: Record<string, string> = {
    countries: 'BR',
    limit: String(Math.min(params.limit ?? 30, 50)), // 50 é o máximo do plano gratuito
    offset: String(params.offset ?? 0),
    include: 'images,location,player,categories',
  };
  if (params.category) query.categories = params.category;

  const res = await windyGet<{ total: number; webcams: Webcam[] }>('/webcams', query);
  return { webcams: res?.webcams || [], total: res?.total || 0 };
}

// Busca um webcam específico de novo — usado na tela de detalhe pra
// manter a imagem atualizada (o token da imagem expira em 10min no plano
// gratuito).
export async function fetchWebcamById(id: number): Promise<Webcam | null> {
  return windyGet<Webcam>(`/webcams/${id}`, { include: 'images,location,player,categories' });
}

// A API não tem um filtro de "buscar por nome de cidade" pronto — só
// país/região/categoria. Pra achar uma cidade específica (ex: "Ouro
// Fino"), varre os webcams do Brasil em lotes e filtra pelo nome da
// cidade/título localmente. Limitado a um número razoável de lotes pra
// não estourar o limite de chamadas — cobre a esmagadora maioria dos
// casos, já que o total de webcams cadastrados no Brasil não é gigante.
const SEARCH_MAX_BATCHES = 8;
const SEARCH_BATCH_SIZE = 50; // máximo do plano gratuito

export async function searchBrazilWebcamsByCity(query: string): Promise<Webcam[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: Webcam[] = [];
  for (let batch = 0; batch < SEARCH_MAX_BATCHES; batch++) {
    const res = await windyGet<{ total: number; webcams: Webcam[] }>('/webcams', {
      countries: 'BR',
      limit: String(SEARCH_BATCH_SIZE),
      offset: String(batch * SEARCH_BATCH_SIZE),
      include: 'images,location,player,categories',
    });
    const list = res?.webcams || [];
    for (const w of list) {
      const haystack = `${w.title} ${w.location?.city || ''} ${w.location?.region || ''}`.toLowerCase();
      if (haystack.includes(q)) matches.push(w);
    }
    // Já achou o suficiente, ou essa foi a última página — para de varrer.
    if (matches.length >= 20 || list.length < SEARCH_BATCH_SIZE) break;
  }
  return matches;
}
