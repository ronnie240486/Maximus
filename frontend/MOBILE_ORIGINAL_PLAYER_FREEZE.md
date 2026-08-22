# Maximus Player — Base mobile funcional congelada

Esta branch é a versão mobile baseada na fonte original que preserva o player funcional de canais, filmes e séries. O objetivo desta linha é remover conteúdo adulto de todas as listas, caches, históricos, sugestões, destaques, favoritos e aberturas de catálogo sem alterar o fluxo original de reprodução.

## Branch

`mobile-original-player-sem-adultos`

## Identidade da APK funcional usada como referência

- Aplicativo: `Maximus Player`
- Pacote: `com.interactiveplayer.app`
- VersionCode: `2`
- APK de referência instalada: `MaximusPlayer-mobile-original-player-perfis-corrigidos.apk`
- SHA-256 da APK de referência: `59e8b444e0351f554a797d12dc96760e40f06b34c647e7a8b7922107ea1e2637`

## Arquivos do player preservados

Os hashes abaixo correspondem aos arquivos do `main` original e devem permanecer iguais nesta branch:

| Arquivo | SHA-256 |
|---|---|
| `app/player.tsx` | `00f7fab75973e927150c506214d71771a19404ba3ccde1fd6b64fff7e38c7959` |
| `app/channels.tsx` | `47757ca7e15cc2769bbab3493bb436fb25e95df25ed511af9281c67fa7581fcf` |
| `app/channel-details.tsx` | `26e9bd8d1b0377d9dfb3bb87567e1eaf9f975ec9ad99aba85b3bcdf60391499d` |
| `src/components/TVChannelPreview.tsx` | `aa3b7519cff9c3ca42a95597804ec5097ae1359d68745b8003299da8b98ab36d` |

Esta branch não usa `PlayerSessionProvider` nem `usePlayerSession`.

## Filtro global

O detector em `src/lib/adult-content.ts` reconhece categorias e títulos adultos, incluindo termos como `Brasileirinhas`, `Novinhas`, `Ninfetas`, `Vazadas`, `OnlyFans`, `XXX`, `18+`, pornografia, conteúdo sexual, `Privacy`, `Hentai` e variações sem acento.

A sanitização é aplicada na camada Xtream antes do cache, aos caches persistidos de listas e Home, aos favoritos, ao histórico de reprodução, ao prefetch e à tela de Sugestões. A Home também busca as categorias para filtrar itens por `category_id` antes de montar Canais Mais Assistidos, Filmes em Alta e Séries Populares.

Conteúdo adulto não deve ser exibido em nenhuma tela, mesmo em perfil normal. O perfil infantil continua recebendo, além disso, a curadoria exclusiva de conteúdo infantil.

## Branding e perfis

O ícone do aplicativo permanece com o fundo completo original. O logo interno usa o asset transparente. A tela de perfis usa o componente `Avatar` com `Image` nativo para os JPGs locais, mantendo os avatares e a navegação de perfis da base funcional.
