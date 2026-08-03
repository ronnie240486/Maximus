// Identificador de build — atualizar aqui a cada leva de correções. Usado
// na tela de MAC/login (visível ANTES de logar, pra confirmar rapidinho
// que o APK instalado é o mais novo) e em Configurações > Versão.
export const BUILD_STAMP =
  'build 2026-08-02 (17h+) — corrige teste ficando sem lista (sessão sendo ' +
  'sobrescrita), protocolo/formato da lista de teste, fallback .m3u8→.ts, ' +
  'rádios sem som/vazias, clima sem GPS na TV, banner escuro, categorias ' +
  'estreitas na TV, canal abrindo sozinho ao navegar, boas-vindas fora de ' +
  'sincronia, proteção anti-clone do APK, Perfil Infantil';

// Versão curta pra mostrar direto na tela, sem precisar tocar em nada —
// só a data/hora, pra bater o olho e já saber se é o build mais recente.
export const BUILD_SHORT = 'build 2026-08-02 17h+';
