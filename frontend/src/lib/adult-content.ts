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
