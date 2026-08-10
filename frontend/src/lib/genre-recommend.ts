// Recomendação por comando de voz, sem IA/API externa — reconhece a
// palavra de gênero no que a pessoa falou ("quero assistir um filme de
// ação") e sorteia um punhado de itens do catálogo que batem com isso.
//
// Filmes: a maioria dos painéis já separa Filmes por gênero em categorias
// próprias ("Filmes | Ação", "Filmes | Comédia" etc) — casa pelo nome da
// categoria.
//
// Séries: painéis costumam separar por PLATAFORMA (Netflix, Amazon,
// Disney+...), não por gênero — casar pela categoria não funcionaria bem
// aqui. Em vez disso, usa o campo `genre` que às vezes vem preenchido
// direto na lista de séries do painel (quando o dono do painel preencheu
// isso). Se não tiver esse campo preenchido em nenhuma série, a busca de
// série simplesmente não encontra nada — melhor não achar nada do que
// mostrar sugestão errada.

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Cada gênero: um "rótulo" de exibição + uma lista de palavras que, se
// aparecerem no que a pessoa falou OU no nome da categoria/gênero do
// catálogo, indicam esse gênero.
export const GENRE_KEYWORDS: { key: string; label: string; words: string[] }[] = [
  { key: 'acao', label: 'Ação', words: ['acao', 'action'] },
  { key: 'comedia', label: 'Comédia', words: ['comedia', 'comedy'] },
  { key: 'terror', label: 'Terror', words: ['terror', 'horror'] },
  { key: 'suspense', label: 'Suspense', words: ['suspense', 'thriller'] },
  { key: 'romance', label: 'Romance', words: ['romance', 'romantico', 'romantic'] },
  { key: 'drama', label: 'Drama', words: ['drama'] },
  { key: 'aventura', label: 'Aventura', words: ['aventura', 'adventure'] },
  { key: 'ficcao', label: 'Ficção científica', words: ['ficcao cientifica', 'ficcao', 'sci-fi', 'scifi', 'sci fi'] },
  { key: 'animacao', label: 'Animação', words: ['animacao', 'animation', 'desenho'] },
  { key: 'documentario', label: 'Documentário', words: ['documentario', 'documentary'] },
  { key: 'guerra', label: 'Guerra', words: ['guerra', 'war'] },
  { key: 'crime', label: 'Crime', words: ['crime', 'policial'] },
  { key: 'fantasia', label: 'Fantasia', words: ['fantasia', 'fantasy'] },
  { key: 'musical', label: 'Musical', words: ['musical'] },
  { key: 'faroeste', label: 'Faroeste', words: ['faroeste', 'western'] },
];

/** Acha o gênero mencionado na fala (o primeiro que bater) — devolve
 * `null` se não reconhecer nenhum, pra quem chamar decidir o que fazer
 * (ex: cair pra busca de título normal). */
export function detectGenreFromSpeech(speech: string): (typeof GENRE_KEYWORDS)[number] | null {
  const n = normalize(speech);
  return GENRE_KEYWORDS.find((g) => g.words.some((w) => n.includes(w))) || null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type RecommendableMovie = { stream_id: number; name: string; stream_icon?: string; category_id?: string };
export type RecommendableSeries = { series_id: number; name: string; cover?: string; genre?: string; category_id?: string };

/** Filmes que batem com o gênero — via categoria. */
export function matchMoviesByGenre(
  genreWords: string[],
  movies: RecommendableMovie[],
  categories: { category_id: string; category_name: string }[]
): RecommendableMovie[] {
  const matchingCatIds = new Set(
    categories.filter((c) => {
      const n = normalize(c.category_name);
      return genreWords.some((w) => n.includes(w));
    }).map((c) => c.category_id)
  );
  if (matchingCatIds.size === 0) return [];
  return movies.filter((m) => m.category_id && matchingCatIds.has(m.category_id));
}

/** Séries que batem com o gênero — via campo `genre` (não categoria, ver
 * comentário no topo do arquivo). Também tenta a categoria como reforço,
 * caso esse painel específico realmente separe séries por gênero. */
export function matchSeriesByGenre(
  genreWords: string[],
  series: RecommendableSeries[],
  categories: { category_id: string; category_name: string }[]
): RecommendableSeries[] {
  const byGenreField = series.filter((s) => {
    if (!s.genre) return false;
    const n = normalize(s.genre);
    return genreWords.some((w) => n.includes(w));
  });

  const matchingCatIds = new Set(
    categories.filter((c) => {
      const n = normalize(c.category_name);
      return genreWords.some((w) => n.includes(w));
    }).map((c) => c.category_id)
  );
  const byCategoryField =
    matchingCatIds.size > 0 ? series.filter((s) => s.category_id && matchingCatIds.has(s.category_id)) : [];

  const seen = new Set<number>();
  const combined: RecommendableSeries[] = [];
  for (const s of [...byGenreField, ...byCategoryField]) {
    if (!seen.has(s.series_id)) {
      seen.add(s.series_id);
      combined.push(s);
    }
  }
  return combined;
}

/** Sorteia até `count` itens de um pool — usado tanto pra montar a lista
 * inicial quanto pro botão "Outras sugestões" (sorteia de novo). */
export function pickRandom<T>(pool: T[], count = 20): T[] {
  return shuffle(pool).slice(0, count);
}
