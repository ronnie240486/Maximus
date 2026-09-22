// Placeholder visual pros pôsteres/capas enquanto a imagem real carrega.
//
// O painel Xtream não manda um blurhash calculado por imagem (isso
// precisaria ser gerado a partir do arquivo original, coisa que exigiria
// processamento — no cliente seria lento, no servidor exigiria mudar o
// painel, que não é nosso). Então isso aqui é um blurhash FIXO — um
// cinza-azulado suave, combinando com o tema escuro do app — não estima
// a cor real de cada pôster individualmente, mas já resolve o problema
// que motivou o pedido: em vez de "nada (preto) → estoura a imagem", vira
// "cinza suave → esmaece pra imagem", sensação de carregamento bem mais
// leve mesmo sem o dado por-imagem.
export const POSTER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// Props prontas pra passar num <Image> do expo-image em qualquer poster/
// capa da lista — mantém consistência (mesmo placeholder, mesma
// transição) sem repetir os três props em cada tela.
export const posterImageProps = {
  placeholder: { blurhash: POSTER_BLURHASH },
  placeholderContentFit: 'cover' as const,
  transition: 200,
};

// Muitos painéis IPTV cadastram o logo do canal apontando pro Imgur (é
// grátis e fácil de colar um link lá). O problema: o Imgur bloqueia
// hotlink de app/terceiro há alguns anos — em vez de dar erro de rede
// (que a gente conseguiria pegar com onError), ele responde com SUCESSO
// (HTTP 200) só que devolvendo uma IMAGEM de aviso, tipo "The image you
// are requesting does not exist" — pro app isso parece uma imagem válida
// e normal, só que é literalmente essa imagem de erro do Imgur aparecendo
// no lugar do logo do canal. Como app nenhum consegue "adivinhar" isso só
// olhando os bytes sem baixar e comparar a imagem inteira, a saída mais
// simples e confiável é: qualquer ícone hospedado no Imgur já nasce
// tratado como indisponível, e o app cai direto pro ícone de fallback
// (sem nem tentar carregar) em vez de mostrar essa imagem de erro.
export function isUnreliableIconHost(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'imgur.com' || host.endsWith('.imgur.com');
  } catch {
    return false;
  }
}
