// Xtream Codes IPTV client + M3U URL parser.
//
// The backend `check_mac.php` returns playlists whose URLs follow the
// Xtream Codes convention:
//   http://server[:port]/get.php?username=X&password=Y&type=m3u_plus&output=ts
// From that we can hit the real Xtream `player_api.php` for structured data
// (categories, live streams, movies, series) — much faster than parsing M3U.

export type XtreamCreds = {
  server: string; // e.g. "http://nuvixonix.shop"
  username: string;
  password: string;
};

import { Platform } from 'react-native';

// Some Xtream servers hide behind Cloudflare and reject datacenter IPs; from
// a residential mobile connection (Expo Go / APK) they respond normally, so
// we call them directly on native. In the web preview the browser blocks
// cross-origin requests, so we route through our own FastAPI proxy which
// adds a mobile UA and CORS headers (though Cloudflare may still block from
// the container IP — the app is intended for mobile devices).
const PROXY_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/iptv-proxy`;

const commonHeaders: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
};

function routeUrl(url: string): string {
  if (Platform.OS === 'web') {
    return `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function parsePlaylistUrl(url: string): XtreamCreds | null {
  try {
    const u = new URL(url);
    const username = u.searchParams.get('username');
    const password = u.searchParams.get('password');
    if (!username || !password) return null;
    const server = `${u.protocol}//${u.host}`;
    return { server, username, password };
  } catch {
    return null;
  }
}

// Requests hang forever on some Xtream panels when the server is overloaded;
// cap every call so a single slow endpoint can't block the whole screen.
const DEFAULT_TIMEOUT_MS = 9000;

async function xtreamGet<T>(
  creds: XtreamCreds,
  action: string,
  extra: Record<string, string> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
  const params = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    ...(action ? { action } : {}),
    ...extra,
  });
  const url = `${creds.server}/player_api.php?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(routeUrl(url), { headers: commonHeaders, signal: controller.signal });
    if (!res.ok) {
      lastError = res.status === 403
        ? 'BLOCKED_CLOUDFLARE'
        : `HTTP_${res.status}`;
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      lastError = 'BLOCKED_CLOUDFLARE';
      return null;
    }
    lastError = null;
    return (await res.json()) as T;
  } catch (e: any) {
    lastError = e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let lastError: string | null = null;
export function getLastXtreamError(): string | null {
  return lastError;
}

export type XtreamCategory = { category_id: string; category_name: string; parent_id?: number };

export type XtreamLive = {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string;
  category_id?: string;
  tv_archive?: number;
  direct_source?: string;
  tv_archive_duration?: number;
};

export type XtreamMovie = {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  rating?: string | number;
  rating_5based?: number;
  added?: string;
  category_id?: string;
  container_extension?: string;
  direct_source?: string;
};

export type XtreamSeries = {
  num?: number;
  name: string;
  series_id: number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string | number;
  rating_5based?: number;
  category_id?: string;
};

export type XtreamSeasonInfo = {
  air_date?: string;
  episode_count?: number;
  id?: number;
  name?: string;
  overview?: string;
  season_number: number;
  cover?: string;
  cover_big?: string;
};

export type XtreamEpisode = {
  id: string;
  episode_num: number;
  title: string;
  container_extension?: string;
  info?: {
    plot?: string;
    duration?: string;
    duration_secs?: number;
    movie_image?: string;
    releaseDate?: string;
    rating?: string;
  };
};

export type XtreamVodInfo = {
  info: {
    name?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releasedate?: string;
    release_date?: string;
    rating?: string | number;
    duration?: string;
    cover_big?: string;
    movie_image?: string;
    backdrop_path?: string[];
    youtube_trailer?: string; // usually just the raw YouTube video id
  };
  movie_data?: {
    stream_id?: number;
    container_extension?: string;
  };
};
export type XtreamSeriesInfo = {
  seasons: XtreamSeasonInfo[];
  info: {
    name?: string;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    rating?: string | number;
    backdrop_path?: string[];
    youtube_trailer?: string;
  };
  episodes: Record<string, XtreamEpisode[]>;
};

export type XtreamUserInfo = {
  user_info?: {
    message?: string;
    status?: string;
    exp_date?: string;
    active_cons?: string | number;
    max_connections?: string | number;
    is_trial?: string;
  };
};

export const xtream = {
  authenticate: (c: XtreamCreds) => xtreamGet<XtreamUserInfo>(c, ''),
  liveCategories: (c: XtreamCreds) =>
    xtreamGet<XtreamCategory[]>(c, 'get_live_categories'),
  vodCategories: (c: XtreamCreds) =>
    xtreamGet<XtreamCategory[]>(c, 'get_vod_categories'),
  seriesCategories: (c: XtreamCreds) =>
    xtreamGet<XtreamCategory[]>(c, 'get_series_categories'),
  liveStreams: (c: XtreamCreds, categoryId?: string) =>
    xtreamGet<XtreamLive[]>(c, 'get_live_streams', categoryId ? { category_id: categoryId } : {}),
  vodStreams: (c: XtreamCreds, categoryId?: string) =>
    xtreamGet<XtreamMovie[]>(c, 'get_vod_streams', categoryId ? { category_id: categoryId } : {}),
  seriesList: (c: XtreamCreds, categoryId?: string) =>
    xtreamGet<XtreamSeries[]>(c, 'get_series', categoryId ? { category_id: categoryId } : {}),
  seriesInfo: (c: XtreamCreds, seriesId: number) =>
    xtreamGet<XtreamSeriesInfo>(c, 'get_series_info', { series_id: String(seriesId) }),
  vodInfo: (c: XtreamCreds, vodId: number) =>
    xtreamGet<XtreamVodInfo>(c, 'get_vod_info', { vod_id: String(vodId) }),
  shortEpg: (c: XtreamCreds, streamId: number, limit = 4) =>
    xtreamGet<{ epg_listings: XtreamEpgListing[] }>(c, 'get_short_epg', {
      stream_id: String(streamId),
      limit: String(limit),
    }),
};

export type XtreamEpgListing = {
  id?: string;
  title: string; // base64-encoded
  description?: string; // base64-encoded
  start: string; // "YYYY-MM-DD HH:mm:ss"
  end: string;
};

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

/** Decodes the base64 text Xtream sends for EPG title/description — no
 * `atob`/Buffer dependency needed, works the same on native and web. */
export function decodeEpgText(input?: string): string {
  if (!input) return '';
  try {
    let str = input.replace(/[^A-Za-z0-9+/=]/g, '');
    let output = '';
    for (let i = 0; i < str.length; i += 4) {
      const enc1 = B64_CHARS.indexOf(str[i]);
      const enc2 = B64_CHARS.indexOf(str[i + 1]);
      const enc3 = B64_CHARS.indexOf(str[i + 2]);
      const enc4 = B64_CHARS.indexOf(str[i + 3]);
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      output += String.fromCharCode(chr1);
      if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
      if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
    }
    // Xtream text is UTF-8 encoded before base64 — decode the byte string properly.
    return decodeURIComponent(
      output
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return input;
  }
}

export function liveStreamUrl(c: XtreamCreds, streamId: number, ext: 'ts' | 'm3u8' = 'm3u8'): string {
  return `${c.server}/live/${c.username}/${c.password}/${streamId}.${ext}`;
}

export function movieStreamUrl(
  c: XtreamCreds,
  streamId: number,
  containerExtension?: string
): string {
  const ext = containerExtension || 'mp4';
  return `${c.server}/movie/${c.username}/${c.password}/${streamId}.${ext}`;
}

export function seriesEpisodeUrl(
  c: XtreamCreds,
  episodeId: number,
  containerExtension?: string
): string {
  const ext = containerExtension || 'mp4';
  return `${c.server}/series/${c.username}/${c.password}/${episodeId}.${ext}`;
}
