// InteractivePlayer / OuroPro backend client.
//
// The IPTV panel (`renciaapp.manus.space`) blocks cross-origin *browser*
// requests (no CORS headers) — that's a browser-only restriction, so on
// native (Expo Go / the built APK) we call it directly. Only the web preview
// needs to go through our own FastAPI `/api/iptv-proxy`, and only if that
// backend happens to be deployed and reachable; native never depends on it.

import { Platform } from 'react-native';

const PROXY_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/iptv-proxy`;

const PANEL_BASE = 'https://renciaapp.manus.space/api/v5';

const commonHeaders: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  // Some panels behave differently (or block) requests that don't look like
  // they came from a phone. Send this on native directly since we no longer
  // rely on the backend proxy to add it for us.
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1',
};

function routeUrl(url: string): string {
  if (Platform.OS === 'web') {
    return `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/** Wraps an upstream IPTV URL through the FastAPI proxy (web only — see routeUrl). */
export function proxied(url: string): string {
  return routeUrl(url);
}

async function safeJson<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type Playlist = {
  name: string;
  url: string;
  type?: string;
};

export type MacStatus = {
  authorized: boolean;
  registered: boolean;
  mac: string;
  status?: string;
  expire_date?: string | null;
  playlists?: Playlist[];
  logo_url?: string;
  bg_url?: string;
  banner_url?: string;
  app_name?: string;
  whatsapp_url?: string;
  reseller_contact?: string;
  reseller_whatsapp?: string;
  version?: string;
  apk_link?: string;
  message?: string;
  server_name?: string;
  tipo?: string;
  raw?: Record<string, unknown>;
};

/**
 * Normalizes any of the response shapes the panel emits to a single
 * `MacStatus`. Fields observed so far (mobile UA):
 *   found, status, allowed, mac_registered, mac, nomeServer, tipo, app,
 *   urlM3u8, urlEpg, modoSelecao, dataExpiracao, dataCadastro
 * And the alternate (non-mobile) shape:
 *   success, registered, playlists[], logo_url, bg_url, app_name, ...
 */
function normalize(json: any, macFallback: string): MacStatus {
  if (!json || typeof json !== 'object') {
    return { authorized: false, registered: false, mac: macFallback };
  }

  const registered =
    json.mac_registered === true ||
    json.registered === true ||
    json.registered === 1 ||
    json.registered === '1' ||
    json.found === true;

  const allowed =
    json.allowed === true ||
    (json.success !== false && registered);

  // Playlists — support both `playlists[]` and single `urlM3u8`.
  let playlists: Playlist[] | undefined;
  if (Array.isArray(json.playlists) && json.playlists.length > 0) {
    playlists = json.playlists.map((p: any) => ({
      name: p.name || p.playlist_name || 'Playlist',
      url: p.url || p.playlist_url || '',
      type: p.type,
    })).filter((p: Playlist) => !!p.url);
  } else if (typeof json.urlM3u8 === 'string' && json.urlM3u8) {
    playlists = [{ name: json.nomeServer || 'Playlist', url: json.urlM3u8, type: 'm3u_plus' }];
  }

  return {
    authorized: !!(registered && allowed),
    registered: !!registered,
    mac: json.mac || macFallback,
    status: json.status,
    expire_date: json.dataExpiracao || json.expire_date || null,
    playlists,
    logo_url: json.logo_url,
    bg_url: json.bg_url,
    banner_url: json.banner_url,
    app_name: json.app_name || json.app,
    whatsapp_url: json.whatsapp_url,
    reseller_contact: json.reseller_contact,
    reseller_whatsapp: json.reseller_whatsapp,
    version: json.version,
    apk_link: json.apk_link,
    message: json.error || json.message || json.mensagem,
    server_name: json.nomeServer,
    tipo: json.tipo,
    raw: json,
  };
}

export async function checkMac(mac: string): Promise<MacStatus> {
  const upstream = `${PANEL_BASE}/check_mac.php?mac=${encodeURIComponent(mac)}`;
  try {
    const res = await fetch(proxied(upstream), { headers: commonHeaders });
    const json = await safeJson<any>(res);
    if (!json) return { authorized: false, registered: false, mac, message: 'Resposta inválida.' };
    return normalize(json, mac);
  } catch {
    return { authorized: false, registered: false, mac, message: 'Falha de conexão.' };
  }
}

export async function checkExpire(mac: string): Promise<{ expired: boolean; expire_date?: string | null }> {
  const upstream = `${PANEL_BASE}/check_expire.php?mac=${encodeURIComponent(mac)}`;
  try {
    const res = await fetch(proxied(upstream), { headers: commonHeaders });
    const json = await safeJson<any>(res);
    if (!json) return { expired: true };
    return { expired: !!json.expired, expire_date: json.expire_date };
  } catch {
    return { expired: true };
  }
}

export type TestRegisterResult = {
  ok: boolean;
  http?: number;
  url: string;
  raw: string;
};

// URL do gerador de teste automático (chatbot sigmab.pro), a mesma
// cadastrada no campo "URL do Servidor (DNS)" do painel. Chamada direto
// daqui, sem backend no meio — o painel tem um bug que faz esse campo não
// chegar certo pro app (manda o nome do revendedor em vez do link), então
// por enquanto não dá pra ler isso dinamicamente. Se esse link mudar de
// novo, precisa atualizar aqui e gerar um APK novo.
const TEST_REGISTER_URL = 'https://nuvixtv.sigmab.pro/api/chatbot/Yen129WPEa/XYgD9JWr6V';

export async function registerTestDevice(mac: string): Promise<TestRegisterResult> {
  const upstream = `${TEST_REGISTER_URL}?mac=${encodeURIComponent(mac)}`;
  try {
    const res = await fetch(proxied(upstream), { headers: commonHeaders });
    const text = await res.text();
    return { ok: res.ok, http: res.status, url: upstream, raw: text };
  } catch (e: any) {
    return { ok: false, url: upstream, raw: e?.message || String(e) };
  }
}
