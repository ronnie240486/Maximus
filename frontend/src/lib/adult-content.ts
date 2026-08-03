// There's no explicit "is_adult" flag in the Xtream API — panels mark adult
// content purely by category naming convention. We match common keywords
// (PT-BR and EN) case/accent-insensitively against the category name.

const ADULT_KEYWORDS = [
  'adulto',
  'adultos',
  '+18',
  '18+',
  'xxx',
  'adult',
  'porn',
  'sexo',
  'erotic',
  'erótico',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents
}

export function isAdultCategoryName(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  const n = normalize(categoryName);
  return ADULT_KEYWORDS.some((kw) => n.includes(normalize(kw)));
}

// Palavras que costumam aparecer em categorias feitas pra criança de
// verdade. Perfil infantil não é só "sem conteúdo adulto" — é só
// conteúdo QUE PARECE ser infantil mesmo, senão continuaria mostrando
// ação, terror, drama pesado etc., só sem a categoria "+18" explícita.
const KIDS_KEYWORDS = [
  'infantil',
  'infantis',
  'kids',
  'kid ',
  'crianca',
  'criancas',
  'desenho',
  'desenhos',
  'animacao',
  'animacoes',
  'cartoon',
  'anime kids',
  'familia',
  'família',
  'disney',
  'nickelodeon',
  'nick jr',
  'cartoon network',
  'gloob',
  'discovery kids',
  'baby',
  'bebe',
  'bebes',
  'juvenil',
];

export function isKidsCategoryName(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  const n = normalize(categoryName);
  return KIDS_KEYWORDS.some((kw) => n.includes(normalize(kw)));
}

// Usados pelas telas de conteúdo (Canais, Filmes, Séries) quando o perfil
// ativo é infantil — nesse caso o conteúdo adulto não é só bloqueado por
// PIN, ele simplesmente não existe: nem a categoria aparece na lista, nem
// os itens dela aparecem em "Todos".
export function filterOutAdultCategories<T extends { category_name: string }>(
  categories: T[]
): T[] {
  return categories.filter((c) => !isAdultCategoryName(c.category_name));
}

export function filterOutAdultItems<T extends { category_id?: string | number }>(
  items: T[],
  categories: { category_id: string | number; category_name: string }[]
): T[] {
  const adultIds = new Set(
    categories.filter((c) => isAdultCategoryName(c.category_name)).map((c) => String(c.category_id))
  );
  if (adultIds.size === 0) return items;
  return items.filter((i) => !adultIds.has(String(i.category_id)));
}

// Curadoria de verdade pro perfil infantil: só deixa passar categorias
// que PARECEM ser feitas pra criança (bate com KIDS_KEYWORDS) — e, por
// segurança extra, exclui de novo qualquer uma que também bata com
// palavra de conteúdo adulto (evita um caso estranho tipo categoria mal
// nomeada que bata nas duas listas ao mesmo tempo).
export function filterToKidsCategories<T extends { category_name: string }>(
  categories: T[]
): T[] {
  return categories.filter(
    (c) => isKidsCategoryName(c.category_name) && !isAdultCategoryName(c.category_name)
  );
}

export function filterToKidsItems<T extends { category_id?: string | number }>(
  items: T[],
  categories: { category_id: string | number; category_name: string }[]
): T[] {
  const kidsIds = new Set(
    categories
      .filter((c) => isKidsCategoryName(c.category_name) && !isAdultCategoryName(c.category_name))
      .map((c) => String(c.category_id))
  );
  if (kidsIds.size === 0) return [];
  return items.filter((i) => kidsIds.has(String(i.category_id)));
}
