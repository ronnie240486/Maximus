import { getXtream } from '@/src/state/session';
import { xtream, XtreamCategory, XtreamMovie, XtreamSeries } from '@/src/lib/xtream';
import { filterOutAdultCategories, filterOutAdultItems, filterOutAdultTitles } from '@/src/lib/adult-content';
import { dedupeByName } from '@/src/lib/dedupe';
import { saveListCache } from '@/src/state/list-cache';
import { saveHomeCache, saveFeaturedCache } from '@/src/state/home-cache';

let prefetchStarted = false;

/**
 * Dispara em segundo plano (sem travar navegação nenhuma) a mesma busca de
 * canais/filmes/séries que a Home faz — só que começando aqui, na tela de
 * boas-vindas, bem antes da Home existir na tela. Enquanto a pessoa ainda
 * está vendo o "Bem-vindo..." e depois escolhendo o perfil, os dados já
 * estão chegando e sendo salvos no cache. Quando a Home realmente monta,
 * `loadHomeCache()` já encontra tudo pronto — a primeira abertura deixa de
 * ser a mais lenta.
 *
 * Só roda uma vez por sessão do app (evita repetir a mesma busca cara se
 * a pessoa voltar pra tela de boas-vindas por algum motivo).
 */
export function prefetchHomeContent(): void {
  if (prefetchStarted) return;
  const creds = getXtream();
  if (!creds) return;
  prefetchStarted = true;

  (async () => {
    try {
      const [live, movies, series, liveCats, movieCats, seriesCats] = await Promise.all([
        xtream.liveStreams(creds).catch(() => null),
        xtream.vodStreams(creds).catch(() => null),
        xtream.seriesList(creds).catch(() => null),
        xtream.liveCategories(creds).catch(() => null),
        xtream.vodCategories(creds).catch(() => null),
        xtream.seriesCategories(creds).catch(() => null),
      ]);
      const safeLiveCats = filterOutAdultCategories((liveCats || []) as XtreamCategory[]);
      const safeMovieCats = filterOutAdultCategories((movieCats || []) as XtreamCategory[]);
      const safeSeriesCats = filterOutAdultCategories((seriesCats || []) as XtreamCategory[]);
      const safeLive = filterOutAdultTitles(filterOutAdultItems(live || [], liveCats || []));
      const safeMovies = filterOutAdultTitles(filterOutAdultItems(movies || [], movieCats || []));
      const safeSeries = filterOutAdultTitles(filterOutAdultItems(series || [], seriesCats || []));

      if (safeLive.length) {
        saveListCache('channels', safeLiveCats, safeLive);
      }
      if (safeMovies.length) {
        saveListCache('movies', safeMovieCats, safeMovies);
      }
      if (safeSeries.length) {
        saveListCache('series', safeSeriesCats, safeSeries);
      }

      const sections: Record<string, { title: string; items: any[] }> = {};
      if (safeLive.length) {
        sections.live = {
          title: 'CANAIS AO VIVO',
          items: dedupeByName(safeLive).slice(0, 20).map((c) => ({
            id: `live-${c.stream_id}`,
            name: c.name,
            logo: c.stream_icon || undefined,
            stream: '',
          })),
        };
      }
      if (safeMovies.length) {
        sections.movies = {
          title: 'FILMES EM ALTA',
          items: dedupeByName(safeMovies).slice(0, 20).map((m: XtreamMovie) => ({
            id: `movie-${m.stream_id}`,
            name: m.name,
            logo: m.stream_icon || undefined,
            stream: '',
          })),
        };
      }
      if (safeSeries.length) {
        sections.series = {
          title: 'SÉRIES POPULARES',
          items: dedupeByName(safeSeries).slice(0, 20).map((s: XtreamSeries) => ({
            id: `series-${s.series_id}`,
            name: s.name,
            logo: s.cover || undefined,
            stream: '',
            seriesId: s.series_id,
            cover: s.cover || undefined,
          })),
        };
      }
      if (Object.keys(sections).length) {
        saveHomeCache(sections as any);
      }

      if (safeMovies.length || safeSeries.length) {
        const movieEntries = dedupeByName(safeMovies)
          .slice(0, 15)
          .map((m: XtreamMovie) => ({ kind: 'movie' as const, id: m.stream_id, name: m.name, cover: m.stream_icon }));
        const seriesEntries = dedupeByName(safeSeries)
          .slice(0, 15)
          .map((s: XtreamSeries) => ({ kind: 'series' as const, id: s.series_id, name: s.name, cover: s.cover }));
        const combined = [...movieEntries, ...seriesEntries];
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }
        saveFeaturedCache(combined.slice(0, 12) as any);
      }
    } catch {
      // Falhou o pré-carregamento? Sem problema — a Home tenta de novo do
      // jeito normal quando montar, só perde o "atalho" dessa vez.
    }
  })();
}
