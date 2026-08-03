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
